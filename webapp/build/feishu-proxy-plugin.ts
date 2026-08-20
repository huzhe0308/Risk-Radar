import { createServer, type Server } from "node:http";
import { ProxyAgent } from "undici";
import type { Plugin, ViteDevServer } from "vite";

const PROXY_PORT = 3999;
const PROXY_HOST = "127.0.0.1";

const TOKEN_ENDPOINT = "https://open.feishu.cn/open-apis/authen/v2/oauth/token";
const USER_INFO_ENDPOINT = "https://open.feishu.cn/open-apis/authen/v1/user_info";
const FEISHU_API = "https://open.feishu.cn/open-apis";
const APP_ORIGIN = "http://localhost:3000";

const MAX_SHEETS = 20;
const MAX_ROWS_PER_SHEET = 10_000;
const MAX_COLUMNS_PER_SHEET = 100;

type JsonObject = Record<string, unknown>;
type SheetInfo = {
  sheet_id: string;
  title: string;
  index?: number;
  hidden?: boolean;
  grid_properties?: { row_count?: number; column_count?: number };
};

function objectVal(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function columnName(columnCount: number): string {
  let value = Math.max(1, columnCount);
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

async function feishuApiGet(path: string, token: string, dispatcher: unknown): Promise<JsonObject> {
  const url = `${FEISHU_API}${path}`;
  console.log("[feishu-proxy] →", path.slice(0, 60));
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    dispatcher,
  } as RequestInit);
  const payload = objectVal(await resp.json().catch(() => null));
  if (!resp.ok) {
    const detail = payload?.msg || payload?.message || payload?.error_description || payload?.code;
    throw new Error(`飞书接口请求失败（HTTP ${resp.status}${detail ? `，${String(detail)}` : ""}）`);
  }
  if (!payload) throw new Error("飞书返回了无法识别的数据。");
  if (Number(payload.code || 0) !== 0) throw new Error(`${String(payload.msg || "飞书接口错误")}（错误码 ${String(payload.code)}）`);
  console.log("[feishu-proxy] ←", resp.status, path.slice(0, 60));
  return payload;
}

function parseSourceUrl(sourceUrl: string): { kind: "wiki" | "sheet"; token: string; preferredSheetId?: string } {
  let url: URL;
  try { url = new URL(sourceUrl); } catch { throw new Error("请输入有效的飞书电子表格或 Wiki 链接。"); }
  if (!/(^|\.)feishu\.cn$/i.test(url.hostname) && !/(^|\.)larksuite\.com$/i.test(url.hostname)) {
    throw new Error("只支持飞书或 Lark 官方链接。");
  }
  const wiki = url.pathname.match(/^\/wiki\/([A-Za-z0-9_-]+)/);
  const sheet = url.pathname.match(/^\/sheets\/([A-Za-z0-9_-]+)/);
  const token = wiki?.[1] || sheet?.[1] || "";
  if (!token || token.length > 200) throw new Error("链接中没有找到有效的飞书表格 token。");
  return { kind: wiki ? "wiki" : "sheet", token, preferredSheetId: url.searchParams.get("sheet") || undefined };
}

