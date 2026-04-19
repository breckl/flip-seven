"use client";

import { useEffect, useState } from "react";

/** Cycles 0–3 dots for “Waiting…” style lines (matches turn indicator cadence). */
export function useEllipsisDots(active: boolean) {
  const [dotCount, setDotCount] = useState(0);

  useEffect(() => {
    if (!active) {
      setDotCount(0);
      return;
    }
    const id = window.setInterval(() => {
      setDotCount((n) => (n + 1) % 4);
    }, 450);
    return () => clearInterval(id);
  }, [active]);

  return dotCount;
}
