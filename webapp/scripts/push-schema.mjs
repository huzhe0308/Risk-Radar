import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { join } from "path";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set in .env.local");
  process.exit(1);
}

const sql = readFileSync(join(process.cwd(), "drizzle", "0000_worried_human_fly.sql"), "utf-8");
const statements = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);

const client = neon(url);

try {
  console.log("Connecting to Neon via HTTP...");
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.replace(/\n/g, " ").slice(0, 70);
    console.log(`[${i + 1}/${statements.length}] ${preview}...`);
    await client.query(stmt);
  }
  console.log("\nAll tables created successfully.");

  const rows = await client`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
  console.log("Tables in database:", rows.map((r) => r.tablename));
} catch (err) {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
}
