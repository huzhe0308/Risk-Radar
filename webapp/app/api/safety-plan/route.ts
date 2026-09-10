import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { appState } from "../../../db/schema";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const KEY = "safety-plan-data";

async function ensureTable(db: ReturnType<typeof getDb>) {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS app_state (id TEXT PRIMARY KEY DEFAULT 'default', data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL)`);
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const expected = process.env.FEISHU_WEBHOOK_TOKEN;
  if (!expected || token !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  let db;
  try {
    db = getDb();
    await ensureTable(db);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "DB unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const rows = await db.select().from(appState).where(eq(appState.id, KEY)).limit(1);
  if (rows.length === 0) {
    return Response.json({ data: null }, { headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ data: rows[0].data, updatedAt: rows[0].updatedAt }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const expected = process.env.FEISHU_WEBHOOK_TOKEN;
  if (!expected || token !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  let body: { data: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (!body.data) {
    return Response.json({ error: "Missing data" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  let db;
  try {
    db = getDb();
    await ensureTable(db);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "DB unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const existing = await db.select().from(appState).where(eq(appState.id, KEY)).limit(1);
  if (existing.length > 0) {
    await db.update(appState).set({ data: body.data, updatedAt: new Date() }).where(eq(appState.id, KEY));
  } else {
    await db.insert(appState).values({ id: KEY, data: body.data });
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
