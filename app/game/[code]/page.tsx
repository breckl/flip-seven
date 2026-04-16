"use client";

import { useEffect, useState } from "react";
import { GameClient, JoinGate } from "@/components/GameClient";
import { loadPlayerId } from "@/lib/client/player-storage";

export default function GamePage({ params }: { params: { code: string } }) {
  const code = params.code.toUpperCase();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPlayerId(loadPlayerId(code));
    setReady(true);
  }, [code]);

  if (!ready) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-stone-600">Loading…</div>
    );
  }

  if (!playerId) {
    return <JoinGate code={code} onJoined={setPlayerId} />;
  }

  return <GameClient code={code} />;
}
