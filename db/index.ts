import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { redactDatabaseUrl } from "@/lib/redact-database-url";

const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
};

function createPool() {
  // Next.js loads .env.local into process.env for server-side code.
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (process.env.NODE_ENV === "development") {
    console.log("[db] Using DATABASE_URL:", redactDatabaseUrl(url));
  }
  return new Pool({ connectionString: url, max: 10 });
}

export function getPool() {
  if (!globalForDb.pool) {
    globalForDb.pool = createPool();
  }
  return globalForDb.pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}
