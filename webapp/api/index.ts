import path from "node:path";
import fs from "node:fs";
import { Readable } from "node:stream";

const STATIC_FILE_HEADER = "x-vinext-static-file";

const rscEntryPath = path.join(process.cwd(), "dist", "server", "index.js");
const clientDir = path.join(process.cwd(), "dist", "client");

let handler: ((req: Request) => Promise<Response>) | null = null;
let initPromise: Promise<void> | null = null;

async function ensureHandler() {
  if (handler) return;
  if (!initPromise) {
    initPromise = (async () => {
      const exists = fs.existsSync(rscEntryPath);
      console.log("[api] Loading RSC handler from:", rscEntryPath, "exists:", exists);
      if (!exists) throw new Error("dist/server/index.js not found");
      const mod = await import(rscEntryPath);
      const entry = mod.default;
      if (typeof entry === "function") {
        handler = (req: Request) => Promise.resolve(entry(req));
      } else if (entry && typeof entry.fetch === "function") {
        handler = (req: Request) => Promise.resolve(entry.fetch(req));
      } else {
        throw new Error("RSC handler has unexpected shape: " + typeof entry);
      }
      console.log("[api] RSC handler loaded successfully");
    })();
  }
  await initPromise;
}

function buildWebRequest(req: any): Request {
  const proto = req.headers["x-forwarded-proto"]?.split(",")[0]?.trim() || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";

  const rawUrl = req.url || "/";
  const parsed = new URL(rawUrl, `${proto}://${host}`);

  let pathname = parsed.pathname;
  if (pathname === "/api" || pathname === "/api/") {
    pathname = "/";
  } else if (pathname.startsWith("/api/")) {
    pathname = pathname.slice(4);
  }
  const finalUrl = pathname + parsed.search;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else headers.set(key, value as string);
  }
  const method = req.method || "GET";
  const init: RequestInit & { duplex?: "half" } = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = Readable.toWeb(req) as any;
    init.duplex = "half";
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

export default async function handler(req: any, res: any) {
  try {
    await ensureHandler();
    if (!handler) throw new Error("Handler initialization failed");
    const webReq = buildWebRequest(req);
    const response = await handler(webReq);
    await sendWebResponse(response, req, res);
  } catch (error) {
    console.error("[api] Error:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Internal Server Error", detail: String(error) }));
    }
  }
}
