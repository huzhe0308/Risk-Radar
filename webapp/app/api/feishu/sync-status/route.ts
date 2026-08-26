import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { projects, milestones, syncRecords } from "../../../../db/schema";

export const runtime = "edge";

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

  const recentSyncs = await db
    .select()
    .from(syncRecords)
    .orderBy(desc(syncRecords.receivedAt))
    .limit(20);

  const projectCount = await db.select({ count: sql<number>`count(*)::int` }).from(projects);
  const milestoneCount = await db.select({ count: sql<number>`count(*)::int` }).from(milestones);
  const syncedProjectCount = await db.select({ count: sql<number>`count(*)::int` }).from(projects).where(sql`feishu_record_id is not null`);

  return Response.json({
    projects: projectCount[0]?.count ?? 0,
    milestones: milestoneCount[0]?.count ?? 0,
    syncedProjects: syncedProjectCount[0]?.count ?? 0,
    recentSyncs: recentSyncs.map((r) => ({
      recordId: r.recordId,
      action: r.action,
      processed: r.processed,
      error: r.error,
      receivedAt: r.receivedAt,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
