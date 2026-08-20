import { clearSessionCookies } from "../session";

export const runtime = "edge";

export async function POST(request: Request) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  clearSessionCookies(request).forEach((value) => headers.append("Set-Cookie", value));
  return Response.json({ ok: true }, { headers });
}
