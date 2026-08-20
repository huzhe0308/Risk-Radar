import {
  clearFlowCookie,
  readFlow,
} from "../session";

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
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const oauthError = url.searchParams.get("error") || "";
  const flow = await readFlow(request);
  const clearFlow = clearFlowCookie(request);

  if (oauthError) return redirect(request, { feishuError: oauthError === "access_denied" ? "你取消了飞书授权。" : `飞书授权失败：${oauthError}` }, [clearFlow]);
  if (!code || !state || !flow || flow.expiresAt <= Date.now() || state !== flow.state) {
    return redirect(request, { feishuError: "飞书登录状态已失效，请重新登录。" }, [clearFlow]);
  }

  const proxyUrl = new URL("http://127.0.0.1:3999/oauth-exchange");
  proxyUrl.searchParams.set("code", code);
  proxyUrl.searchParams.set("verifier", flow.verifier);
  proxyUrl.searchParams.set("redirect_uri", `${url.origin}/api/feishu/oauth/callback`);
  return new Response(null, { status: 302, headers: { Location: proxyUrl.toString(), "Cache-Control": "no-store" } });
}
