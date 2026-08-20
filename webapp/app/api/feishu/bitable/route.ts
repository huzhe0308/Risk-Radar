import { getFeishuUserSession } from "../oauth/session";

export const runtime = "edge";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const appToken = url.searchParams.get("app_token") || "";

  try {
    const session = await getFeishuUserSession(request);
    if (!session) {
      return Response.json({ error: "请先登录飞书后再读取多维表格。", code: "FEISHU_LOGIN_REQUIRED" }, { status: 401 });
    }

    const proxyUrl = new URL("http://127.0.0.1:3999/bitable");
    proxyUrl.searchParams.set("token", session.accessToken);
    proxyUrl.searchParams.set("app_token", appToken);

    const headers = new Headers({ Location: proxyUrl.toString(), "Cache-Control": "no-store" });
    session.setCookies.forEach((value) => headers.append("Set-Cookie", value));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取多维表格失败。";
    return Response.json({ error: message }, { status: 502 });
  }
}
