import type { CSSProperties } from "react";
import type { Card } from "@/lib/game/types";
import { cardLabel } from "@/lib/game/rules";
import {
  FLIP_THREE_FILL,
  FREEZE_FILL,
  MODIFIER_CARD_FILL,
  NUMBER_CARD_FILLS,
  SECOND_CHANCE_FILL,
} from "@/lib/client/card-colors";

function surfaceForCard(card: Card): { bg: string } {
  if (card.k === "n") {
    return { bg: NUMBER_CARD_FILLS[card.v] ?? "#ffffff" };
  }
  if (card.k === "m") {
    return { bg: MODIFIER_CARD_FILL };
  }
  if (card.k === "a") {
    if (card.v === "second") return { bg: SECOND_CHANCE_FILL };
    if (card.v === "flip3") return { bg: FLIP_THREE_FILL };
    if (card.v === "freeze") return { bg: FREEZE_FILL };
  }
  return { bg: "#ffffff" };
}

export function CardShape({
  card,
  small,
  fitNumberRow,
  duplicateFlash,
  duplicateHighlight,
  secondChanceSaveFlash,
}: {
  card: Card;
  small?: boolean;
  /** Fill one of 7 equal columns in the number row (width from grid, height from aspect). */
  fitNumberRow?: boolean;
  duplicateFlash?: boolean;
  /** Same red styling as duplicate flash, without animation (e.g. bust dialog). */
  duplicateHighlight?: boolean;
  /** Green pulse when Second Chance negates a duplicate (pair with duplicate number card). */
  secondChanceSaveFlash?: boolean;
}) {
  const label = cardLabel(card);
  const isNum = card.k === "n";
  const isSecondChance = card.k === "a" && card.v === "second";
  const isFlipThree = card.k === "a" && card.v === "flip3";
  const surf = surfaceForCard(card);
  const dupRed = duplicateFlash || duplicateHighlight;
  /** Extra slack only for Second Chance save animation (still uses scale in CSS) */
  const extraEmphasis = secondChanceSaveFlash;

  /* Small / large: 15% narrower, 5% shorter vs 3.96×4.84 / 5.04×6.655. Number row: 7 columns → w-full + same aspect */
  const sizeClass =
    small && fitNumberRow && !extraEmphasis
      ? "h-auto w-full min-w-0 max-w-full aspect-[3.366/4.598] text-xs sm:text-sm"
      : small
        ? extraEmphasis
          ? "h-[calc(4.598rem+5px)] w-[calc(3.366rem+5px)] text-sm"
          : "h-[4.598rem] w-[3.366rem] text-sm"
        : extraEmphasis
          ? "h-[calc(6.32225rem+5px)] w-[calc(4.284rem+5px)] text-lg"
          : "h-[6.32225rem] w-[4.284rem] text-lg";

  const textClass = dupRed
    ? "font-bold text-red-600"
    : secondChanceSaveFlash
      ? "font-bold text-green-700"
      : isNum
        ? "font-bold text-black"
        : "text-xs font-bold leading-tight text-black";

  const style: CSSProperties | undefined = dupRed
    ? { backgroundColor: "rgb(255 255 255)" }
    : secondChanceSaveFlash
      ? { backgroundColor: "rgb(255 255 255)" }
      : { backgroundColor: surf.bg };

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
      className={`flex items-center justify-center rounded-lg shadow-sm ${dupRed ? "border-2 border-red-600" : ""} ${small && fitNumberRow ? "min-w-0" : "shrink-0"} ${sizeClass} ${textClass} ${animClass}`}
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
      ) : isFlipThree ? (
        <span
          className="flex flex-col items-center justify-center px-0.5 text-center leading-tight"
          aria-label={label}
        >
          <span className="block">Flip</span>
          <span className="block">3</span>
        </span>
      ) : (
        <span className="px-0.5 text-center">{label}</span>
      )}
    </div>
  );
}
