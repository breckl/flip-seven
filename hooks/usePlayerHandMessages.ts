"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FLIP_THREE_FILL,
  FREEZE_FILL,
  NUMBER_CARD_FILLS,
  SECOND_CHANCE_FILL,
  darkerOutline,
} from "@/lib/client/card-colors";
import { cardLabel, hasFlipSeven } from "@/lib/game/rules";
import type { RematchPayload } from "@/lib/rematch-payload";
import type { Card, GameState } from "@/lib/game/types";

export const HAND_MESSAGE_MAX = 3;
export const HAND_MESSAGE_MS = 10_000;

export type HandMessage = {
  id: string;
  backgroundColor: string;
  borderColor: string;
  text: string;
  /** Optional small card shapes after the text */
  showCards?: Card[];
};

type PlayerRow = { id: string; name: string; seatOrder: number };

type PlayingPayload = {
  status: "playing" | "finished";
  game: { version: number; state: GameState; updatedAt: string };
  players: PlayerRow[];
  rematch?: RematchPayload;
};

function useHandMessageQueue() {
  const [messages, setMessages] = useState<HandMessage[]>([]);
  const timeoutsRef = useRef<Map<string, number>>(new Map());

  const remove = useCallback((id: string) => {
    const t = timeoutsRef.current.get(id);
    if (t) clearTimeout(t);
    timeoutsRef.current.delete(id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const pushHandMessage = useCallback(
    (msg: HandMessage) => {
      setMessages((prev) => {
        const next = [msg, ...prev];
        const dropped = next.slice(HAND_MESSAGE_MAX);
        for (const d of dropped) {
          const t = timeoutsRef.current.get(d.id);
          if (t) clearTimeout(t);
          timeoutsRef.current.delete(d.id);
        }
        return next.slice(0, HAND_MESSAGE_MAX);
      });
      const t = window.setTimeout(() => remove(msg.id), HAND_MESSAGE_MS);
      timeoutsRef.current.set(msg.id, t);
    },
    [remove],
  );

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current.clear();
    };
  }, []);

  const clearAll = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current.clear();
    setMessages([]);
  }, []);

  return { messages, pushHandMessage, clearAll };
}

type PostMove = (move: {
  type: "ACK_TARGET_NOTIFY" | "ACK_BUST_REVEAL";
}) => void | Promise<void>;

/** Dedup bust toast across React Strict Mode remounts (refs reset; version can also bump while phase stays bust_reveal). */
const bustToastEnqueuedKeys = new Set<string>();

function bustStableKey(roundIndex: number, bustedPlayerId: string) {
  return `${roundIndex}|${bustedPlayerId}`;
}

