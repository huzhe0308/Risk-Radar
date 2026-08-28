import { eq } from "drizzle-orm";
import { getDb, type Database } from "../../../../db";
import { projects, milestones, syncRecords } from "../../../../db/schema";
import {
  mapToMilestone,
  mapToProject,
  normalizePayload,
  type NormalizedPayload,
} from "../../../feishu/field-mapping";

export const runtime = "edge";

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const expectedToken = process.env.FEISHU_WEBHOOK_TOKEN;
  if (!expectedToken) {
    return json({ error: "Webhook token not configured. Set FEISHU_WEBHOOK_TOKEN." }, 503);
  }

  const token = request.headers.get("x-webhook-token");
  if (token !== expectedToken) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const payload = normalizePayload(body);
  if (!payload.recordId) {
    const fields = payload.fields as Record<string, unknown>;
    const fallbackRaw = fields["项目ID"] || fields["项目名称"] || fields["project_id"] || fields["name"];
    payload.recordId = fallbackRaw != null ? String(fallbackRaw).trim() : `auto_${Date.now()}`;
  }

  const payloadHash = await sha256(JSON.stringify(body));
  let db;
  try {
    db = getDb();
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Database unavailable." }, 503);
  }

  const existing = await db
    .select()
    .from(syncRecords)
    .where(eq(syncRecords.recordId, payload.recordId))
    .limit(1);

  if (existing.length > 0 && existing[0].payloadHash === payloadHash && existing[0].processed) {
    return json({
      ok: true,
      skipped: true,
      reason: "duplicate",
      recordId: payload.recordId,
    });
  }

  try {
    if (payload.action === "delete") {
      await handleDelete(db, payload);
    } else if (payload.type === "project") {
      await upsertProject(db, payload);
    } else {
      await upsertMilestone(db, payload);
    }

    if (existing.length > 0) {
      await db
        .update(syncRecords)
        .set({ payloadHash, processed: true, error: null, receivedAt: new Date() })
        .where(eq(syncRecords.recordId, payload.recordId));
    } else {
      await db.insert(syncRecords).values({
        recordId: payload.recordId,
        tableId: payload.tableId || null,
        action: payload.action,
        payloadHash,
        rawPayload: body,
        processed: true,
      });
    }

    return json({
      ok: true,
      recordId: payload.recordId,
      type: payload.type,
      action: payload.action,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (existing.length > 0) {
      await db
        .update(syncRecords)
        .set({ payloadHash, processed: false, error: message })
        .where(eq(syncRecords.recordId, payload.recordId));
    } else {
      await db.insert(syncRecords).values({
        recordId: payload.recordId,
        tableId: payload.tableId || null,
        action: payload.action,
        payloadHash,
        rawPayload: body,
        processed: false,
        error: message,
      });
    }

    return json({ error: message, recordId: payload.recordId }, 500);
  }
}

async function upsertProject(db: Database, payload: NormalizedPayload): Promise<void> {
  const mapped = mapToProject(payload);
  const now = new Date();

  const uuid = mapped.uuid || payload.recordId;
  const existingByFeishu = await db
    .select()
    .from(projects)
    .where(eq(projects.feishuRecordId, payload.recordId))
    .limit(1);

  if (existingByFeishu.length > 0) {
    await db
      .update(projects)
      .set({
        name: mapped.name ?? existingByFeishu[0].name,
        tag: mapped.tag ?? existingByFeishu[0].tag,
        detailRemark: mapped.detailRemark ?? existingByFeishu[0].detailRemark,
        viewId: mapped.viewId ?? existingByFeishu[0].viewId,
        bgColor: mapped.bgColor ?? existingByFeishu[0].bgColor,
        textColor: mapped.textColor ?? existingByFeishu[0].textColor,
        rowHeight: mapped.rowHeight ?? existingByFeishu[0].rowHeight,
        showSeparatorAbove: mapped.showSeparatorAbove ?? existingByFeishu[0].showSeparatorAbove,
        syncedAt: now,
        updatedAt: now,
      })
      .where(eq(projects.uuid, existingByFeishu[0].uuid));
    return;
  }

  const existingByUuid = await db
    .select()
    .from(projects)
    .where(eq(projects.uuid, uuid))
    .limit(1);

  if (existingByUuid.length > 0) {
    await db
      .update(projects)
      .set({
        name: mapped.name ?? existingByUuid[0].name,
        tag: mapped.tag ?? existingByUuid[0].tag,
        detailRemark: mapped.detailRemark ?? existingByUuid[0].detailRemark,
        viewId: mapped.viewId ?? existingByUuid[0].viewId,
        bgColor: mapped.bgColor ?? existingByUuid[0].bgColor,
        textColor: mapped.textColor ?? existingByUuid[0].textColor,
        feishuRecordId: payload.recordId,
        syncedAt: now,
        updatedAt: now,
      })
      .where(eq(projects.uuid, uuid));
    return;
  }

  await db.insert(projects).values({
    uuid,
    viewId: mapped.viewId || "Default",
    name: mapped.name || "Untitled",
    tag: mapped.tag || "",
    detailRemark: mapped.detailRemark || "",
    bgColor: mapped.bgColor || null,
    textColor: mapped.textColor || null,
    rowHeight: mapped.rowHeight ?? null,
    showSeparatorAbove: mapped.showSeparatorAbove ?? null,
    feishuRecordId: payload.recordId,
    syncedAt: now,
  });
}

async function upsertMilestone(db: Database, payload: NormalizedPayload): Promise<void> {
  const mapped = mapToMilestone(payload);
  const now = new Date();

  if (!mapped.projectId) {
    throw new Error("Milestone payload must include a project reference (project_id / 所属项目).");
  }

  const projectRow = await db
    .select()
    .from(projects)
    .where(eq(projects.uuid, mapped.projectId))
    .limit(1);

  let projectUuid = mapped.projectId;
  if (projectRow.length === 0) {
    const byFeishu = await db
      .select()
      .from(projects)
      .where(eq(projects.feishuRecordId, mapped.projectId))
      .limit(1);
    if (byFeishu.length > 0) {
      projectUuid = byFeishu[0].uuid;
    } else {
      await db.insert(projects).values({
        uuid: mapped.projectId,
        viewId: "Default",
        name: mapped.projectId,
        tag: "",
        detailRemark: "",
        bgColor: null,
        textColor: null,
        rowHeight: null,
        showSeparatorAbove: null,
        feishuRecordId: null,
        syncedAt: now,
      });
      projectUuid = mapped.projectId;
    }
  }

  const msId = mapped.id || payload.recordId;

  const existingByFeishu = await db
    .select()
    .from(milestones)
    .where(eq(milestones.feishuRecordId, payload.recordId))
    .limit(1);

  if (existingByFeishu.length > 0) {
    await db
      .update(milestones)
      .set({
        iteration: mapped.iteration ?? existingByFeishu[0].iteration,
        releaseDate: mapped.releaseDate ?? existingByFeishu[0].releaseDate,
        remark: mapped.remark ?? existingByFeishu[0].remark,
        detailRemark: mapped.detailRemark ?? existingByFeishu[0].detailRemark,
        color: mapped.color ?? existingByFeishu[0].color,
        textColor: mapped.textColor ?? existingByFeishu[0].textColor,
        shape: mapped.shape ?? existingByFeishu[0].shape,
        week: mapped.week ?? existingByFeishu[0].week,
        year: mapped.year ?? existingByFeishu[0].year,
        projectId: projectUuid,
        syncedAt: now,
        updatedAt: now,
      })
      .where(eq(milestones.id, existingByFeishu[0].id));
    return;
  }

  const existingById = await db
    .select()
    .from(milestones)
    .where(eq(milestones.id, msId))
    .limit(1);

  if (existingById.length > 0) {
    await db
      .update(milestones)
      .set({
        iteration: mapped.iteration ?? existingById[0].iteration,
        releaseDate: mapped.releaseDate ?? existingById[0].releaseDate,
        remark: mapped.remark ?? existingById[0].remark,
        detailRemark: mapped.detailRemark ?? existingById[0].detailRemark,
        color: mapped.color ?? existingById[0].color,
        textColor: mapped.textColor ?? existingById[0].textColor,
        shape: mapped.shape ?? existingById[0].shape,
        week: mapped.week ?? existingById[0].week,
        year: mapped.year ?? existingById[0].year,
        projectId: projectUuid,
        feishuRecordId: payload.recordId,
        syncedAt: now,
        updatedAt: now,
      })
      .where(eq(milestones.id, msId));
    return;
  }

  await db.insert(milestones).values({
    id: msId,
    projectId: projectUuid,
    iteration: mapped.iteration || "",
    releaseDate: mapped.releaseDate || "",
    remark: mapped.remark || "",
    detailRemark: mapped.detailRemark || "",
    color: mapped.color || null,
    textColor: mapped.textColor || null,
    shape: mapped.shape || "diamond",
    week: mapped.week ?? null,
    year: mapped.year ?? null,
    feishuRecordId: payload.recordId,
    syncedAt: now,
  });
}

async function handleDelete(db: Database, payload: NormalizedPayload): Promise<void> {
  await db.delete(milestones).where(eq(milestones.feishuRecordId, payload.recordId));
  await db.delete(projects).where(eq(projects.feishuRecordId, payload.recordId));
}
