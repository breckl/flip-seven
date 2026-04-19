"use client";

import { useEffect, useRef } from "react";
import { GroupFeedMessage } from "@/components/GroupFeedMessage";
import type { GroupFeedEntry } from "@/lib/game/types";

type PlayerRow = { id: string; name: string; seatOrder: number };

export function GroupFeed({
  entries,
  players,
}: {
  entries: GroupFeedEntry[];
  players: PlayerRow[];
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nameById = (id: string) =>
    players.find((p) => p.id === id)?.name ?? "Player";

  const newestFirst = [...entries].reverse();
  const latestId = entries.length ? entries[entries.length - 1]?.id : null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [latestId]);

  if (entries.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        Nothing here yet — other players&apos; draws and actions will show up
        here.
      </p>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="max-h-72 overflow-y-auto pr-1 text-stone-900"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
    >
      <div className="flex flex-col gap-3">
        {newestFirst.map((e, i) => (
          <GroupFeedMessage
            key={e.id}
            entry={e}
            nameById={nameById}
            animateWaitingDots={
              e.kind === "action_waiting" && i === 0
            }
          />
        ))}
      </div>
    </div>
  );
}
