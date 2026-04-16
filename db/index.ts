import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { PoolConfig } from "pg";
import * as schema from "./schema";
import { redactDatabaseUrl } from "@/lib/redact-database-url";

const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
};

/**
 * Supabase "Transaction" pooler (port 6543) does not support prepared statements.
 * node-pg must disable them or Drizzle queries fail against the pooler.
 *
 * Vercel serverless often cannot resolve the direct host `db.*.supabase.co` (IPv6 /
 * DNS); use the pooler URI from Supabase Connect → Direct → Transaction mode for deploys.
 */
function poolConfigFromUrl(connectionString: string): PoolConfig {
  const config: PoolConfig & { prepareThreshold?: number } = {
    connectionString: connectionString,
    max: 10,
  };
  try {
    const u = new URL(connectionString);
    if (u.port === "6543") {
      config.prepareThreshold = 0;
    }
  } catch {
    /* invalid URL — Pool constructor will throw */
  }
  return config;
}

function createPool() {
  // Next.js loads .env.local into process.env for server-side code.
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (process.env.NODE_ENV === "development") {
    console.log("[db] Using DATABASE_URL:", redactDatabaseUrl(url));
  }
  return new Pool(poolConfigFromUrl(url));
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
