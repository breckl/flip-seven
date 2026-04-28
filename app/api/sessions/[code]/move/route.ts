import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { sessions } from "@/db/schema";
import { applyMove, type ClientMove } from "@/lib/server/apply-move";
import { applyBotAutoplay } from "@/lib/server/bot";
import {
  findPlayer,
  findSessionByCode,
  getGameRow,
  getPlayingSessionBody,
  listPlayers,
  updateGameState,
} from "@/lib/server/session-queries";
import type { GameState } from "@/lib/game/types";

const noCache = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
} as const;

type RouteParams = { params: { code: string } };

export async function POST(req: Request, ctx: RouteParams) {
  const { code: raw } = ctx.params;
  const code = raw.trim().toUpperCase();

  let body: { playerId?: string; move?: ClientMove };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const playerId = String(body.playerId ?? "");
  const move = body.move;
  if (!playerId || !move) {
    return NextResponse.json({ error: "playerId and move required" }, { status: 400 });
  }

  const session = await findSessionByCode(code);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.status !== "playing") {
    return NextResponse.json({ error: "Game not active" }, { status: 409 });
  }

  const player = await findPlayer(playerId);
  if (!player || player.sessionId !== session.id) {
    return NextResponse.json({ error: "Invalid player" }, { status: 403 });
  }

  const row = await getGameRow(session.id);
  if (!row) {
    return NextResponse.json({ error: "Game missing" }, { status: 500 });
  }

  let state = row.state as GameState;
  try {
    state = applyMove(state, playerId, move);
    const players = await listPlayers(session.id);
    const botIds = players.filter((p) => p.isBot).map((p) => p.id);
    state = applyBotAutoplay(state, botIds);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid move";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const ok = await updateGameState(session.id, row.version, state);
  if (!ok) {
    return NextResponse.json({ error: "Conflict — try again" }, { status: 409 });
  }

  if (state.phase.t === "game_over") {
    const db = getDb();
    await db.update(sessions).set({ status: "finished" }).where(eq(sessions.id, session.id));
  }

  const sessionAfter = await findSessionByCode(code);
  if (!sessionAfter) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const payload = await getPlayingSessionBody(sessionAfter);
  if (!payload) {
    return NextResponse.json({ error: "Game missing" }, { status: 500 });
  }

  return NextResponse.json(payload, { headers: noCache });
}
