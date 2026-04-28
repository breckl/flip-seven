import { applyMove, type ClientMove } from "@/lib/server/apply-move";
import { scoreBoard } from "@/lib/game/rules";
import type { Card, GameState, PlayerBoard } from "@/lib/game/types";

const MAX_AUTOPLAY_STEPS = 200;

function sumNumbers(board: PlayerBoard): number {
  return board.nums.reduce((acc, c) => acc + (c.k === "n" ? c.v : 0), 0);
}

function flatModValue(card: Card & { k: "m" }): number {
  switch (card.v) {
    case "p2":
      return 2;
    case "p4":
      return 4;
    case "p6":
      return 6;
    case "p8":
      return 8;
    case "p10":
      return 10;
    default:
      return 0;
  }
}

function estimateHitDelta(state: GameState, playerId: string, card: Card): number {
  const board = state.boards[playerId];
  const currentScore = scoreBoard(board);

  if (card.k === "n") {
    const duplicate = board.nums.some((c) => c.v === card.v);
    if (duplicate) {
      if (board.secondChance) return -1;
      return -currentScore;
    }
    const base = board.hasX2 ? card.v * 2 : card.v;
    const nextUniqueCount = new Set([...board.nums.map((c) => c.v), card.v]).size;
    const flip7Bonus = nextUniqueCount >= 7 ? 15 : 0;
    return base + flip7Bonus;
  }

  if (card.k === "m") {
    if (card.v === "x2") {
      return sumNumbers(board);
    }
    return flatModValue(card);
  }

  if (card.v === "second") return board.secondChance ? 1 : 8;
  if (card.v === "freeze") return 4;
  return 6;
}

function chooseHitOrStay(state: GameState, botId: string): ClientMove {
  const board = state.boards[botId];
  const draw = state.drawPile;
  if (!board || board.status !== "active" || draw.length === 0) {
    return { type: "STAY" };
  }

  const currentScore = scoreBoard(board);
  let bustOuts = 0;
  let deltaSum = 0;
  const seen = new Set(board.nums.map((c) => c.v));

  for (const card of draw) {
    if (card.k === "n" && seen.has(card.v) && !board.secondChance) bustOuts += 1;
    deltaSum += estimateHitDelta(state, botId, card);
  }

  const bustProb = bustOuts / draw.length;
  const expectedDelta = deltaSum / draw.length;

  if (currentScore < 20) {
    return bustProb > 0.55 && expectedDelta < 2 ? { type: "STAY" } : { type: "HIT" };
  }
  if (currentScore < 40) {
    return expectedDelta > 0 || bustProb < 0.33 ? { type: "HIT" } : { type: "STAY" };
  }
  if (currentScore < 65) {
    return expectedDelta > 2 && bustProb < 0.4 ? { type: "HIT" } : { type: "STAY" };
  }
  return expectedDelta > 4 && bustProb < 0.25 ? { type: "HIT" } : { type: "STAY" };
}

function chooseTargetByThreat(
  state: GameState,
  candidates: string[],
  botPlayerIds: Set<string>,
): string {
  const ranked = [...candidates].sort((a, b) => {
    const aThreat = (state.totals[a] ?? 0) + scoreBoard(state.boards[a]);
    const bThreat = (state.totals[b] ?? 0) + scoreBoard(state.boards[b]);
    const aIsHuman = botPlayerIds.has(a) ? 0 : 1;
    const bIsHuman = botPlayerIds.has(b) ? 0 : 1;
    if (aIsHuman !== bIsHuman) return bIsHuman - aIsHuman;
    return bThreat - aThreat;
  });
  return ranked[0];
}

function chooseActionTarget(state: GameState, botPlayerId: string, botPlayerIds: Set<string>): string {
  if (state.phase.t !== "choose_action") return botPlayerId;
  const card = state.phase.card;
  if (card.k !== "a") return botPlayerId;

  const active = state.seats.filter((id) => state.boards[id]?.status === "active");
  if (active.length === 1) return active[0];

  if (card.v === "second") {
    if (state.boards[botPlayerId]?.status === "active" && !state.boards[botPlayerId].secondChance) {
      return botPlayerId;
    }
    const withoutSecond = active.filter((id) => !state.boards[id].secondChance);
    if (withoutSecond.length > 0) {
      return chooseTargetByThreat(state, withoutSecond, botPlayerIds);
    }
    return active[0];
  }

  const nonSelf = active.filter((id) => id !== botPlayerId);
  if (nonSelf.length === 0) return botPlayerId;
  return chooseTargetByThreat(state, nonSelf, botPlayerIds);
}

function nextBotMove(state: GameState, botPlayerIds: Set<string>): { actorId: string; move: ClientMove } | null {
  const pendingAck = state.pendingTargetAck;
  if (pendingAck && botPlayerIds.has(pendingAck.targetPlayerId)) {
    return { actorId: pendingAck.targetPlayerId, move: { type: "ACK_TARGET_NOTIFY" } };
  }

  if (state.phase.t === "bust_reveal" && botPlayerIds.has(state.phase.bustedPlayerId)) {
    return { actorId: state.phase.bustedPlayerId, move: { type: "ACK_BUST_REVEAL" } };
  }

  if (state.phase.t === "round_summary") {
    const phase = state.phase;
    const botNeedingAck = state.seats.find(
      (id) => botPlayerIds.has(id) && !phase.acknowledged.includes(id),
    );
    if (botNeedingAck) return { actorId: botNeedingAck, move: { type: "ACK_ROUND_SUMMARY" } };
  }

  if (state.phase.t === "game_summary") {
    const phase = state.phase;
    const botNeedingAck = state.seats.find(
      (id) => botPlayerIds.has(id) && !phase.acknowledged.includes(id),
    );
    if (botNeedingAck) return { actorId: botNeedingAck, move: { type: "ACK_GAME_SUMMARY" } };
  }

  if (state.phase.t === "choose_action") {
    const actorId = state.seats[state.phase.chooserSeat];
    if (!botPlayerIds.has(actorId)) return null;
    return {
      actorId,
      move: { type: "ACTION_TARGET", targetPlayerId: chooseActionTarget(state, actorId, botPlayerIds) },
    };
  }

  if (state.phase.t === "play") {
    const actorId = state.seats[state.phase.currentTurnSeat];
    if (!botPlayerIds.has(actorId)) return null;
    return { actorId, move: chooseHitOrStay(state, actorId) };
  }

  return null;
}

export function applyBotAutoplay(state: GameState, botPlayerIds: string[]): GameState {
  if (botPlayerIds.length === 0) return state;
  const botSet = new Set(botPlayerIds);
  let next = state;
  for (let i = 0; i < MAX_AUTOPLAY_STEPS; i++) {
    const step = nextBotMove(next, botSet);
    if (!step) break;
    next = applyMove(next, step.actorId, step.move);
  }
  return next;
}
