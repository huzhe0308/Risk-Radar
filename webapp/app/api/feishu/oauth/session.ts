const TOKEN_ENDPOINT = "https://open.feishu.cn/open-apis/authen/v2/oauth/token";
const USER_INFO_ENDPOINT = "https://open.feishu.cn/open-apis/authen/v1/user_info";

const FLOW_COOKIE = "tpv_feishu_oauth";
const ACCESS_COOKIE = "tpv_feishu_access";
const REFRESH_COOKIE = "tpv_feishu_refresh";
const COOKIE_PATH = "/";

const PROXY_PREFIX = "/__feishu_proxy/";

function hasProxy(): boolean {
  return Boolean(typeof process !== "undefined" && (process.env.HTTPS_PROXY || process.env.HTTP_PROXY));
}

function proxyUrl(originalUrl: string, _origin: string): string {
  if (!hasProxy()) return originalUrl;
  return `http://127.0.0.1:3999/?url=${encodeURIComponent(originalUrl)}`;
}

type JsonObject = Record<string, unknown>;

type OAuthFlow = {
  state: string;
  verifier: string;
  expiresAt: number;
};

type StoredAccess = {
  token: string;
  expiresAt: number;
  name: string;
};

type StoredRefresh = {
  token: string;
  expiresAt: number;
};

type TokenResult = {
  accessToken: string;
  accessExpiresAt: number;
  refreshToken: string;
  refreshExpiresAt: number;
};

export type FeishuUserSession = {
  accessToken: string;
  name: string;
  setCookies: string[];
};

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function env(name: string): string {
  return (typeof process !== "undefined" ? process.env[name] : "")?.trim() || "";
}

