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
  duplicateHighlight,
  secondChanceSaveFlash,
}: {
  card: Card;
  small?: boolean;
  duplicateFlash?: boolean;
  /** Same red styling as duplicate flash, without animation (e.g. bust dialog). */
  duplicateHighlight?: boolean;
  /** Green pulse when Second Chance negates a duplicate (pair with duplicate number card). */
  secondChanceSaveFlash?: boolean;
}) {
  const label = cardLabel(card);
  const isNum = card.k === "n";
  const isSecondChance = card.k === "a" && card.v === "second";
  const surf = surfaceForCard(card);
  const dupRed = duplicateFlash || duplicateHighlight;
  const emphasisFlash = dupRed || secondChanceSaveFlash;

  const sizeClass = small
    ? emphasisFlash
      ? "h-[calc(4.84rem+5px)] w-[calc(3.96rem+5px)] text-sm"
      : "h-[4.84rem] w-[3.96rem] text-sm"
    : emphasisFlash
      ? "h-[calc(6.655rem+5px)] w-[calc(5.04rem+5px)] text-lg"
      : "h-[6.655rem] w-[5.04rem] text-lg";

  const textClass = dupRed
    ? "font-bold text-red-600"
    : secondChanceSaveFlash
      ? "font-bold text-green-700"
      : isNum
        ? "font-bold text-black"
        : "text-xs font-bold leading-tight text-black";

  const style: CSSProperties | undefined = dupRed
    ? {
        borderColor: "rgb(220 38 38)",
        backgroundColor: "rgb(255 255 255)",
      }
    : secondChanceSaveFlash
      ? {
          borderColor: "rgb(22 163 74)",
          backgroundColor: "rgb(255 255 255)",
        }
      : {
          borderColor: surf.border,
          backgroundColor: surf.bg,
        };

  const animClass = duplicateFlash
    ? "animate-duplicate-card-pulse"
    : secondChanceSaveFlash
      ? "animate-second-chance-save-pulse"
      : "";

  return (
    <div
      key={
        duplicateFlash
          ? "dup-flash"
          : duplicateHighlight
            ? "dup-hi"
            : secondChanceSaveFlash
              ? "sc-save"
              : "normal"
      }
      style={style}
      className={`flex shrink-0 items-center justify-center rounded-lg border-2 shadow-sm ${sizeClass} ${textClass} ${animClass}`}
    >
      {isSecondChance ? (
        <span
          className={`flex items-center justify-center ${
            secondChanceSaveFlash ? "text-green-700" : "text-red-600"
          }`}
          aria-hidden
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[55%] w-[55%] shrink-0"
            fill="currentColor"
          >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </span>
      ) : (
        <span className="px-0.5 text-center">{label}</span>
      )}
    </div>
  );
}
