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
        <span className="flex flex-col items-center justify-center gap-0 px-0.5 text-center leading-tight">
          <span>2nd</span>
          <span>Chance</span>
        </span>
      ) : (
        <span className="px-0.5 text-center">{label}</span>
      )}
    </div>
  );
}
