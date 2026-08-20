import { createSessionCookies, clearFlowCookie } from "../session";

export const runtime = "edge";

function redirect(request: Request, params: Record<string, string>, cookies: string[] = []) {
  const url = new URL("/", request.url);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const headers = new Headers({ Location: url.toString(), "Cache-Control": "no-store" });
  cookies.forEach((value) => headers.append("Set-Cookie", value));
  return new Response(null, { status: 302, headers });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accessToken = url.searchParams.get("access_token") || "";
  const refreshToken = url.searchParams.get("refresh_token") || "";
  const expiresIn = Number(url.searchParams.get("expires_in")) || 7200;
  const refreshExpiresIn = Number(url.searchParams.get("refresh_expires_in")) || 2592000;
  const name = url.searchParams.get("name") || "已登录用户";
  const clearFlow = clearFlowCookie(request);

  if (!accessToken) {
    return redirect(request, { feishuError: "飞书登录失败：未收到 access_token。" }, [clearFlow]);
  }

  try {
    const now = Date.now();
    const tokens = {
      accessToken,
      accessExpiresAt: now + expiresIn * 1000,
      refreshToken,
      refreshExpiresAt: now + refreshExpiresIn * 1000,
    };
    const cookies = await createSessionCookies(request, tokens, name);
    return redirect(request, { feishu: "connected" }, [clearFlow, ...cookies]);
  } catch (error) {
    console.error("[feishu-oauth-complete] error:", error);
    const message = error instanceof Error ? error.message : "飞书登录失败。";
    return redirect(request, { feishuError: message.slice(0, 180) }, [clearFlow]);
  }
}
