import { getFeishuUserSession, getOAuthConfig } from "../session";

export const runtime = "edge";

export async function GET(request: Request) {
  let redirectUri = "";
  try {
    redirectUri = getOAuthConfig(request).redirectUri;
    const session = await getFeishuUserSession(request);
    const headers = new Headers({ "Cache-Control": "no-store" });
    session?.setCookies.forEach((value) => headers.append("Set-Cookie", value));
    return Response.json({ connected: Boolean(session), name: session?.name || "", redirectUri }, { headers });
  } catch (error) {
    const notConfigured = error instanceof Error && error.message === "FEISHU_NOT_CONFIGURED";
    return Response.json({ connected: false, name: "", redirectUri, configured: !notConfigured }, {
      status: notConfigured ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