async function handleImport(token: string, sourceUrl: string, dispatcher: unknown): Promise<JsonObject> {
  const parsed = parseSourceUrl(sourceUrl);
  let spreadsheetToken: string;
  let preferredSheetId: string | undefined;

  if (parsed.kind === "sheet") {
    spreadsheetToken = parsed.token;
    preferredSheetId = parsed.preferredSheetId;
  } else {
    const payload = await feishuApiGet(`/wiki/v2/spaces/get_node?token=${encodeURIComponent(parsed.token)}`, token, dispatcher);
    const node = objectVal(objectVal(payload.data)?.node);
    if (!node || node.obj_type !== "sheet" || typeof node.obj_token !== "string") {
      throw new Error("该 Wiki 节点不是飞书电子表格。");
    }
    spreadsheetToken = node.obj_token;
    preferredSheetId = parsed.preferredSheetId;
  }

  const [spreadsheetPayload, sheetPayload] = await Promise.all([
    feishuApiGet(`/sheets/v3/spreadsheets/${encodeURIComponent(spreadsheetToken)}`, token, dispatcher),
    feishuApiGet(`/sheets/v3/spreadsheets/${encodeURIComponent(spreadsheetToken)}/sheets/query`, token, dispatcher),
  ]);

  const spreadsheet = objectVal(objectVal(spreadsheetPayload.data)?.spreadsheet);
  const rawSheets = objectVal(sheetPayload.data)?.sheets;
  const sheets = (Array.isArray(rawSheets) ? rawSheets : [])
    .flatMap((value) => {
      const s = objectVal(value) as SheetInfo | null;
      return s && typeof s.sheet_id === "string" && typeof s.title === "string" ? [s] : [];
    })
    .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
    .slice(0, MAX_SHEETS);
  if (!sheets.length) throw new Error("飞书电子表格中没有可读取的工作表。");

  console.log("[feishu-proxy] sheets found:", sheets.map((s) => ({ id: s.sheet_id, title: s.title, rows: s.grid_properties?.row_count, cols: s.grid_properties?.column_count })));

  const ranges = sheets.map((s) => {
    const rows = Math.max(1, Math.min(MAX_ROWS_PER_SHEET, Number(s.grid_properties?.row_count) || 1000));
    const columns = Math.max(1, Math.min(MAX_COLUMNS_PER_SHEET, Number(s.grid_properties?.column_count) || 26));
    return `${s.sheet_id}!A1:${columnName(columns)}${rows}`;
  });
  console.log("[feishu-proxy] ranges:", ranges.join(",").slice(0, 120));
  const sheetResults = await Promise.all(sheets.map(async (s) => {
    const rows = Math.max(1, Math.min(MAX_ROWS_PER_SHEET, Number(s.grid_properties?.row_count) || 1000));
    const columns = Math.max(1, Math.min(MAX_COLUMNS_PER_SHEET, Number(s.grid_properties?.column_count) || 26));
    const range = `${encodeURIComponent(s.sheet_id)}!A1:${columnName(columns)}${rows}`;
    const valuesPath = `/sheets/v2/spreadsheets/${encodeURIComponent(spreadsheetToken)}/values/${range}?valueRenderOption=ToString&dateTimeRenderOption=FormattedString`;
    const valuesPayload = await feishuApiGet(valuesPath, token, dispatcher);
    const valueRange = objectVal(valuesPayload.data);
    return {
      id: s.sheet_id,
      title: s.title,
      hidden: Boolean(s.hidden),
      values: Array.isArray(valueRange?.values) ? valueRange.values : [],
    };
  }));

  return {
    title: typeof spreadsheet?.title === "string" ? spreadsheet.title : "飞书电子表格",
    spreadsheetToken,
    preferredSheetId,
    sheets: sheetResults,
  };
}

