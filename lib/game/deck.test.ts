import { describe, expect, it } from "vitest";
import { assertDeckSize, buildDeck, shuffle } from "./deck";

describe("deck", () => {
  it("has 94 cards", () => {
    const d = buildDeck();
    assertDeckSize(d);
    expect(d.length).toBe(94);
  });

  it("shuffle preserves length", () => {
    const d = shuffle(buildDeck(), 12345);
    expect(d.length).toBe(94);
  });
});
