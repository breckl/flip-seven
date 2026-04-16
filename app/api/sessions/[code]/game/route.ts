import { NextResponse } from "next/server";
import { findSessionByCode, getPlayingSessionBody, listPlayers } from "@/lib/server/session-queries";

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
        expectedPlayerCount: session.expectedPlayerCount,
        hostPlayerId: session.hostPlayerId,
        players: players.map((p) => ({
          id: p.id,
          name: p.name,
          seatOrder: p.seatOrder,
        })),
      },
      { headers: noCache }
    );
  }

  const payload = await getPlayingSessionBody(session);
  if (!payload) {
    return NextResponse.json(
      { error: "Game missing" },
      { status: 500, headers: noCache }
    );
  }

  return NextResponse.json(payload, { headers: noCache });
}
