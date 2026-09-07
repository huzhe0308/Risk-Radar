import { getDb } from "../../../../db";
import { syncRecords } from "../../../../db/schema";

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

type ImportRow = {
  recordId: string;
  fields: Record<string, unknown>;
};

export async function POST(request: Request): Promise<Response> {
  const auth = checkToken(request);
  if (auth.error) return auth.error;

  let body: { tableName: string; rows: ImportRow[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  if (!body.tableName || !body.rows || !Array.isArray(body.rows) || body.rows.length === 0) {
    return Response.json({ error: "Missing tableName or rows." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  let db;
  try {
    db = getDb();
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Database unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  let inserted = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of body.rows) {
    try {
      const payload = {
        record_id: row.recordId,
        type: body.tableName,
        action: "create",
        fields: row.fields,
      };

      await db.insert(syncRecords).values({
        recordId: row.recordId,
        tableId: body.tableName,
        action: "create",
        payloadHash: null,
        rawPayload: payload,
        processed: true,
      });
      inserted++;
    } catch (err) {
      failed++;
      if (errors.length < 5) {
        errors.push(err instanceof Error ? err.message : "Unknown error");
      }
    }
  }

  return Response.json({
    ok: true,
    tableName: body.tableName,
    inserted,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  }, { headers: { "Cache-Control": "no-store" } });
}
