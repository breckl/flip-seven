/** Fill colors for number cards 0–12 (outline is computed slightly darker) */
export const NUMBER_CARD_FILLS: Record<number, string> = {
  0: "#CFE8F7",
  1: "#DDEAF6",
  2: "#D8E1FF",
  3: "#E6D9F2",
  4: "#EFE3FA",
  5: "#F6C6C6",
  6: "#F9D6E3",
  7: "#FFE0CC",
  8: "#FFE6D6",
  9: "#DFF5EA",
  10: "#E3F7F2",
  11: "#D7F1F8",
  12: "#FFF2B3",
};

export const MODIFIER_CARD_FILL = "#CFF3F0";
export const SECOND_CHANCE_FILL = "#F1D7FF";
export const FLIP_THREE_FILL = "#FFD9E6";
export const FREEZE_FILL = "#E8F6FF";

/** Darken hex for card border/outline */
export function darkerOutline(hex: string, factor = 0.78): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 0xff) * factor);
  const g = Math.round(((n >> 8) & 0xff) * factor);
  const b = Math.round((n & 0xff) * factor);
  return `#${[r, g, b]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")}`;
}
