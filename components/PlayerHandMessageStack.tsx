"use client";

import { CardShape } from "@/components/CardShape";
import type { HandMessage } from "@/hooks/usePlayerHandMessages";

export function PlayerHandMessageStack({
  messages,
}: {
  messages: HandMessage[];
}) {
  if (messages.length === 0) return null;
  return (
    <div
      className="mt-3 flex flex-col gap-2"
      role="region"
      aria-label="Hand messages"
    >
      {messages.map((m) => (
        <div
          key={m.id}
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-stone-900 shadow-sm"
          style={{ backgroundColor: m.backgroundColor }}
        >
          <span>{m.text}</span>
          {m.showCards?.map((c, i) => (
            <CardShape key={`${m.id}-c-${i}`} card={c} small />
          ))}
        </div>
      ))}
    </div>
  );
}
