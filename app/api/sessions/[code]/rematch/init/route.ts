import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { players, sessions } from "@/db/schema";
import { connectionFailureResponse } from "@/lib/server/db-error-response";
import {
  findPlayer,
  findSessionByCode,
  findSessionById,
  getGameRow,
} from "@/lib/server/session-queries";
import { generateSessionCode } from "@/lib/session-code";
import type { GameState } from "@/lib/game/types";

const noCache = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
} as const;

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

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

  try {
    const session = await findSessionByCode(code);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (session.status !== "finished") {
      return NextResponse.json(
        { error: "Only finished games can start a follow-up lobby" },
        { status: 409 }
      );
    }
    if (!session.hostPlayerId || session.hostPlayerId !== playerId) {
      return NextResponse.json({ error: "Only host can start a new game" }, { status: 403 });
    }

    const gameRow = await getGameRow(session.id);
    if (!gameRow) {
      return NextResponse.json({ error: "Game missing" }, { status: 500 });
    }
    const state = gameRow.state as GameState;
    if (state.phase.t !== "game_over") {
      return NextResponse.json({ error: "Game is not complete" }, { status: 400 });
    }

    if (session.rematchTargetSessionId) {
      const existingTarget = await findSessionById(session.rematchTargetSessionId);
      if (!existingTarget) {
        return NextResponse.json({ error: "Follow-up session missing" }, { status: 500 });
      }
      if (existingTarget.status === "lobby" && existingTarget.hostPlayerId) {
        return NextResponse.json(
          {
            code: existingTarget.code,
            playerId: existingTarget.hostPlayerId,
          },
          { headers: noCache }
        );
      }
      return NextResponse.json(
        {
          error: "A follow-up game already started",
          code: existingTarget.code,
        },
        { status: 409 }
      );
    }

    const hostPlayer = await findPlayer(session.hostPlayerId);
    if (!hostPlayer || hostPlayer.sessionId !== session.id) {
      return NextResponse.json({ error: "Host player missing" }, { status: 500 });
    }

    const db = getDb();
    const oldSessionId = session.id;
    const oldHostPlayerId = hostPlayer.id;
    const hostName = hostPlayer.name;
    const oldPlayers = await db
      .select()
      .from(players)
      .where(eq(players.sessionId, oldSessionId))
      .orderBy(players.seatOrder);
    const botPlayers = oldPlayers.filter((p) => p.isBot);

    for (let attempt = 0; attempt < 8; attempt++) {
      const newCode = generateSessionCode();
      try {
        const result = await db.transaction(async (tx) => {
          const [sess] = await tx
            .insert(sessions)
            .values({
              code: newCode,
              status: "lobby",
            })
            .returning();
          const [host] = await tx
            .insert(players)
            .values({
              sessionId: sess.id,
              name: hostName,
              isBot: false,
              seatOrder: 0,
              rematchFromPlayerId: oldHostPlayerId,
            })
            .returning();
          for (let i = 0; i < botPlayers.length; i++) {
            await tx.insert(players).values({
              sessionId: sess.id,
              name: botPlayers[i].name,
              isBot: true,
              seatOrder: i + 1,
            });
          }
          await tx
            .update(sessions)
            .set({ hostPlayerId: host.id })
            .where(eq(sessions.id, sess.id));
          await tx
            .update(sessions)
            .set({ rematchTargetSessionId: sess.id })
            .where(eq(sessions.id, oldSessionId));
          return { sess, host };
        });
        return NextResponse.json(
          { code: result.sess.code, playerId: result.host.id },
          { headers: noCache }
        );
      } catch (e) {
        if (isUniqueViolation(e)) continue;
        throw e;
      }
    }
    return NextResponse.json(
      { error: "Could not allocate a unique room code — try again." },
      { status: 500 }
    );
  } catch (e) {
    const conn = connectionFailureResponse(e);
    if (conn) {
      for (const [k, v] of Object.entries(noCache)) {
        conn.headers.set(k, String(v));
      }
      return conn;
    }
    console.error("POST /api/sessions/[code]/rematch/init", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
