/**
 * Safe preview of a Postgres connection string for logs (password removed).
 */
export function redactDatabaseUrl(connectionString: string): string {
  try {
    const u = new URL(connectionString);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "(could not parse DATABASE_URL)";
  }
}