export function getOAuthConfig(request: Request) {
  const appId = env("FEISHU_APP_ID");
  const appSecret = env("FEISHU_APP_SECRET");
  if (!appId || !appSecret) throw new Error("FEISHU_NOT_CONFIGURED");
  const redirectUri = env("FEISHU_REDIRECT_URI") || `${new URL(request.url).origin}/api/feishu/oauth/callback`;
  return { appId, appSecret, redirectUri };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function randomBase64Url(size = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}

export async function sha256Base64Url(value: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

async function encryptionKey(): Promise<CryptoKey> {
  const secret = env("FEISHU_SESSION_SECRET") || env("FEISHU_APP_SECRET");
  if (!secret) throw new Error("FEISHU_NOT_CONFIGURED");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function seal(value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), plaintext);
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

async function unseal<T>(value: string | undefined): Promise<T | null> {
  if (!value) return null;
  try {
    const [ivValue, ciphertextValue] = value.split(".");
    if (!ivValue || !ciphertextValue) return null;
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(ivValue) },
      await encryptionKey(),
      fromBase64Url(ciphertextValue),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    return null;
  }
}

function requestCookies(request: Request): Record<string, string> {
  return Object.fromEntries((request.headers.get("cookie") || "").split(";").flatMap((part) => {
    const index = part.indexOf("=");
    if (index < 0) return [];
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { return name ? [[name, decodeURIComponent(value)]] : []; } catch { return []; }
  }));
}

function cookie(name: string, value: string, request: Request, maxAge: number): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=${COOKIE_PATH}; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAge))}${secure}`;
}

function clearCookie(name: string, request: Request): string {
  return cookie(name, "", request, 0);
}

async function parseApiPayload(response: Response): Promise<JsonObject> {
  const payload = object(await response.json().catch(() => null));
  const errorCode = payload?.code ?? payload?.error;
  if (!response.ok || (errorCode !== undefined && String(errorCode) !== "0")) {
    const detail = payload?.error_description || payload?.msg || payload?.message || errorCode;
    throw new Error(`飞书 OAuth 请求失败${detail ? `：${String(detail)}` : `（HTTP ${response.status}）`}`);
  }
  return payload || {};
}

function tokenResult(payload: JsonObject): TokenResult {
  const data = object(payload.data) || payload;
  const accessToken = typeof data.access_token === "string" ? data.access_token : "";
  const refreshToken = typeof data.refresh_token === "string" ? data.refresh_token : "";
  if (!accessToken) throw new Error("飞书未返回 user_access_token。");
  const now = Date.now();
  return {
    accessToken,
    accessExpiresAt: now + Math.max(60, Number(data.expires_in) || 7200) * 1000,
    refreshToken,
    refreshExpiresAt: now + Math.max(300, Number(data.refresh_token_expires_in) || 2_592_000) * 1000,
  };
}

async function requestToken(request: Request, body: JsonObject): Promise<TokenResult> {
  const { appId, appSecret } = getOAuthConfig(request);
  const origin = new URL(request.url).origin;
  const response = await fetch(proxyUrl(TOKEN_ENDPOINT, origin), {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ client_id: appId, client_secret: appSecret, ...body }),
  });
  return tokenResult(await parseApiPayload(response));
}

export async function exchangeAuthorizationCode(request: Request, code: string, verifier: string): Promise<TokenResult> {
  const { redirectUri } = getOAuthConfig(request);
  return requestToken(request, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
}

async function refreshAccessToken(request: Request, refreshToken: string): Promise<TokenResult> {
  return requestToken(request, { grant_type: "refresh_token", refresh_token: refreshToken });
}

export async function fetchFeishuUserName(accessToken: string, origin = ""): Promise<string> {
  const response = await fetch(proxyUrl(USER_INFO_ENDPOINT, origin), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await parseApiPayload(response);
  const data = object(payload.data) || payload;
  return [data.name, data.en_name, data.open_id].find((value) => typeof value === "string" && value) as string || "已登录用户";
}

export async function createFlowCookie(request: Request, flow: OAuthFlow): Promise<string> {
  return cookie(FLOW_COOKIE, await seal(flow), request, 10 * 60);
}

export async function readFlow(request: Request): Promise<OAuthFlow | null> {
  return unseal<OAuthFlow>(requestCookies(request)[FLOW_COOKIE]);
}

export function clearFlowCookie(request: Request): string {
  return clearCookie(FLOW_COOKIE, request);
}

export async function createSessionCookies(request: Request, tokens: TokenResult, name: string): Promise<string[]> {
  const accessMaxAge = Math.max(60, Math.floor((tokens.accessExpiresAt - Date.now()) / 1000));
  const refreshMaxAge = Math.max(60, Math.floor((tokens.refreshExpiresAt - Date.now()) / 1000));
  const cookies = [cookie(ACCESS_COOKIE, await seal({ token: tokens.accessToken, expiresAt: tokens.accessExpiresAt, name } satisfies StoredAccess), request, accessMaxAge)];
  if (tokens.refreshToken) {
    cookies.push(cookie(REFRESH_COOKIE, await seal({ token: tokens.refreshToken, expiresAt: tokens.refreshExpiresAt } satisfies StoredRefresh), request, refreshMaxAge));
  }
  return cookies;
}

export async function getFeishuUserSession(request: Request, allowRefresh = true): Promise<FeishuUserSession | null> {
  const cookies = requestCookies(request);
  const origin = new URL(request.url).origin;
  const access = await unseal<StoredAccess>(cookies[ACCESS_COOKIE]);
  if (access?.token && access.expiresAt > Date.now() + 60_000) {
    return { accessToken: access.token, name: access.name || "已登录用户", setCookies: [] };
  }
  if (!allowRefresh) return null;
  const refresh = await unseal<StoredRefresh>(cookies[REFRESH_COOKIE]);
  if (!refresh?.token || refresh.expiresAt <= Date.now()) return null;

  const tokens = await refreshAccessToken(request, refresh.token).catch(() => null);
  if (!tokens) return null;
  if (!tokens.refreshToken) {
    tokens.refreshToken = refresh.token;
    tokens.refreshExpiresAt = refresh.expiresAt;
  }
  const name = access?.name || await fetchFeishuUserName(tokens.accessToken, origin).catch(() => "已登录用户");
  return { accessToken: tokens.accessToken, name, setCookies: await createSessionCookies(request, tokens, name) };
}

export function clearSessionCookies(request: Request): string[] {
  return [clearCookie(FLOW_COOKIE, request), clearCookie(ACCESS_COOKIE, request), clearCookie(REFRESH_COOKIE, request)];
}
