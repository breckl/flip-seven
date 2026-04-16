import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { games, players, sessions } from "@/db/schema";
import type { GameState } from "@/lib/game/types";

/** Same JSON shape as GET `/api/sessions/[code]/game` when not in lobby */
export type PlayingSessionBody = {
  status: "playing" | "finished";
  code: string;
  expectedPlayerCount: number;
  hostPlayerId: string | null;
  players: { id: string; name: string; seatOrder: number }[];
  game: { version: number; updatedAt: string; state: GameState };
};

export async function findSessionByCode(code: string) {
  const db = getDb();
  const c = code.trim().toUpperCase();
  const rows = await db.select().from(sessions).where(eq(sessions.code, c)).limit(1);
  return rows[0] ?? null;
}

export async function listPlayers(sessionId: string) {
  const db = getDb();
  return db
    .select()
    .from(players)
    .where(eq(players.sessionId, sessionId))
    .orderBy(players.seatOrder);
}

export async function findPlayer(playerId: string) {
  const db = getDb();
  const rows = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  return rows[0] ?? null;
}

export async function getGameRow(sessionId: string) {
  const db = getDb();
  const rows = await db.select().from(games).where(eq(games.sessionId, sessionId)).limit(1);
  return rows[0] ?? null;
}

export async function getPlayingSessionBody(
  session: NonNullable<Awaited<ReturnType<typeof findSessionByCode>>>
): Promise<PlayingSessionBody | null> {
  if (session.status === "lobby") return null;
  const game = await getGameRow(session.id);
  if (!game) return null;
  const players = await listPlayers(session.id);
  return {
    status: session.status,
    code: session.code,
    expectedPlayerCount: session.expectedPlayerCount,
    hostPlayerId: session.hostPlayerId,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      seatOrder: p.seatOrder,
    })),
    game: {
      version: game.version,
      updatedAt:
        typeof game.updatedAt === "string"
          ? game.updatedAt
          : game.updatedAt.toISOString(),
      state: game.state as GameState,
    },
  };
}

export async function updateGameState(
  sessionId: string,
  version: number,
  state: GameState
): Promise<boolean> {
  const db = getDb();
  const res = await db
    .update(games)
    .set({
      state: state as unknown as Record<string, unknown>,
      version: version + 1,
      updatedAt: sql`now()`,
    })
    .where(and(eq(games.sessionId, sessionId), eq(games.version, version)))
    .returning({ id: games.sessionId });
  return res.length === 1;
}