export function usePlayerHandMessages(
  playingPayload: PlayingPayload | null,
  playerId: string | null,
  postMove: PostMove,
) {
  const { messages, pushHandMessage, clearAll } = useHandMessageQueue();

  const pendingTargetKeyRef = useRef<string | null>(null);
  /** One bust_reveal handling per `round|player|version`; timer for delayed round-ending ACK */
  const bustScheduleKeyRef = useRef<string | null>(null);
  const bustTimerRef = useRef<number | null>(null);
  const prevSecondChanceRef = useRef<boolean | null>(null);
  const secondRevealSerialRef = useRef<string | null>(null);
  const prevFlipSevenRef = useRef<boolean | null>(null);
  const flipThreeGiftAwaitingFlip7Ref = useRef(false);
  const prevStatusRef = useRef<string | null>(null);
  const prevRoundIndexRef = useRef<number | null>(null);
  /** Avoid duplicate toasts when the same effect runs twice (e.g. React Strict Mode). */
  const pushedEventIdsRef = useRef<Set<string>>(new Set());

  const tryPush = useCallback(
    (msg: HandMessage) => {
      if (pushedEventIdsRef.current.has(msg.id)) return;
      pushedEventIdsRef.current.add(msg.id);
      pushHandMessage(msg);
    },
    [pushHandMessage],
  );

  useEffect(() => {
    if (!playingPayload || !playerId) return;
    const gs = playingPayload.game.state;
    const phase = gs.phase;
    const you = playerId;
    const board = gs.boards[you];

    if (
      phase.t === "round_summary" ||
      phase.t === "game_summary" ||
      phase.t === "game_over"
    ) {
      clearAll();
      pendingTargetKeyRef.current = null;
      if (bustTimerRef.current != null) {
        clearTimeout(bustTimerRef.current);
        bustTimerRef.current = null;
      }
      bustScheduleKeyRef.current = null;
      bustToastEnqueuedKeys.clear();
      prevSecondChanceRef.current = null;
      secondRevealSerialRef.current = null;
      prevFlipSevenRef.current = null;
      flipThreeGiftAwaitingFlip7Ref.current = false;
      prevStatusRef.current = null;
      prevRoundIndexRef.current = null;
      pushedEventIdsRef.current.clear();
      return;
    }

    const roundIndex = gs.roundIndex;
    if (prevRoundIndexRef.current !== roundIndex) {
      clearAll();
      prevRoundIndexRef.current = roundIndex;
      if (bustTimerRef.current != null) {
        clearTimeout(bustTimerRef.current);
        bustTimerRef.current = null;
      }
      bustScheduleKeyRef.current = null;
      bustToastEnqueuedKeys.clear();
      flipThreeGiftAwaitingFlip7Ref.current = false;
      pushedEventIdsRef.current.clear();
    }

    const version = playingPayload.game.version;
    const players = playingPayload.players;
    const nameOf = (id: string) =>
      players.find((p) => p.id === id)?.name ?? "Player";

    const mint = NUMBER_CARD_FILLS[9];
    const mintBorder = darkerOutline(mint);
    const freezeBg = FREEZE_FILL;
    const freezeBorder = darkerOutline(freezeBg);
    const flip3Bg = FLIP_THREE_FILL;
    const flip3Border = darkerOutline(flip3Bg);

    // --- pending target: toast (if needed) + ACK once per pending blob ---
    const pt = gs.pendingTargetAck;
    if (pt && pt.targetPlayerId === you) {
      const ackKey = `${pt.actorPlayerId}|${pt.targetPlayerId}|${JSON.stringify(pt.card)}`;
      if (pendingTargetKeyRef.current !== ackKey) {
        pendingTargetKeyRef.current = ackKey;
        const selfTarget = pt.actorPlayerId === pt.targetPlayerId;
        const fromOpponent = !selfTarget && pt.actorPlayerId !== you;
        if (fromOpponent) {
          const actor = nameOf(pt.actorPlayerId);
          if (pt.card.k === "a" && pt.card.v === "freeze") {
            tryPush({
              id: `tgt-freeze-${version}-${ackKey}`,
              backgroundColor: freezeBg,
              borderColor: freezeBorder,
              text: `${actor} gave you a Freeze card. You’re Frozen!`,
            });
          } else if (pt.card.k === "a" && pt.card.v === "flip3") {
            tryPush({
              id: `tgt-flip3-${version}-${ackKey}`,
              backgroundColor: flip3Bg,
              borderColor: flip3Border,
              text: `${actor} gave you a Flip 3 card.`,
            });
            flipThreeGiftAwaitingFlip7Ref.current = true;
          } else if (pt.card.k === "a" && pt.card.v === "second") {
            tryPush({
              id: `tgt-second-${version}-${ackKey}`,
              backgroundColor: mint,
              borderColor: mintBorder,
              text: `${actor} gave you a Second Chance!`,
            });
          }
        }
        queueMicrotask(() => void postMove({ type: "ACK_TARGET_NOTIFY" }));
      }
    } else {
      pendingTargetKeyRef.current = null;
    }

    if (!board) {
      prevSecondChanceRef.current = null;
      secondRevealSerialRef.current = null;
      prevFlipSevenRef.current = null;
      prevStatusRef.current = null;
      return;
    }

    // --- Extra Second Chance discarded (holder already has SC and no other player can take it) ---
    const feed = gs.groupFeed ?? [];
    for (const e of feed) {
      if (e.kind === "second_chance_discarded" && e.actorId === you) {
        const scFill = SECOND_CHANCE_FILL;
        tryPush({
          id: `sc-dup-discard-${e.id}`,
          backgroundColor: scFill,
          borderColor: darkerOutline(scFill),
          text:
            "You drew a Second Chance, but it was discarded — you already have one and there’s no other player to give it to.",
        });
      }
    }

    // --- Second Chance save (reveal card) ---
    if (phase.t !== "bust_reveal") {
      const rev = board.secondChanceRevealCard;
      const ser = rev && rev.k === "n" ? JSON.stringify(rev) : null;
      if (ser && ser !== secondRevealSerialRef.current) {
        secondRevealSerialRef.current = ser;
        tryPush({
          id: `sc-save-${version}-${ser}`,
          backgroundColor: mint,
          borderColor: mintBorder,
          text: `You drew a ${cardLabel(rev as Card)} and were saved by a Second Chance!`,
        });
      }
      if (!ser) secondRevealSerialRef.current = null;
    }

    // --- Second Chance on board without opponent gift pending ---
    /** Opponent played Second on you (gift toast); or Flip 3 on you — second may appear from that sequence */
    const suppressSecondDrew =
      (pt &&
        pt.targetPlayerId === you &&
        pt.card.k === "a" &&
        pt.card.v === "second" &&
        pt.actorPlayerId !== you &&
        pt.actorPlayerId !== pt.targetPlayerId) ||
      (pt &&
        pt.targetPlayerId === you &&
        pt.card.k === "a" &&
        pt.card.v === "flip3");

    if (
      phase.t !== "bust_reveal" &&
      !suppressSecondDrew &&
      prevSecondChanceRef.current !== null &&
      prevSecondChanceRef.current === false &&
      board.secondChance === true
    ) {
      tryPush({
        id: `sc-drew-${version}`,
        backgroundColor: mint,
        borderColor: mintBorder,
        text: "You drew a Second Chance!",
      });
    }
    prevSecondChanceRef.current = board.secondChance;

    // --- Flip 7 ---
    const flip7Now =
      hasFlipSeven(board.nums) && board.status !== "bust" && phase.t !== "bust_reveal";
    if (
      prevFlipSevenRef.current !== null &&
      !prevFlipSevenRef.current &&
      flip7Now
    ) {
      const mid =
        flipThreeGiftAwaitingFlip7Ref.current ||
        (phase.t === "choose_action" && phase.context === "flip3");
      flipThreeGiftAwaitingFlip7Ref.current = false;
      tryPush({
        id: `flip7-${version}-${mid ? "mid" : "norm"}`,
        backgroundColor: mint,
        borderColor: mintBorder,
        text: mid
          ? "Flip 7! Bonus flips stop — +15 points!"
          : "You got Flip 7! +15 points!",
      });
    }
    prevFlipSevenRef.current = flip7Now;

    // --- Stay ---
    const st = board.status;
    if (
      prevStatusRef.current === "active" &&
      st === "stayed" &&
      phase.t !== "bust_reveal"
    ) {
      tryPush({
        id: `stay-${version}`,
        backgroundColor: freezeBg,
        borderColor: freezeBorder,
        text: "You stayed.",
      });
    }
    prevStatusRef.current = st;
  }, [clearAll, playingPayload, playerId, postMove, tryPush]);

  useEffect(() => {
    if (!playingPayload || !playerId) return;
    const phase = playingPayload.game.state.phase;
    const you = playerId;

    if (
      phase.t === "round_summary" ||
      phase.t === "game_summary" ||
      phase.t === "game_over"
    ) {
      if (bustTimerRef.current != null) {
        clearTimeout(bustTimerRef.current);
        bustTimerRef.current = null;
      }
      bustScheduleKeyRef.current = null;
      bustToastEnqueuedKeys.clear();
      return;
    }

    if (phase.t !== "bust_reveal" || phase.bustedPlayerId !== you) {
      if (bustTimerRef.current != null) {
        clearTimeout(bustTimerRef.current);
        bustTimerRef.current = null;
      }
      bustScheduleKeyRef.current = null;
      return;
    }

    const stable = bustStableKey(phase.roundIndex, you);
    if (bustScheduleKeyRef.current === stable) {
      return;
    }
    bustScheduleKeyRef.current = stable;

    const bustFill = SECOND_CHANCE_FILL;
    const bustMsgId = `bust-${phase.roundIndex}-${you}`;
    if (!bustToastEnqueuedKeys.has(stable)) {
      bustToastEnqueuedKeys.add(stable);
      tryPush({
        id: bustMsgId,
        backgroundColor: bustFill,
        borderColor: darkerOutline(bustFill),
        text: "You drew a duplicate. You’re out!",
      });
    }

    const waitForRoundEnd = phase.scoringPending !== false;
    if (waitForRoundEnd) {
      if (bustTimerRef.current === null) {
        bustTimerRef.current = window.setTimeout(() => {
          bustTimerRef.current = null;
          void postMove({ type: "ACK_BUST_REVEAL" });
        }, 10_000);
      }
    } else {
      queueMicrotask(() => void postMove({ type: "ACK_BUST_REVEAL" }));
    }
  }, [playingPayload, playerId, postMove, tryPush]);

  useEffect(
    () => () => {
      if (bustTimerRef.current != null) {
        clearTimeout(bustTimerRef.current);
        bustTimerRef.current = null;
      }
    },
    [],
  );

  return { messages };
}
