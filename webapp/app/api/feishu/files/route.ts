import { getFeishuUserSession } from "../oauth/session";

export const runtime = "edge";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const folderToken = url.searchParams.get("folder_token") || "";
  const pageSize = url.searchParams.get("page_size") || "50";
  const pageToken = url.searchParams.get("page_token") || "";

  try {
    const session = await getFeishuUserSession(request);
    if (!session) {
      return Response.json({ error: "请先登录飞书后再浏览文件。", code: "FEISHU_LOGIN_REQUIRED" }, { status: 401 });
    }

    const proxyUrl = new URL("http://127.0.0.1:3999/files");
    proxyUrl.searchParams.set("token", session.accessToken);
    if (folderToken) proxyUrl.searchParams.set("folder_token", folderToken);
    proxyUrl.searchParams.set("page_size", pageSize);
    if (pageToken) proxyUrl.searchParams.set("page_token", pageToken);

    const headers = new Headers({ Location: proxyUrl.toString(), "Cache-Control": "no-store" });
    session.setCookies.forEach((value) => headers.append("Set-Cookie", value));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取文件列表失败。";
    return Response.json({ error: message }, { status: 502 });
  }
}
