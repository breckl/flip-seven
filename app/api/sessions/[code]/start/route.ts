import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { games, sessions } from "@/db/schema";
import { bootstrapDeal, createNewGame } from "@/lib/game/engine";
import { findSessionByCode, listPlayers } from "@/lib/server/session-queries";

type RouteParams = { params: { code: string } };

export async function POST(req: Request, ctx: RouteParams) {
  const { code: raw } = ctx.params;
  const code = raw.trim().toUpperCase();

  let body: { playerId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const playerId = String(body.playerId ?? "");
  if (!playerId) {
    return NextResponse.json({ error: "playerId required" }, { status: 400 });
  }

  const session = await findSessionByCode(code);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.status !== "lobby") {
    return NextResponse.json({ error: "Already started" }, { status: 409 });
  }
  if (session.hostPlayerId !== playerId) {
    return NextResponse.json({ error: "Only host can start" }, { status: 403 });
  }

  const plist = await listPlayers(session.id);
  if (plist.length < 3) {
    return NextResponse.json({ error: "Need at least 3 players" }, { status: 400 });
  }
  if (plist.length !== session.expectedPlayerCount) {
    return NextResponse.json(
      { error: "Wait until all players have joined" },
      { status: 400 }
    );
  }

  const seatIds = plist.map((p) => p.id);
  const dealerSeat = 0;
  let state = createNewGame(seatIds, dealerSeat);
  state = bootstrapDeal(state);

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(sessions)
      .set({ status: "playing" })
      .where(eq(sessions.id, session.id));
    await tx.insert(games).values({
      sessionId: session.id,
      state: state as unknown as Record<string, unknown>,
      version: 1,
      updatedAt: sql`now()`,
    });
  });

  return NextResponse.json({ ok: true });
}
