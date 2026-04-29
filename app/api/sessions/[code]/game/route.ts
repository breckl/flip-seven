import { NextResponse } from "next/server";
import { connectionFailureResponse } from "@/lib/server/db-error-response";
import { applyBotAutoplay } from "@/lib/server/bot";
import {
  findSessionByCode,
  getGameRow,
  getPlayingSessionBody,
  listPlayers,
  updateGameState,
} from "@/lib/server/session-queries";
import type { GameState } from "@/lib/game/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noCache = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
} as const;

type RouteParams = { params: { code: string } };

export async function GET(_req: Request, ctx: RouteParams) {
  const { code: raw } = ctx.params;
  const code = raw.trim().toUpperCase();

  try {
    const session = await findSessionByCode(code);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404, headers: noCache }
      );
    }

    if (session.status === "lobby") {
      const players = await listPlayers(session.id);
      return NextResponse.json(
        {
          status: session.status,
          code: session.code,
          hostPlayerId: session.hostPlayerId,
          players: players.map((p) => ({
            id: p.id,
            name: p.name,
            isBot: p.isBot,
            seatOrder: p.seatOrder,
          })),
        },
        { headers: noCache }
      );
    }

    if (session.status === "playing") {
      const players = await listPlayers(session.id);
      const botIds = players.filter((p) => p.isBot).map((p) => p.id);
      if (botIds.length > 0) {
        const row = await getGameRow(session.id);
        if (row) {
          const state = row.state as GameState;
          const nextState = applyBotAutoplay(state, botIds);
          if (nextState !== state) {
            await updateGameState(session.id, row.version, nextState);
          }
        }
      }
    }

    const sessionAfter = await findSessionByCode(code);
    if (!sessionAfter) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404, headers: noCache }
      );
    }

    const payload = await getPlayingSessionBody(sessionAfter);
    if (!payload) {
      return NextResponse.json(
        { error: "Game missing" },
        { status: 500, headers: noCache }
      );
    }

    return NextResponse.json(payload, { headers: noCache });
  } catch (e) {
    const conn = connectionFailureResponse(e);
    if (conn) {
      for (const [k, v] of Object.entries(noCache)) {
        conn.headers.set(k, String(v));
      }
      return conn;
    }
    console.error("GET /api/sessions/[code]/game", e);
    return NextResponse.json(
      { error: "Database error" },
      { status: 500, headers: noCache }
    );
  }
}
