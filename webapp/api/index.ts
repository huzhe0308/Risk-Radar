import path from "node:path";
import fs from "node:fs";

const STATIC_FILE_HEADER = "x-vinext-static-file";

const rscEntryPath = path.join(process.cwd(), "dist", "server", "index.js");
const clientDir = path.join(process.cwd(), "dist", "client");

let rscHandler: ((req: Request) => Promise<Response>) | null = null;
let initPromise: Promise<void> | null = null;

async function ensureHandler() {
  if (rscHandler) return;
  if (!initPromise) {
    initPromise = (async () => {
      const exists = fs.existsSync(rscEntryPath);
      console.log("[api] Loading RSC handler from:", rscEntryPath, "exists:", exists);
      if (!exists) throw new Error("dist/server/index.js not found");
      const mod = await import(rscEntryPath);
      const entry = mod.default;
      if (typeof entry === "function") {
        rscHandler = (req: Request) => Promise.resolve(entry(req));
      } else if (entry && typeof entry.fetch === "function") {
        rscHandler = (req: Request) => Promise.resolve(entry.fetch(req));
      } else {
        throw new Error("RSC handler has unexpected shape: " + typeof entry);
      }
      console.log("[api] RSC handler loaded successfully");
    })();
  }
  await initPromise;
}

async function buildWebRequest(req: any, precomputedBody?: Buffer): Promise<Request> {
  const proto = req.headers["x-forwarded-proto"]?.split(",")[0]?.trim() || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";

  const rawUrl = req.url || "/";
  const parsed = new URL(rawUrl, `${proto}://${host}`);

  let pathname = parsed.pathname;
  if (pathname === "/api" || pathname === "/api/") {
    pathname = "/";
  }
  const finalUrl = pathname + parsed.search;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else headers.set(key, value as string);
  }
  const method = req.method || "GET";
  const init: RequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    if (precomputedBody) {
      const contentType = headers.get("content-type") || "application/json";
      const blobType = contentType.includes("charset") ? contentType : `${contentType}; charset=utf-8`;
      init.body = new Blob([new Uint8Array(precomputedBody)], { type: blobType });
    }
  }
  return new Request(new URL(finalUrl, `${proto}://${host}`), init);
}

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff": "font/woff",
  ".woff2": "font/woff2", ".wasm": "application/wasm",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

async function sendWebResponse(response: Response, req: any, res: any) {
  const staticFileSignal = response.headers.get(STATIC_FILE_HEADER);
  if (staticFileSignal) {
    let filePath: string;
    try { filePath = decodeURIComponent(staticFileSignal); }
    catch { filePath = staticFileSignal; }
    const cleanPath = filePath.split("?")[0].replace(/^\/+/, "");
    const absPath = path.join(clientDir, cleanPath);
    if (absPath.startsWith(clientDir) && fs.existsSync(absPath)) {
      const ext = path.extname(absPath).toLowerCase();
      const stat = fs.statSync(absPath);
      res.writeHead(response.status, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Content-Length": stat.size,
        "Cache-Control": "public, max-age=3600",
      });
      fs.createReadStream(absPath).pipe(res);
      return;
    }
  }

  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, key) => {
    if (key === STATIC_FILE_HEADER) return;
    const existing = headers[key];
    if (existing !== undefined) {
      headers[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      headers[key] = value;
    }
  });
  res.writeHead(response.status, headers);
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  }
  res.end();
}

async function readRawBody(req: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function handleFeishuWebhook(req: any, res: any, bodyBuffer: Buffer): Promise<boolean> {
  const rawUrl = req.url || "/";
  const parsed = new URL(rawUrl, "http://localhost");
  const pathname = parsed.pathname;

  if (pathname !== "/api/feishu/sync" || (req.method || "GET") !== "POST") {
    return false;
  }

  const expectedToken = process.env.FEISHU_WEBHOOK_TOKEN;
  if (!expectedToken) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Webhook token not configured." }));
    return true;
  }

  const token = req.headers["x-webhook-token"];
  if (token !== expectedToken) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return true;
  }

  let body: Record<string, unknown>;
  try {
    const utf8Text = bodyBuffer.toString("utf8");
    body = JSON.parse(utf8Text);
  } catch {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Invalid JSON body." }));
    return true;
  }

  const webReq = new Request(`https://${req.headers["x-forwarded-host"] || req.headers["host"] || "localhost"}/api/feishu/sync`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });

  try {
    await ensureHandler();
    if (!rscHandler) throw new Error("Handler initialization failed");
    const response = await rscHandler(webReq);
    await sendWebResponse(response, req, res);
  } catch (error) {
    console.error("[api] Webhook error:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: String(error) }));
    }
  }
  return true;
}

export default async function apiHandler(req: any, res: any) {
  try {
    const method = req.method || "GET";
    let bodyBuffer: Buffer | undefined;

    if (method !== "GET" && method !== "HEAD") {
      bodyBuffer = await readRawBody(req);

      const parsed = new URL(req.url || "/", "http://localhost");
      if (parsed.pathname === "/api/feishu/sync" && method === "POST") {
        const handled = await handleFeishuWebhook(req, res, bodyBuffer);
        if (handled) return;
      }
    }

    await ensureHandler();
    if (!rscHandler) throw new Error("Handler initialization failed");
    const webReq = await buildWebRequest(req, bodyBuffer);
    const response = await rscHandler(webReq);
    await sendWebResponse(response, req, res);
  } catch (error) {
    console.error("[api] Error:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Internal Server Error", detail: String(error), stack: error instanceof Error ? error.stack?.split("\n").slice(0, 5).join(" | ") : undefined }));
    }
  }
}
