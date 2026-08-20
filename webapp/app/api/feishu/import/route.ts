import { getFeishuUserSession } from "../oauth/session";

export const runtime = "edge";

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function jsonResponse(body: unknown, status = 200, cookies: string[] = []) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  cookies.forEach((value) => headers.append("Set-Cookie", value));
  return Response.json(body, { status, headers });
}

export async function POST(request: Request) {
  let sourceUrl = "";
  try {
    if (Number(request.headers.get("content-length") || 0) > 10_000) return jsonResponse({ error: "请求内容过大。" }, 413);
    const body = object(await request.json());
    sourceUrl = typeof body?.url === "string" ? body.url.trim() : "";
    if (!sourceUrl) return jsonResponse({ error: "请输入飞书表格链接。" }, 400);
  } catch {
    return jsonResponse({ error: "请求格式无效。" }, 400);
  }

  return doRedirect(request, sourceUrl);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sourceUrl = url.searchParams.get("url") || "";
  if (!sourceUrl) return jsonResponse({ error: "请输入飞书表格链接。" }, 400);
  return doRedirect(request, sourceUrl);
}

function doRedirect(request: Request, sourceUrl: string) {
  try {
    return getFeishuUserSession(request).then((session) => {
      if (!session) return jsonResponse({ error: "请先登录飞书后再读取表格。", code: "FEISHU_LOGIN_REQUIRED" }, 401);

      const proxyUrl = new URL("http://127.0.0.1:3999/import");
      proxyUrl.searchParams.set("token", session.accessToken);
      proxyUrl.searchParams.set("url", sourceUrl);
      const headers = new Headers({ Location: proxyUrl.toString(), "Cache-Control": "no-store" });
      session.setCookies.forEach((value) => headers.append("Set-Cookie", value));
      return new Response(null, { status: 302, headers });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取飞书表格失败。";
    if (message === "FEISHU_NOT_CONFIGURED") {
      return jsonResponse({ error: "飞书尚未配置，请先填写 FEISHU_APP_ID 和 FEISHU_APP_SECRET。", code: message }, 503);
    }
    const isPermissionError = /permission|权限|forbidden|denied/i.test(message);
    return jsonResponse({ error: isPermissionError ? `飞书没有访问该表格的权限：${message}` : message }, isPermissionError ? 403 : 502);
  }
}
