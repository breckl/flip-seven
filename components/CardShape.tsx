import type { CSSProperties } from "react";
import type { Card } from "@/lib/game/types";
import { cardLabel } from "@/lib/game/rules";
import {
  FLIP_THREE_FILL,
  FREEZE_FILL,
  MODIFIER_CARD_FILL,
  NUMBER_CARD_FILLS,
  SECOND_CHANCE_FILL,
  darkerOutline,
} from "@/lib/client/card-colors";

function surfaceForCard(card: Card): { bg: string; border: string } {
  if (card.k === "n") {
    const fill = NUMBER_CARD_FILLS[card.v] ?? "#ffffff";
    return { bg: fill, border: darkerOutline(fill) };
  }
  if (card.k === "m") {
    const fill = MODIFIER_CARD_FILL;
    return { bg: fill, border: darkerOutline(fill) };
  }
  if (card.k === "a") {
    if (card.v === "second") {
      const fill = SECOND_CHANCE_FILL;
      return { bg: fill, border: darkerOutline(fill) };
    }
    if (card.v === "flip3") {
      const fill = FLIP_THREE_FILL;
      return { bg: fill, border: darkerOutline(fill) };
    }
    if (card.v === "freeze") {
      const fill = FREEZE_FILL;
      return { bg: fill, border: darkerOutline(fill) };
    }
  }
  return { bg: "#ffffff", border: "#1c1917" };
}

export function CardShape({
  card,
  small,
  duplicateFlash,
}: {
  card: Card;
  small?: boolean;
  duplicateFlash?: boolean;
}) {
  const label = cardLabel(card);
  const isNum = card.k === "n";
  const surf = surfaceForCard(card);

  const sizeClass = small
    ? duplicateFlash
      ? "h-[calc(3rem+5px)] w-[calc(2.25rem+5px)] text-sm"
      : "h-12 w-9 text-sm"
    : duplicateFlash
      ? "h-[calc(4rem+5px)] w-[calc(2.75rem+5px)] text-lg"
      : "h-16 w-11 text-lg";

  const textClass = duplicateFlash
    ? "font-bold text-red-600"
    : isNum
      ? "font-bold text-black"
      : "text-xs font-bold leading-tight text-black";

  const style: CSSProperties | undefined = duplicateFlash
    ? {
        borderColor: "rgb(220 38 38)",
        backgroundColor: "rgb(255 255 255)",
      }
    : {
        borderColor: surf.border,
        backgroundColor: surf.bg,
      };

  return (
    <div
      key={duplicateFlash ? "dup-flash" : "normal"}
      style={style}
      className={`flex shrink-0 items-center justify-center rounded-lg border-2 shadow-sm ${sizeClass} ${textClass} ${
        duplicateFlash ? "animate-duplicate-card-pulse" : ""
      }`}
    >
      <span className="px-0.5 text-center">{label}</span>
    </div>
  );
}
