import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { players, sessions } from "@/db/schema";
import { generateSessionCode } from "@/lib/session-code";

/** Postgres: unique_violation — only case where we retry with a new code */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

function dbErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function POST(req: Request) {
  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  if (!name || name.length > 40) {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }

  let db: ReturnType<typeof getDb>;
  try {
    db = getDb();
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      {
        error: "Server misconfigured: DATABASE_URL is not set.",
        hint: "Add DATABASE_URL to .env.local (see .env.example).",
      },
      { status: 500 }
    );
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateSessionCode();
    try {
      const result = await db.transaction(async (tx) => {
        const [sess] = await tx
          .insert(sessions)
          .values({
            code,
            status: "lobby",
          })
          .returning();
        const [host] = await tx
          .insert(players)
          .values({
            sessionId: sess.id,
            name,
            seatOrder: 0,
          })
          .returning();
        await tx
          .update(sessions)
          .set({ hostPlayerId: host.id })
          .where(eq(sessions.id, sess.id));
        return { sess, host };
      });
      return NextResponse.json({
        code: result.sess.code,
        sessionId: result.sess.id,
        playerId: result.host.id,
      });
    } catch (e) {
      if (isUniqueViolation(e)) continue;
      console.error("POST /api/sessions", e);
      const hint =
        dbErrorMessage(e).includes("does not exist") ||
        dbErrorMessage(e).includes("relation")
          ? "Run: npm run db:migrate (and ensure Docker is up: npm run db:up)"
          : "Check DATABASE_URL and that Postgres is reachable.";
      return NextResponse.json(
        {
          error: "Could not create session.",
          hint,
          detail:
            process.env.NODE_ENV === "development" ? dbErrorMessage(e) : undefined,
        },
        { status: 500 }
      );
    }
  }
  return NextResponse.json(
    { error: "Could not allocate a unique room code — try again." },
    { status: 500 }
  );
}