export function feishuProxy(): Plugin {
  return {
    name: "feishu-proxy",
    apply: "serve" as const,
    configureServer(_server: ViteDevServer) {
      const proxyEnv =
        process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "";
      const dispatcher = proxyEnv ? new ProxyAgent(proxyEnv) : undefined;
      const appId = process.env.FEISHU_APP_ID || "";
      const appSecret = process.env.FEISHU_APP_SECRET || "";
      const redirectUri = process.env.FEISHU_REDIRECT_URI || `${APP_ORIGIN}/api/feishu/oauth/callback`;

      if (proxyEnv) {
        console.log("[feishu-proxy] Using corporate proxy:", proxyEnv.split("@").pop());
      } else {
        console.log("[feishu-proxy] No HTTPS_PROXY found, using direct connection.");
      }

      const proxyServer = createServer(async (req, res) => {
        res.setHeader("Access-Control-Allow-Origin", APP_ORIGIN);
        res.setHeader("Access-Control-Allow-Headers", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }

        try {
          const reqUrl = req.url || "";

          // Health check
          if (reqUrl === "/" || reqUrl === "") {
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/plain");
            res.end("feishu-proxy OK");
            return;
          }

          // OAuth callback endpoint: /oauth-exchange?code=...&verifier=...&redirect_uri=...
          if (reqUrl.startsWith("/oauth-exchange")) {
            const params = new URL(reqUrl, `http://${PROXY_HOST}`).searchParams;
            const code = params.get("code") || "";
            const verifier = params.get("verifier") || "";
            const redirectUriParam = params.get("redirect_uri") || redirectUri;

            console.log("[feishu-proxy] oauth-exchange code:", code.slice(0, 8) + "...");

            if (!code || !verifier) {
              res.statusCode = 400;
              res.end("Missing code or verifier");
              return;
            }

            // Exchange code for tokens
            const tokenBody = JSON.stringify({
              client_id: appId,
              client_secret: appSecret,
              grant_type: "authorization_code",
              code,
              redirect_uri: redirectUriParam,
              code_verifier: verifier,
            });

            console.log("[feishu-proxy] → token exchange");
            const tokenResp = await fetch(TOKEN_ENDPOINT, {
              method: "POST",
              headers: { "Content-Type": "application/json; charset=utf-8" },
              body: tokenBody,
              dispatcher,
            } as RequestInit);

            const tokenData = await tokenResp.json() as Record<string, unknown>;
            console.log("[feishu-proxy] ← token status:", tokenResp.status, "code:", tokenData.code || tokenData.error || "0");

            if (!tokenResp.ok || (tokenData.code && String(tokenData.code) !== "0")) {
              const errorMsg = tokenData.error_description || tokenData.msg || tokenData.error || `HTTP ${tokenResp.status}`;
              console.error("[feishu-proxy] token exchange failed:", errorMsg);
              const returnUrl = new URL("/", APP_ORIGIN);
              returnUrl.searchParams.set("feishuError", `飞书授权失败：${String(errorMsg)}`);
              res.writeHead(302, { Location: returnUrl.toString() });
              res.end();
              return;
            }

            const data = (tokenData.data as Record<string, unknown>) || tokenData;
            const accessToken = String(data.access_token || "");
            const refreshToken = String(data.refresh_token || "");
            const expiresIn = Number(data.expires_in) || 7200;
            const refreshExpiresIn = Number(data.refresh_token_expires_in) || 2592000;

            if (!accessToken) {
              const returnUrl = new URL("/", APP_ORIGIN);
              returnUrl.searchParams.set("feishuError", "飞书未返回 access_token");
              res.writeHead(302, { Location: returnUrl.toString() });
              res.end();
              return;
            }

            // Fetch user name
            let userName = "已登录用户";
            try {
              console.log("[feishu-proxy] → user info");
              const userResp = await fetch(USER_INFO_ENDPOINT, {
                headers: { Authorization: `Bearer ${accessToken}` },
                dispatcher,
              } as RequestInit);
              const userData = await userResp.json() as Record<string, unknown>;
              const userDataObj = (userData.data as Record<string, unknown>) || userData;
              userName = [userDataObj.name, userDataObj.en_name, userDataObj.open_id].find(
                (v) => typeof v === "string" && v
              ) as string || "已登录用户";
              console.log("[feishu-proxy] ← user:", userName);
            } catch (e) {
              console.log("[feishu-proxy] user info failed:", e);
            }

            // Redirect back to app with tokens as query params
            const returnUrl = new URL("/api/feishu/oauth/complete", APP_ORIGIN);
            returnUrl.searchParams.set("access_token", accessToken);
            returnUrl.searchParams.set("refresh_token", refreshToken);
            returnUrl.searchParams.set("expires_in", String(expiresIn));
            returnUrl.searchParams.set("refresh_expires_in", String(refreshExpiresIn));
            returnUrl.searchParams.set("name", userName);
            res.writeHead(302, { Location: returnUrl.toString() });
            res.end();
            return;
          }

          // Generic proxy: /?url=<encoded url>
          const urlIndex = reqUrl.indexOf("?url=");
          if (urlIndex >= 0) {
            const targetUrl = decodeURIComponent(reqUrl.slice(urlIndex + 5));
            if (!targetUrl.startsWith("http")) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Invalid url" }));
              return;
            }

            console.log("[feishu-proxy] →", targetUrl);

            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);
            const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

            const headers: Record<string, string> = {};
            for (const [key, value] of Object.entries(req.headers)) {
              if (key.toLowerCase() !== "host" && key.toLowerCase() !== "connection") {
                if (typeof value === "string") headers[key] = value;
                else if (Array.isArray(value) && value.length) headers[key] = value.join(", ");
              }
            }

            const response = await fetch(targetUrl, {
              method: req.method || "GET",
              headers,
              ...(body ? { body } : {}),
              dispatcher,
            } as RequestInit);

            res.statusCode = response.status;
            response.headers.forEach((value, key) => {
              if (key.toLowerCase() !== "transfer-encoding" && key.toLowerCase() !== "content-length")
                res.setHeader(key, value);
            });
            const responseBody = Buffer.from(await response.arrayBuffer());
            console.log("[feishu-proxy] ←", response.status, targetUrl);
            res.end(responseBody);
            return;
          }

          // Import endpoint: /import?token=...&url=...
          if (reqUrl.startsWith("/import")) {
            const params = new URL(reqUrl, `http://${PROXY_HOST}`).searchParams;
            const token = params.get("token") || "";
            const sourceUrl = params.get("url") || "";

            if (!token) {
              res.statusCode = 401;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "请先登录飞书后再读取表格。", code: "FEISHU_LOGIN_REQUIRED" }));
              return;
            }
            if (!sourceUrl) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "请输入飞书表格链接。" }));
              return;
            }

            try {
              const result = await handleImport(token, sourceUrl, dispatcher);
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify(result));
            } catch (error) {
              console.error("[feishu-proxy] import error:", error);
              const message = error instanceof Error ? error.message : "读取飞书表格失败。";
              const isPermissionError = /permission|权限|forbidden|denied/i.test(message);
              res.statusCode = isPermissionError ? 403 : 502;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: isPermissionError ? `飞书没有访问该表格的权限：${message}` : message }));
            }
            return;
          }

          // Files listing endpoint: /files?token=...&folder_token=...&page_size=...&page_token=...
          if (reqUrl.startsWith("/files")) {
            const params = new URL(reqUrl, `http://${PROXY_HOST}`).searchParams;
            const token = params.get("token") || "";
            const folderToken = params.get("folder_token") || "";
            const pageSize = params.get("page_size") || "50";
            const pageToken = params.get("page_token") || "";

            if (!token) {
              res.statusCode = 401;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "请先登录飞书后再浏览文件。", code: "FEISHU_LOGIN_REQUIRED" }));
              return;
            }

            try {
              const queryParams = new URLSearchParams({
                page_size: pageSize,
              });
              if (folderToken) queryParams.set("folder_token", folderToken);
              if (pageToken) queryParams.set("page_token", pageToken);

              console.log("[feishu-proxy] → /drive/v1/files");
              const payload = await feishuApiGet(`/drive/v1/files?${queryParams}`, token, dispatcher);
              const data = objectVal(payload.data) || payload;
              const rawFiles = (data as JsonObject).files;
              const files = Array.isArray(rawFiles) ? rawFiles : [];

              const sheets = files
                .map((f): JsonObject | null => {
                  const file = objectVal(f);
                  if (!file) return null;
                  if (typeof file.type !== "string" || (file.type !== "sheet" && file.type !== "bitable")) return null;
                  if (typeof file.token !== "string" || typeof file.name !== "string") return null;
                  return {
                    token: file.token,
                    name: file.name,
                    type: file.type,
                    url: file.url || "",
                    created_time: file.created_time || 0,
                    modified_time: file.modified_time || 0,
                    owner: objectVal(file.owner)?.name || "",
                  };
                })
                .filter((f): f is JsonObject => f !== null);

              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({
                files: sheets,
                has_more: Boolean((data as JsonObject).has_more),
                next_page_token: typeof (data as JsonObject).page_token === "string"
                  ? String((data as JsonObject).page_token)
                  : "",
              }));
            } catch (error) {
              console.error("[feishu-proxy] files error:", error);
              const message = error instanceof Error ? error.message : "获取飞书文件列表失败。";
              res.statusCode = 502;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: message }));
            }
            return;
          }

          // Bitable import endpoint: /bitable?token=...&app_token=...
          if (reqUrl.startsWith("/bitable")) {
            const params = new URL(reqUrl, `http://${PROXY_HOST}`).searchParams;
            const accessToken = params.get("token") || "";
            const appToken = params.get("app_token") || "";

            if (!accessToken) {
              res.statusCode = 401;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "请先登录飞书后再读取多维表格。", code: "FEISHU_LOGIN_REQUIRED" }));
              return;
            }
            if (!appToken) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "缺少多维表格 token。" }));
              return;
            }

            try {
              console.log("[feishu-proxy] → /bitable/v1/apps", appToken.slice(0, 8));
              const tablesPayload = await feishuApiGet(`/bitable/v1/apps/${encodeURIComponent(appToken)}/tables?page_size=100`, accessToken, dispatcher);
              const tablesData = objectVal(tablesPayload.data) || tablesPayload;
              const rawTables = (tablesData as JsonObject).items;
              const tables = Array.isArray(rawTables) ? rawTables : [];

              const sheets: Array<{ id: string; title: string; values: unknown[][] }> = [];

              const flattenValue = (val: unknown): string => {
                if (val === null || val === undefined) return "";
                if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") return String(val);
                if (Array.isArray(val)) {
                  return val.map((item) => {
                    if (item === null || item === undefined) return "";
                    if (typeof item === "string" || typeof item === "number") return String(item);
                    const obj = objectVal(item);
                    if (obj) {
                      return String(obj.text || obj.name || obj.value || obj.title || "");
                    }
                    return String(item);
                  }).filter(Boolean).join(", ");
                }
                const obj = objectVal(val);
                if (obj) {
                  return String(obj.text || obj.name || obj.value || obj.title || "");
                }
                return String(val);
              };

              for (const t of tables) {
                const table = objectVal(t);
                if (!table || typeof table.table_id !== "string" || typeof table.name !== "string") continue;
                const tableId = table.table_id;
                const tableName = table.name;

                console.log("[feishu-proxy] → /bitable records", tableName);

                const allRecords: JsonObject[] = [];
                let pageToken = "";
                do {
                  const path = `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records?page_size=500${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ""}`;
                  const recordsPayload = await feishuApiGet(path, accessToken, dispatcher);
                  const recordsData = objectVal(recordsPayload.data) || recordsPayload;
                  const rawRecords = (recordsData as JsonObject).items;
                  if (Array.isArray(rawRecords)) allRecords.push(...rawRecords.filter((r): r is JsonObject => objectVal(r) !== null).map((r) => objectVal(r)!));
                  pageToken = typeof (recordsData as JsonObject).page_token === "string" ? String((recordsData as JsonObject).page_token) : "";
                } while (pageToken);

                console.log("[feishu-proxy] bitable records:", allRecords.length);

                const fieldNames: string[] = [];
                const fieldSet = new Set<string>();
                for (const record of allRecords) {
                  const fields = objectVal(record.fields) || {};
                  for (const key of Object.keys(fields)) {
                    if (!fieldSet.has(key)) {
                      fieldSet.add(key);
                      fieldNames.push(key);
                    }
                  }
                }

                const header = fieldNames;
                const rows: unknown[][] = allRecords.map((record) => {
                  const fields = objectVal(record.fields) || {};
                  return header.map((h) => flattenValue(fields[h] ?? ""));
                });

                const values: unknown[][] = [header, ...rows];

                sheets.push({ id: tableId, title: tableName.slice(0, 31), values });
              }

              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({
                title: "飞书多维表格",
                spreadsheetToken: appToken,
                sheets,
              }));
            } catch (error) {
              console.error("[feishu-proxy] bitable error:", error);
              const message = error instanceof Error ? error.message : "读取飞书多维表格失败。";
              res.statusCode = 502;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: message }));
            }
            return;
          }

          res.statusCode = 404;
          res.end("Not found");
        } catch (error) {
          console.error("[feishu-proxy] error:", error);
          res.statusCode = 502;
          res.end(
            JSON.stringify({
              error: `Proxy failed: ${error instanceof Error ? error.message : String(error)}`,
            }),
          );
        }
      });

      proxyServer.listen(PROXY_PORT, PROXY_HOST, () => {
        console.log(`[feishu-proxy] listening on http://${PROXY_HOST}:${PROXY_PORT}`);
      });

      _server.httpServer?.on("close", () => proxyServer.close());
    },
  };
}
