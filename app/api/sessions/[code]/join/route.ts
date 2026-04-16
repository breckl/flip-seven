import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { players, sessions } from "@/db/schema";
import { findSessionByCode } from "@/lib/server/session-queries";

type RouteParams = { params: { code: string } };

export async function POST(req: Request, ctx: RouteParams) {
  const { code: raw } = ctx.params;
  const code = raw.trim().toUpperCase();

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

  const session = await findSessionByCode(code);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.status !== "lobby") {
    return NextResponse.json({ error: "Game already started" }, { status: 409 });
  }

  const db = getDb();
  const existing = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(players)
    .where(eq(players.sessionId, session.id));
  const count = existing[0]?.c ?? 0;
  const maxPlayers = 18;
  if (count >= maxPlayers) {
    return NextResponse.json({ error: "Lobby is full" }, { status: 409 });
  }

  const [p] = await db
    .insert(players)
    .values({
      sessionId: session.id,
      name,
      seatOrder: count,
    })
    .returning();

  return NextResponse.json({ playerId: p.id });
}
