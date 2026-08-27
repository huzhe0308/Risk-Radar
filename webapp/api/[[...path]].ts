import { nodeToWebRequest, sendWebResponse } from "vinext/server/prod-server";
import path from "node:path";

const rscEntryPath = path.join(process.cwd(), "dist", "server", "index.js");

let handler: ((req: Request) => Promise<Response>) | null = null;
let initPromise: Promise<void> | null = null;

async function ensureHandler() {
  if (handler) return;
  if (!initPromise) {
    initPromise = (async () => {
      const mod = await import(rscEntryPath);
      const entry = mod.default;
      if (typeof entry === "function") {
        handler = (req: Request) => Promise.resolve(entry(req));
      } else if (entry && typeof entry.fetch === "function") {
        handler = (req: Request) => Promise.resolve(entry.fetch(req));
      } else {
        throw new Error("RSC handler not found in build output");
      }
    })();
  }
  await initPromise;
}

export default async function apiHandler(req: any, res: any) {
  try {
    await ensureHandler();
    if (!handler) throw new Error("Handler initialization failed");
    const webReq = nodeToWebRequest(req, req.url ?? "/");
    const response = await handler(webReq);
    await sendWebResponse(response, req, res, true);
  } catch (error) {
    console.error("[api] Error:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  }
}
