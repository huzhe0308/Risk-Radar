import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { syncRecords, projects, milestones } from "../../../../db/schema";

export const runtime = "edge";

function checkToken(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const expectedToken = process.env.FEISHU_WEBHOOK_TOKEN;
  if (!expectedToken) {
    return { error: Response.json({ error: "Webhook token not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } }) };
  }
  if (token !== expectedToken) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } }) };
  }
  return { error: null };
}

export async function GET(request: Request): Promise<Response> {
  const auth = checkToken(request);
  if (auth.error) return auth.error;

  let db;
  try {
    db = getDb();
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Database unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const rows = await db
    .select()
    .from(syncRecords)
    .orderBy(desc(syncRecords.receivedAt))
    .limit(200);

  const records = rows.map((r) => ({
    id: r.id,
    recordId: r.recordId,
    tableId: r.tableId,
    action: r.action,
    payloadHash: r.payloadHash,
    rawPayload: r.rawPayload,
    receivedAt: r.receivedAt,
    processed: r.processed,
    error: r.error,
  }));

  const fieldNamesSet = new Set<string>();
  for (const r of records) {
    const payload = r.rawPayload as Record<string, unknown> | null;
    if (!payload) continue;
    const fields = payload.fields;
    if (fields && typeof fields === "object" && !Array.isArray(fields)) {
      for (const key of Object.keys(fields as Record<string, unknown>)) {
        fieldNamesSet.add(key);
      }
    } else {
      for (const key of Object.keys(payload)) {
        if (!["record_id", "recordId", "table_id", "tableId", "action", "event_type", "type_event", "type", "record_type", "fields"].includes(key)) {
          fieldNamesSet.add(key);
        }
      }
    }
  }

  const tablesMap = new Map<string, number>();
  for (const r of records) {
    const key = r.tableId || "(未知表格)";
    tablesMap.set(key, (tablesMap.get(key) || 0) + 1);
  }
  const tables = Array.from(tablesMap.entries())
    .map(([tableId, count]) => ({ tableId, count }))
    .sort((a, b) => b.count - a.count);

  return Response.json({
    records,
    fieldNames: Array.from(fieldNamesSet).sort(),
    tables,
    count: records.length,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request): Promise<Response> {
  const auth = checkToken(request);
  if (auth.error) return auth.error;

  let body: { id?: number; recordId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const rowId = body.id;
  if (!rowId) {
    return Response.json({ error: "Missing id." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  let db;
  try {
    db = getDb();
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Database unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  await db.delete(syncRecords).where(eq(syncRecords.id, rowId));

  return Response.json({ ok: true, id: rowId }, { headers: { "Cache-Control": "no-store" } });
}
