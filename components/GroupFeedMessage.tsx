"use client";

import { useEllipsisDots } from "@/hooks/useEllipsisDots";
import { cardLabel } from "@/lib/game/rules";
import type { Card, GroupFeedEntry } from "@/lib/game/types";

const nameCls = "font-bold text-stone-900";
const freezeCls = "font-bold text-blue-700";
const secondCls = "font-bold text-green-700";
const flip3Cls = "font-bold text-orange-600";
const stayCls = "font-bold text-blue-700";
const dupCls = "text-red-600";
const outCls = "font-bold uppercase text-red-600";
const flip7Cls = "font-bold text-green-700";

function possessive(displayName: string) {
  return `${displayName}'s`;
}

function ActionName({ card }: { card: Card & { k: "a" } }) {
  if (card.v === "freeze")
    return <span className={freezeCls}>Freeze</span>;
  if (card.v === "flip3")
    return <span className={flip3Cls}>Flip 3</span>;
  return <span className={secondCls}>Second Chance</span>;
}

function DrewCardBody({
  name,
  card,
}: {
  name: string;
  card: Card;
}) {
  return (
    <>
      <span className={nameCls}>{name}</span>
      <span className="text-stone-900"> drew a </span>
      {card.k === "n" ? (
        <span className="text-stone-900">{card.v}</span>
      ) : card.k === "m" ? (
        <span className="text-stone-900">{cardLabel(card)}</span>
      ) : (
        <ActionName card={card} />
      )}
      <span className="text-stone-900">.</span>
    </>
  );
}

function WaitingDots({ active }: { active: boolean }) {
  const dotCount = useEllipsisDots(active);
  return (
    <span className="text-stone-900" aria-hidden>
      {active ? ".".repeat(dotCount) : "…"}
    </span>
  );
}

export function GroupFeedMessage({
  entry,
  nameById,
  animateWaitingDots,
}: {
  entry: GroupFeedEntry;
  nameById: (id: string) => string;
  /** Only the latest waiting line should animate; older rows show a static ellipsis. */
  animateWaitingDots?: boolean;
}) {
  const actor = nameById(entry.actorId);
  const target = entry.targetId ? nameById(entry.targetId) : "";

  switch (entry.kind) {
    case "drew_card": {
      if (!entry.card) return null;
      return (
        <p className="text-sm leading-relaxed text-stone-900">
          <DrewCardBody name={actor} card={entry.card} />
        </p>
      );
    }
    case "action_waiting": {
      if (!entry.card || entry.card.k !== "a") return null;
      return (
        <p className="text-sm leading-relaxed text-stone-900">
          <DrewCardBody name={actor} card={entry.card} />
          <span className="text-stone-900"> Waiting on decision</span>
          <WaitingDots active={animateWaitingDots ?? false} />
        </p>
      );
    }
    case "gave_action": {
      if (!entry.card || entry.card.k !== "a" || !entry.targetId) return null;
      return (
        <p className="text-sm leading-relaxed text-stone-900">
          <span className={nameCls}>{actor}</span>
          <span className="text-stone-900"> gave a </span>
          <ActionName card={entry.card} />
          <span className="text-stone-900"> to </span>
          <span className={nameCls}>{target}</span>
          <span className="text-stone-900">.</span>
        </p>
      );
    }
    case "stayed":
      return (
        <p className="text-sm leading-relaxed text-stone-900">
          <span className={nameCls}>{actor}</span>
          <span className="text-stone-900"> decided to </span>
          <span className={stayCls}>Stay</span>
          <span className="text-stone-900">.</span>
        </p>
      );
    case "duplicate_out": {
      const v = entry.numberValue ?? "?";
      return (
        <p className="text-sm leading-relaxed text-stone-900">
          <span className={nameCls}>{possessive(actor)}</span>
          <span className="text-stone-900"> </span>
          <span className="text-stone-900">{v}</span>
          <span className="text-stone-900"> is a </span>
          <span className={dupCls}>duplicate</span>
          <span className="text-stone-900">. </span>
          <span className={nameCls}>{actor}</span>
          <span className="text-stone-900"> is </span>
          <span className={outCls}>OUT</span>
          <span className="text-stone-900">!</span>
        </p>
      );
    }
    case "duplicate_saved": {
      const v = entry.numberValue ?? "?";
      return (
        <p className="text-sm leading-relaxed text-stone-900">
          <span className={nameCls}>{possessive(actor)}</span>
          <span className="text-stone-900"> </span>
          <span className="text-stone-900">{v}</span>
          <span className="text-stone-900"> was a </span>
          <span className={dupCls}>duplicate</span>
          <span className="text-stone-900">
            , but cancelled out by their{" "}
          </span>
          <span className={secondCls}>Second Chance</span>
          <span className="text-stone-900">.</span>
        </p>
      );
    }
    case "flip7_bonus":
      return (
        <p className="text-sm leading-relaxed text-stone-900">
          <span className={nameCls}>{actor}</span>
          <span className="text-stone-900"> got </span>
          <span className={flip7Cls}>Flip 7</span>
          <span className="text-stone-900">. </span>
          <span className={flip7Cls}>+15 points</span>
          <span className="text-stone-900">!</span>
        </p>
      );
    case "second_chance_discarded":
      return (
        <p className="text-sm leading-relaxed text-stone-900">
          <span className={nameCls}>{actor}</span>
          <span className="text-stone-900"> discarded a </span>
          <span className={secondCls}>Second Chance</span>
          <span className="text-stone-900">
            {" "}
            (already had one — no other player to give it to).
          </span>
        </p>
      );
    default:
      return null;
  }
}
