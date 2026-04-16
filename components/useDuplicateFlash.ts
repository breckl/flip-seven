import { useEffect, useRef, useState } from "react";
import type { Card } from "@/lib/game/types";

const FLASH_MS = 1600;

/**
 * When nums gains a duplicate of some value (same number appears twice+),
 * returns indices of all number cards with that value for a brief flash animation.
 */
export function useDuplicateFlash(
  nums: Card[] | undefined,
  viewKey: string
): Set<number> {
  const [flashIndices, setFlashIndices] = useState<Set<number>>(new Set());
  const prevRef = useRef<Card[] | undefined>(undefined);
  const viewKeyRef = useRef(viewKey);

  useEffect(() => {
    if (viewKeyRef.current !== viewKey) {
      viewKeyRef.current = viewKey;
      prevRef.current = undefined;
    }
  }, [viewKey]);

  useEffect(() => {
    if (!nums) return;
    const prev = prevRef.current;
    prevRef.current = nums;

    if (!prev) return;

    const countByValue = (arr: Card[]) => {
      const m = new Map<number, number>();
      for (const c of arr) {
        if (c.k === "n") m.set(c.v, (m.get(c.v) ?? 0) + 1);
      }
      return m;
    };

    const oldC = countByValue(prev);
    const newC = countByValue(nums);

    let timeoutId: number | undefined;

    for (const [v, cnt] of newC) {
      if (cnt < 2) continue;
      const before = oldC.get(v) ?? 0;
      if (before >= cnt) continue;
      const indices = nums
        .map((c, i) => (c.k === "n" && c.v === v ? i : -1))
        .filter((i) => i >= 0);
      setFlashIndices(new Set(indices));
      timeoutId = window.setTimeout(() => setFlashIndices(new Set()), FLASH_MS);
      break;
    }

    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [nums, viewKey]);
  return flashIndices;
}
