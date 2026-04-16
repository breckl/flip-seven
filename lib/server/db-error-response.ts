import { NextResponse } from "next/server";

/**
 * Maps pg / Node network errors to a 503 + hint so ENOTFOUND isn’t a silent 500.
 */
export function connectionFailureResponse(
  err: unknown
): NextResponse | null {
  const code = extractPgErrorCode(err);
  if (
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED"
  ) {
    return NextResponse.json(
      {
        error: "Cannot reach the database server.",
        hint:
          code === "ENOTFOUND"
            ? "DNS could not resolve the host in DATABASE_URL. Copy the connection string again from Supabase (Settings → Database). Try the Session or Transaction pooler URI (often port 6543 and a different hostname than db.*.supabase.co). For local dev, use Docker Postgres per .env.example."
            : "Check that Postgres is running and DATABASE_URL matches your network (firewall, VPN).",
      },
      { status: 503 }
    );
  }
  return null;
}

function extractPgErrorCode(err: unknown): string | undefined {
  const wanted = new Set(["ENOTFOUND", "ETIMEDOUT", "ECONNREFUSED"]);
  let cur: unknown = err;
  for (let i = 0; i < 8 && cur !== undefined && cur !== null; i++) {
    if (typeof cur === "object" && cur !== null) {
      const code = (cur as { code?: string }).code;
      if (typeof code === "string" && wanted.has(code)) return code;
      cur = (cur as { cause?: unknown }).cause;
    } else break;
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("ENOTFOUND")) return "ENOTFOUND";
  return undefined;
}
