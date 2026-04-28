"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { roundEndExplanation } from "@/lib/client/round-end-copy";
import type { RoundEndReason } from "@/lib/game/types";

/**
 * Blocks score breakdown until the player taps OK on the “why did this round/game stop?” copy.
 */
export function RoundWhyGate({
  gateKey,
  reason,
  nameOf,
  children,
}: {
  gateKey: string;
  reason: RoundEndReason | undefined;
  nameOf: (id: string) => string;
  children: ReactNode;
}) {
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);

  useEffect(() => {
    setConfirmedKey(null);
  }, [gateKey]);

  const lines =
    reason !== undefined ? roundEndExplanation(reason, nameOf) : null;
  const shouldSkipOverlay = reason?.kind === "no_active_players";
  const showOverlay =
    !shouldSkipOverlay &&
    lines !== null &&
    reason !== undefined &&
    confirmedKey !== gateKey;

  return (
    <>
      {children}
      {showOverlay ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="round-why-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3
              id="round-why-title"
              className="text-lg font-semibold text-stone-900"
            >
              {lines.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-stone-700">
              {lines.body}
            </p>
            <PrimaryButton
              className="mt-6 w-full py-3 text-base"
              onClick={() => setConfirmedKey(gateKey)}
            >
              OK
            </PrimaryButton>
          </div>
        </div>
      ) : null}
    </>
  );
}
