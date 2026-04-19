import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { players } from "@/db/schema";
import { connectionFailureResponse } from "@/lib/server/db-error-response";
import {
  findPlayer,
  findSessionByCode,
  findSessionById,
} from "@/lib/server/session-queries";

const noCache = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
} as const;

const maxPlayers = 18;

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
      return NextResponse.json({ error: "No follow-up from this session" }, { status: 409 });
    }
    if (!session.rematchTargetSessionId) {
      return NextResponse.json(
        { error: "Host has not started a new game yet" },
        { status: 400 }
      );
    }

    if (session.hostPlayerId === playerId) {
      return NextResponse.json(
        {
          error:
            "You are the host — open the new lobby from “Start new game” (you are already in that room).",
        },
        { status: 409 }
      );
    }

    const oldPlayer = await findPlayer(playerId);
    if (!oldPlayer || oldPlayer.sessionId !== session.id) {
      return NextResponse.json({ error: "Invalid player" }, { status: 403 });
    }

    const target = await findSessionById(session.rematchTargetSessionId);
    if (!target) {
      return NextResponse.json({ error: "Follow-up session missing" }, { status: 500 });
    }
    if (target.status !== "lobby") {
      return NextResponse.json(
        {
          error: "The new game already started — you can open it with the room code if you joined in time.",
          code: target.code,
        },
        { status: 409 }
      );
    }

    const db = getDb();

    const [existingJoin] = await db
      .select({ id: players.id })
      .from(players)
      .where(
        and(
          eq(players.sessionId, target.id),
          eq(players.rematchFromPlayerId, playerId)
        )
      )
      .limit(1);

    if (existingJoin) {
      return NextResponse.json(
        { code: target.code, playerId: existingJoin.id },
        { headers: noCache }
      );
    }

    const [countRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(players)
      .where(eq(players.sessionId, target.id));
    const count = countRow?.c ?? 0;
    if (count >= maxPlayers) {
      return NextResponse.json({ error: "Lobby is full" }, { status: 409 });
    }

    const [inserted] = await db
      .insert(players)
      .values({
        sessionId: target.id,
        name: oldPlayer.name,
        seatOrder: count,
        rematchFromPlayerId: playerId,
      })
      .returning();

    return NextResponse.json(
      { code: target.code, playerId: inserted.id },
      { headers: noCache }
    );
  } catch (e) {
    const conn = connectionFailureResponse(e);
    if (conn) {
      for (const [k, v] of Object.entries(noCache)) {
        conn.headers.set(k, String(v));
      }
      return conn;
    }
    console.error("POST /api/sessions/[code]/rematch/join", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
