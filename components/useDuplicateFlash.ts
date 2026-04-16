import { useEffect, useRef, useState } from "react";
import type { Card } from "@/lib/game/types";

const FLASH_MS = 1600;

function countByNumberValue(arr: Card[]) {
  const m = new Map<number, number>();
  for (const c of arr) {
    if (c.k === "n") m.set(c.v, (m.get(c.v) ?? 0) + 1);
  }
  return m;
}

function hasAnyDuplicate(nums: Card[]) {
  return [...countByNumberValue(nums).values()].some((c) => c >= 2);
}

/**
 * When nums gains a duplicate of some value (same number appears twice+),
 * returns indices of all number cards with that value for a brief flash animation.
 * Clears when duplicates resolve, on timeout, or when nums is undefined — never left stuck.
 */
export function useDuplicateFlash(
  nums: Card[] | undefined,
  viewKey: string,
): Set<number> {
  const [flashIndices, setFlashIndices] = useState<Set<number>>(new Set());
  const prevRef = useRef<Card[] | undefined>(undefined);
  const viewKeyRef = useRef(viewKey);
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
    };
  }, []);

  useEffect(() => {
    if (viewKeyRef.current !== viewKey) {
      viewKeyRef.current = viewKey;
      prevRef.current = undefined;
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
      setFlashIndices(new Set());
    }
  }, [viewKey]);

  useEffect(() => {
    if (!nums) {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
      setFlashIndices(new Set());
      prevRef.current = undefined;
      return;
    }

    const prev = prevRef.current;
    prevRef.current = nums;

    if (!prev) return;

    const oldC = countByNumberValue(prev);
    const newC = countByNumberValue(nums);

    let foundNewDuplicate = false;
    for (const [v, cnt] of newC) {
      if (cnt < 2) continue;
      const before = oldC.get(v) ?? 0;
      if (before >= cnt) continue;
      const indices = nums
        .map((c, i) => (c.k === "n" && c.v === v ? i : -1))
        .filter((i) => i >= 0);
      foundNewDuplicate = true;
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current);
      }
      setFlashIndices(new Set(indices));
      timeoutRef.current = window.setTimeout(() => {
        setFlashIndices(new Set());
        timeoutRef.current = undefined;
      }, FLASH_MS);
      break;
    }

    if (!foundNewDuplicate && !hasAnyDuplicate(nums)) {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
      setFlashIndices(new Set());
    }
  }, [nums, viewKey]);

  return flashIndices;
}
