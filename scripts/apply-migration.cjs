/**
 * Applies all drizzle/*.sql files in lexical order using DATABASE_URL from
 * .env.local. No psql required — works with Docker Postgres or Neon.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is not set. Add it to .env.local (see .env.example)."
    );
    process.exit(1);
  }
  const drizzleDir = path.join(__dirname, "..", "drizzle");
  const files = fs
    .readdirSync(drizzleDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    console.error("No .sql files in drizzle/");
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  for (const f of files) {
    const sqlPath = path.join(drizzleDir, f);
    const sql = fs.readFileSync(sqlPath, "utf8");
    await client.query(sql);
    console.log("Applied:", sqlPath);
  }
  await client.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
