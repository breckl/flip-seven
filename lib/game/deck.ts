import type { Card } from "./types";

/** Build the 94-card Flip 7 deck (see rulebook). */
export function buildDeck(): Card[] {
  const out: Card[] = [];
  out.push({ k: "n", v: 0 });
  for (let n = 1; n <= 12; n++) {
    for (let i = 0; i < n; i++) {
      out.push({ k: "n", v: n });
    }
  }
  (["p2", "p4", "p6", "p8", "p10"] as const).forEach((v) =>
    out.push({ k: "m", v })
  );
  out.push({ k: "m", v: "x2" });
  for (let i = 0; i < 3; i++) {
    out.push({ k: "a", v: "freeze" });
    out.push({ k: "a", v: "flip3" });
    out.push({ k: "a", v: "second" });
  }
  return out;
}

export function assertDeckSize(d: Card[]) {
  if (d.length !== 94) {
    throw new Error(`Expected 94 cards, got ${d.length}`);
  }
}

/** Fisher–Yates; optional seed for tests (mulberry32) */
export function shuffle<T>(arr: T[], seed?: number): T[] {
  const a = [...arr];
  const rnd = seed !== undefined ? mulberry32(seed) : Math.random;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
