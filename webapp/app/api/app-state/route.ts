import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { appState } from "../../../db/schema";

export const runtime = "edge";

function checkToken(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const expectedToken = process.env.FEISHU_WEBHOOK_TOKEN;
  if (!expectedToken) {
    return { error: Response.json({ error: "Token not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } }) };
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

  try {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS app_state (id TEXT PRIMARY KEY DEFAULT 'default', data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL)`);
  } catch {
    // Table might already exist or creation not supported, ignore
  }

  const rows = await db.select().from(appState).where(eq(appState.id, "default")).limit(1);

  if (rows.length === 0) {
    return Response.json({ data: null }, { headers: { "Cache-Control": "no-store" } });
  }

  return Response.json({ data: rows[0].data, updatedAt: rows[0].updatedAt }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const auth = checkToken(request);
  if (auth.error) return auth.error;

  let body: { data: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  if (!body.data) {
    return Response.json({ error: "Missing data." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  let db;
  try {
    db = getDb();
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Database unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS app_state (id TEXT PRIMARY KEY DEFAULT 'default', data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL)`);
  } catch {
    // Table might already exist, ignore
  }

  const existing = await db.select().from(appState).where(eq(appState.id, "default")).limit(1);

  if (existing.length > 0) {
    await db.update(appState).set({
      data: body.data,
      updatedAt: new Date(),
    }).where(eq(appState.id, "default"));
  } else {
    await db.insert(appState).values({
      id: "default",
      data: body.data,
    });
  }

  return Response.json({ ok: true, updatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
