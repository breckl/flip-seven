/**
 * Applies drizzle/0000_init.sql using DATABASE_URL from .env.local.
 * No psql required — works with Docker Postgres or Neon.
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
  const sqlPath = path.join(__dirname, "..", "drizzle", "0000_init.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log("Schema applied:", sqlPath);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
