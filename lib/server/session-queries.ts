import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { games, players, sessions } from "@/db/schema";
import type { GameState } from "@/lib/game/types";
import type { RematchPayload } from "@/lib/rematch-payload";

/** Same JSON shape as GET `/api/sessions/[code]/game` when not in lobby */
export type PlayingSessionBody = {
  status: "playing" | "finished";
  code: string;
  hostPlayerId: string | null;
  players: { id: string; name: string; seatOrder: number }[];
  game: { version: number; updatedAt: string; state: GameState };
  rematch?: RematchPayload;
};

export async function findSessionByCode(code: string) {
  const db = getDb();
  const c = code.trim().toUpperCase();
  const rows = await db.select().from(sessions).where(eq(sessions.code, c)).limit(1);
  return rows[0] ?? null;
}

export async function findSessionById(id: string) {
  const db = getDb();
  const rows = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
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

async function rematchPayloadForFinishedSession(
  session: NonNullable<Awaited<ReturnType<typeof findSessionByCode>>>,
  oldPlayerIds: string[]
): Promise<RematchPayload | undefined> {
  if (session.status !== "finished" || !session.rematchTargetSessionId) {
    return undefined;
  }
  const target = await findSessionById(session.rematchTargetSessionId);
  if (!target) return undefined;
  const db = getDb();
  const joinedRows = await db
    .select({ rematchFromPlayerId: players.rematchFromPlayerId })
    .from(players)
    .where(
      and(
        eq(players.sessionId, target.id),
        isNotNull(players.rematchFromPlayerId),
        inArray(players.rematchFromPlayerId, oldPlayerIds)
      )
    );
  const joinedOldPlayerIds = joinedRows
    .map((r) => r.rematchFromPlayerId)
    .filter((id): id is string => id != null);
  return {
    targetCode: target.code,
    targetStatus: target.status,
    joinedOldPlayerIds,
  };
}

export async function getPlayingSessionBody(
  session: NonNullable<Awaited<ReturnType<typeof findSessionByCode>>>
): Promise<PlayingSessionBody | null> {
  if (session.status === "lobby") return null;
  const game = await getGameRow(session.id);
  if (!game) return null;
  const playerRows = await listPlayers(session.id);
  const playerIds = playerRows.map((p) => p.id);
  const rematch =
    session.status === "finished"
      ? await rematchPayloadForFinishedSession(session, playerIds)
      : undefined;
  return {
    status: session.status,
    code: session.code,
    hostPlayerId: session.hostPlayerId,
    players: playerRows.map((p) => ({
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
    ...(rematch ? { rematch } : {}),
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
