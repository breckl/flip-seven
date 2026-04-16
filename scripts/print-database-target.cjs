/**
 * Prints which DATABASE_URL scripts and the app will use (password redacted).
 * Loads .env.local the same way as apply-migration.cjs.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function redact(connectionString) {
  try {
    const u = new URL(connectionString);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "(could not parse DATABASE_URL)";
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL is not set. Add it to .env.local (see .env.example)."
  );
  process.exit(1);
}

console.log("DATABASE_URL (redacted):", redact(url));
