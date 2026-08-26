import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { projects, milestones } from "../../../../db/schema";
import type { Project, Milestone } from "../../../../app/types";

export const runtime = "edge";

type RawProject = typeof projects.$inferSelect;
type RawMilestone = typeof milestones.$inferSelect;

function toProject(row: RawProject, msRows: RawMilestone[]): Project {
  return {
    uuid: row.uuid,
    name: row.name,
    tag: row.tag || "",
    detailRemark: row.detailRemark || "",
    bgColor: row.bgColor || "#0d4f4a",
    textColor: row.textColor || "#a7f3d0",
    milestones: msRows.map(toMilestone),
    viewId: row.viewId,
    rowHeight: row.rowHeight ?? undefined,
    showSeparatorAbove: row.showSeparatorAbove ?? undefined,
  };
}

function toMilestone(row: RawMilestone): Milestone {
  return {
    id: row.id,
    iteration: row.iteration || "",
    releaseDate: row.releaseDate || "",
    remark: row.remark || "",
    detailRemark: row.detailRemark || "",
    color: row.color || "green",
    textColor: row.textColor || "#1a1a1a",
    shape: row.shape || "diamond",
    week: row.week ?? undefined,
    year: row.year ?? undefined,
  };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  const expectedToken = process.env.FEISHU_WEBHOOK_TOKEN;
  if (!expectedToken) {
    return Response.json({ error: "Webhook token not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (token !== expectedToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  let db;
  try {
    db = getDb();
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Database unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const projectRows = await db.select().from(projects);
  const milestoneRows = await db.select().from(milestones);

  const msByProject = new Map<string, RawMilestone[]>();
  for (const ms of milestoneRows) {
    const list = msByProject.get(ms.projectId);
    if (list) list.push(ms);
    else msByProject.set(ms.projectId, [ms]);
  }

  const projectList: Project[] = projectRows.map((p) =>
    toProject(p, (msByProject.get(p.uuid) || []).sort((a, b) => (a.releaseDate || "9999").localeCompare(b.releaseDate || "9999"))),
  );

  projectList.sort((a, b) => a.name.localeCompare(b.name, "zh"));

  const allDates = milestoneRows
    .map((m) => m.releaseDate)
    .filter(Boolean)
    .sort();
  const startDate = allDates[0] || "2026-01-01";
  const endDate = allDates[allDates.length - 1] || "2028-12-31";

  return Response.json({
    projects: projectList,
    count: projectList.length,
    milestoneCount: milestoneRows.length,
    startDate,
    endDate,
    syncedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
