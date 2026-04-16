import type { Card, PlayerBoard } from "./types";

export function uniqueNumberCount(nums: Card[]): number {
  return new Set(nums.map((c) => c.v)).size;
}

/** True when the player has 7 different number values on number cards (modifiers / ×2 / actions don’t count). */
export function hasFlipSeven(nums: Card[]): boolean {
  return uniqueNumberCount(nums) >= 7;
}

/** FAQ order: sum numbers → ×2 if present → add flat mods → +15 if 7 unique numbers */
export function scoreBoard(board: PlayerBoard): number {
  if (board.status === "bust") return 0;
  let sum = board.nums.reduce((a, c) => a + (c.k === "n" ? c.v : 0), 0);
  if (board.hasX2) sum *= 2;
  for (const c of board.flatMods) {
    sum += flatValue(c);
  }
  if (hasFlipSeven(board.nums)) sum += 15;
  return sum;
}

function flatValue(c: Card): number {
  if (c.k !== "m" || c.v === "x2") return 0;
  const map = { p2: 2, p4: 4, p6: 6, p8: 8, p10: 10 } as const;
  return map[c.v];
}

export function cardLabel(c: Card): string {
  if (c.k === "n") return String(c.v);
  if (c.k === "m") {
    if (c.v === "x2") return "×2";
    return `+${flatValue(c)}`;
  }
  if (c.v === "freeze") return "Freeze";
  if (c.v === "flip3") return "Flip 3";
  return "2nd";
}

export function isActive(board: PlayerBoard): boolean {
  return board.status === "active";
}
