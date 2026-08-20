import { createFlowCookie, getOAuthConfig, randomBase64Url, sha256Base64Url } from "../session";

export const runtime = "edge";

const AUTHORIZE_ENDPOINT = "https://accounts.feishu.cn/open-apis/authen/v1/authorize";
const SCOPES = "sheets:spreadsheet:readonly wiki:wiki:readonly drive:drive:readonly bitable:app:readonly offline_access";

export async function GET(request: Request) {
  try {
    const { appId, redirectUri } = getOAuthConfig(request);
    const state = randomBase64Url();
    const verifier = randomBase64Url(64);
    const params = new URLSearchParams({
      client_id: appId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: SCOPES,
      state,
      code_challenge: await sha256Base64Url(verifier),
      code_challenge_method: "S256",
      prompt: "consent",
    });
    const headers = new Headers({ Location: `${AUTHORIZE_ENDPOINT}?${params}`, "Cache-Control": "no-store" });
    headers.append("Set-Cookie", await createFlowCookie(request, { state, verifier, expiresAt: Date.now() + 10 * 60_000 }));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const message = error instanceof Error && error.message === "FEISHU_NOT_CONFIGURED"
      ? "请先配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET。"
      : "无法启动飞书登录。";
    return Response.json({ error: message }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
