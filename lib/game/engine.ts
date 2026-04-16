import { buildDeck, shuffle } from "./deck";
import type { ActionResume, Card, GameState, PlayerBoard } from "./types";
import { hasFlipSeven, isActive, scoreBoard } from "./rules";

const WIN = 200;

/** Round just ended (summary) or game ended — stop advancing play */
function roundOrGameEnded(phase: GameState["phase"]): boolean {
  return (
    phase.t === "round_summary" ||
    phase.t === "game_summary" ||
    phase.t === "game_over" ||
    phase.t === "bust_reveal"
  );
}

/**
 * After a duplicate bust: if the round would end, show bust UI first (unless Flip 7 wins).
 * `bustedPlayerId` is the player whose board just went bust.
 */
function maybeFinishRoundAfterBust(
  state: GameState,
  bustedPlayerId: string
): GameState {
  if (roundEndedByFlip7(state)) {
    return applyTotalsAndCheckGameOver(state);
  }
  if (allInactive(state)) {
    const b = state.boards[bustedPlayerId];
    if (b?.status === "bust") {
      return {
        ...state,
        phase: {
          t: "bust_reveal",
          roundIndex: state.roundIndex,
          bustedPlayerId,
        },
      };
    }
    return applyTotalsAndCheckGameOver(state);
  }
  return maybeFinishRound(state);
}

/** Play order each round: starts at seat after dealer; dealer seat advances each round so “who goes first” rotates with fixed seat order. */
export function dealSeatOrder(dealerSeat: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => (dealerSeat + 1 + i) % n);
}

function emptyBoard(): PlayerBoard {
  return {
    nums: [],
    flatMods: [],
    hasX2: false,
    secondChance: false,
    status: "active",
  };
}

export function createNewGame(seats: string[], dealerSeat: number): GameState {
  const deck = shuffle(buildDeck());
  const boards: Record<string, PlayerBoard> = {};
  for (const id of seats) boards[id] = emptyBoard();
  const totals: Record<string, number> = {};
  for (const id of seats) totals[id] = 0;
  return {
    phase: { t: "initial_deal", dealIndex: 0 },
    dealerSeat,
    seats,
    boards,
    drawPile: deck,
    discardPile: [],
    totals,
    roundIndex: 1,
    roundScoresHistory: [],
    pendingTargetAck: null,
  };
}

function pidAt(state: GameState, seat: number): string {
  return state.seats[seat];
}

export function seatOf(state: GameState, playerId: string): number {
  const i = state.seats.indexOf(playerId);
  if (i < 0) throw new Error("Player not in game");
  return i;
}

function ensureDraw(state: GameState): GameState {
  if (state.drawPile.length > 0) return state;
  if (state.discardPile.length === 0) return state;
  return {
    ...state,
    drawPile: shuffle([...state.discardPile]),
    discardPile: [],
  };
}

function popDraw(state: GameState): { state: GameState; card: Card | undefined } {
  let s = ensureDraw(state);
  if (s.drawPile.length === 0) return { state: s, card: undefined };
  const card = s.drawPile[s.drawPile.length - 1];
  return { state: { ...s, drawPile: s.drawPile.slice(0, -1) }, card };
}

function nextActiveSeat(state: GameState, fromSeat: number): number {
  const n = state.seats.length;
  for (let k = 1; k <= n; k++) {
    const s = (fromSeat + k) % n;
    if (isActive(state.boards[pidAt(state, s)])) return s;
  }
  return -1;
}

function firstPlaySeat(state: GameState): number {
  for (const s of dealSeatOrder(state.dealerSeat, state.seats.length)) {
    if (isActive(state.boards[pidAt(state, s)])) return s;
  }
  return -1;
}

function roundEndedByFlip7(state: GameState): boolean {
  return state.seats.some((id) => hasFlipSeven(state.boards[id].nums));
}

function allInactive(state: GameState): boolean {
  return state.seats.every((id) => !isActive(state.boards[id]));
}

function collectRoundCardsToDiscard(state: GameState): Card[] {
  const out: Card[] = [];
  for (const id of state.seats) {
    const b = state.boards[id];
    out.push(...b.nums, ...b.flatMods);
    if (b.hasX2) out.push({ k: "m", v: "x2" });
    if (b.secondChance) out.push({ k: "a", v: "second" });
  }
  return out;
}

function applyTotalsAndCheckGameOver(state: GameState): GameState {
  const roundScores: Record<string, number> = {};
  for (const id of state.seats) {
    roundScores[id] = scoreBoard(state.boards[id]);
  }
  const totals = { ...state.totals };
  for (const id of state.seats) {
    totals[id] = (totals[id] ?? 0) + roundScores[id];
  }
  const roundScoresHistory = [
    ...(state.roundScoresHistory ?? []),
    { roundIndex: state.roundIndex, scores: { ...roundScores } },
  ];
  const max = Math.max(...state.seats.map((id) => totals[id] ?? 0));
  const leaders = state.seats.filter((id) => (totals[id] ?? 0) === max);
  const any200 = state.seats.some((id) => (totals[id] ?? 0) >= WIN);

  if (any200 && leaders.length === 1) {
    return {
      ...state,
      totals,
      roundScoresHistory,
      phase: {
        t: "game_summary",
        winnerSeat: state.seats.indexOf(leaders[0]),
        roundIndex: state.roundIndex,
        roundScores,
        acknowledged: [],
      },
    };
  }

  return {
    ...state,
    totals,
    roundScoresHistory,
    phase: {
      t: "round_summary",
      roundIndex: state.roundIndex,
      roundScores,
      acknowledged: [],
    },
  };
}

function startNextRound(prev: GameState): GameState {
  const n = prev.seats.length;
  /** Rotate dealer so first-to-act (left of dealer) shifts each round; `seats` order unchanged. */
  const dealerSeat = (prev.dealerSeat + 1) % n;
  const deck = shuffle([
    ...prev.drawPile,
    ...prev.discardPile,
    ...collectRoundCardsToDiscard(prev),
  ]);
  const boards: Record<string, PlayerBoard> = {};
  for (const id of prev.seats) boards[id] = emptyBoard();
  return {
    ...prev,
    phase: { t: "initial_deal", dealIndex: 0 },
    dealerSeat,
    boards,
    drawPile: deck,
    discardPile: [],
    roundIndex: prev.roundIndex + 1,
    pendingTargetAck: null,
  };
}

function maybeFinishRound(state: GameState): GameState {
  if (roundEndedByFlip7(state) || allInactive(state)) {
    return applyTotalsAndCheckGameOver(state);
  }
  return state;
}

function advanceTurnAfter(state: GameState, actedSeat: number): GameState {
  const next = nextActiveSeat(state, actedSeat);
  if (next < 0) return maybeFinishRound(state);
  return maybeFinishRound({
    ...state,
    phase: { t: "play", currentTurnSeat: next },
  });
}

function applyNumber(
  board: PlayerBoard,
  card: Card & { k: "n" }
): { board: PlayerBoard; busted: boolean } {
  if (board.nums.some((c) => c.v === card.v)) {
    if (board.secondChance) {
      return { board: { ...board, secondChance: false }, busted: false };
    }
    return {
      board: {
        ...board,
        nums: [...board.nums, card],
        status: "bust",
      },
      busted: true,
    };
  }
  return { board: { ...board, nums: [...board.nums, card] }, busted: false };
}

function applyModifier(board: PlayerBoard, card: Card & { k: "m" }): PlayerBoard {
  if (card.v === "x2") return { ...board, hasX2: true };
  return { ...board, flatMods: [...board.flatMods, card] };
}

function withBoard(
  state: GameState,
  seat: number,
  board: PlayerBoard
): GameState {
  const pid = pidAt(state, seat);
  return { ...state, boards: { ...state.boards, [pid]: board } };
}

function withPendingTargetAck(
  s: GameState,
  targetPid: string,
  actorPid: string,
  card: Card
): GameState {
  return {
    ...s,
    pendingTargetAck: {
      targetPlayerId: targetPid,
      actorPlayerId: actorPid,
      card,
    },
  };
}

/** Keep pendingTargetAck when a follow-up transition returns a new object without it */
function carryPendingTargetAck(before: GameState, after: GameState): GameState {
  if (!before.pendingTargetAck) return after;
  return { ...after, pendingTargetAck: before.pendingTargetAck };
}

function applyResume(state: GameState, resume: ActionResume): GameState {
  if (resume.kind === "deal") {
    return runDealFromIndex({
      ...state,
      phase: { t: "initial_deal", dealIndex: resume.nextDealIndex },
    });
  }
  return advanceTurnAfter(state, resume.hitSeat);
}

/**
 * Flip Three: draw up to 3 cards for the target. Stops early on bust or as soon as the target
 * has 7 unique number values (Flip 7) — remaining Flip 3 draws are not taken.
 */
function runFlipThree(
  state: GameState,
  targetSeat: number,
  resume: ActionResume
): GameState {
  let s = state;
  const deferred: Card[] = [];
  const targetPid = pidAt(s, targetSeat);

  let flipBust = false;
  for (let i = 0; i < 3; i++) {
    const p = popDraw(s);
    if (!p.card) break;
    s = p.state;
    const c = p.card;

    if (c.k === "n") {
      const r = applyNumber(s.boards[targetPid], c);
      s = withBoard(s, targetSeat, r.board);
      if (r.busted) {
        flipBust = true;
        break;
      }
      if (hasFlipSeven(s.boards[targetPid].nums)) break;
    } else if (c.k === "m") {
      s = withBoard(
        s,
        targetSeat,
        applyModifier(s.boards[targetPid], c)
      );
    } else if (c.v === "second") {
      const b = s.boards[targetPid];
      if (!b.secondChance) {
        s = withBoard(s, targetSeat, { ...b, secondChance: true });
      } else {
        deferred.push(c);
      }
    } else {
      deferred.push(c);
    }
  }

  if (flipBust) {
    s = maybeFinishRoundAfterBust(s, targetPid);
  } else {
    s = maybeFinishRound(s);
  }
  if (roundOrGameEnded(s.phase)) return s;

  if (deferred.length > 0) {
    const [first, ...rest] = deferred;
    return {
      ...s,
      phase: {
        t: "choose_action",
        chooserSeat: targetSeat,
        card: first,
        context: "flip3",
        resume,
        deferred: rest.length ? rest : undefined,
      },
    };
  }

  return applyResume(s, resume);
}

function afterChooseAction(
  state: GameState,
  resume: ActionResume,
  deferred: Card[] | undefined,
  chooserSeat: number
): GameState {
  if (deferred && deferred.length > 0) {
    const [first, ...rest] = deferred;
    return {
      ...state,
      phase: {
        t: "choose_action",
        chooserSeat,
        card: first,
        context: "flip3",
        resume,
        deferred: rest.length ? rest : undefined,
      },
    };
  }
  return applyResume(state, resume);
}

export function submitActionTarget(
  state: GameState,
  chooserPlayerId: string,
  targetPlayerId: string
): GameState {
  if (state.phase.t !== "choose_action") throw new Error("Not choosing action");
  const ph = state.phase;
  if (seatOf(state, chooserPlayerId) !== ph.chooserSeat) {
    throw new Error("Not your choice");
  }
  const card = ph.card;
  if (card.k !== "a") throw new Error("Invalid card");

  const targetSeat = seatOf(state, targetPlayerId);
  const targetPid = targetPlayerId;
  let s = state;

  if (card.v === "freeze") {
    const tb = s.boards[targetPid];
    if (!isActive(tb)) throw new Error("Invalid target");
    s = withBoard(s, targetSeat, { ...tb, status: "frozen" });
    s = withPendingTargetAck(s, targetPid, chooserPlayerId, card);
    s = maybeFinishRound(s);
    if (roundOrGameEnded(s.phase)) return s;
    return carryPendingTargetAck(
      s,
      afterChooseAction(s, ph.resume, ph.deferred, ph.chooserSeat)
    );
  }

  if (card.v === "flip3") {
    const tb = s.boards[targetPid];
    if (!isActive(tb)) throw new Error("Invalid target");
    return runFlipThree(
      withPendingTargetAck(s, targetPid, chooserPlayerId, card),
      targetSeat,
      ph.resume
    );
  }

  if (card.v === "second") {
    const tb = s.boards[targetPid];
    if (!isActive(tb)) throw new Error("Invalid target");
    if (tb.secondChance) {
      throw new Error("Pick another player — they already have Second Chance");
    }
    s = withBoard(s, targetSeat, { ...tb, secondChance: true });
    s = withPendingTargetAck(s, targetPid, chooserPlayerId, card);
    s = maybeFinishRound(s);
    if (roundOrGameEnded(s.phase)) return s;
    return carryPendingTargetAck(
      s,
      afterChooseAction(s, ph.resume, ph.deferred, ph.chooserSeat)
    );
  }

  throw new Error("Unhandled action");
}

export function runDealFromIndex(state: GameState): GameState {
  const n = state.seats.length;
  const order = dealSeatOrder(state.dealerSeat, n);
  let s = state;
  let idx = s.phase.t === "initial_deal" ? s.phase.dealIndex : 0;

  while (idx < n) {
    const seat = order[idx];
    const p = popDraw(s);
    if (!p.card) {
      return { ...s, phase: { t: "initial_deal", dealIndex: idx } };
    }
    s = p.state;
    const card = p.card;

    if (card.k === "a") {
      return {
        ...s,
        phase: {
          t: "choose_action",
          chooserSeat: seat,
          card,
          context: "deal",
          resume: { kind: "deal", nextDealIndex: idx + 1 },
        },
      };
    }

    if (card.k === "m") {
      s = withBoard(
        s,
        seat,
        applyModifier(s.boards[pidAt(s, seat)], card)
      );
    } else {
      const r = applyNumber(s.boards[pidAt(s, seat)], card);
      s = withBoard(s, seat, r.board);
    }

    idx += 1;
  }

  const turn = firstPlaySeat(s);
  if (turn < 0) return maybeFinishRound(s);
  return maybeFinishRound({ ...s, phase: { t: "play", currentTurnSeat: turn } });
}

export function submitHit(state: GameState, playerId: string): GameState {
  if (state.phase.t !== "play") throw new Error("Not in play");
  const seat = seatOf(state, playerId);
  if (state.phase.currentTurnSeat !== seat) throw new Error("Not your turn");
  const b = state.boards[playerId];
  if (!isActive(b)) throw new Error("Not active");

  const p = popDraw(state);
  if (!p.card) throw new Error("Deck empty");
  let s = p.state;
  const card = p.card;

  if (card.k === "n") {
    const r = applyNumber(s.boards[playerId], card);
    s = withBoard(s, seat, r.board);
    if (r.busted) {
      s = maybeFinishRoundAfterBust(s, playerId);
    } else {
      s = maybeFinishRound(s);
    }
    if (roundOrGameEnded(s.phase)) return s;
    return advanceTurnAfter(s, seat);
  }

  if (card.k === "m") {
    s = withBoard(s, seat, applyModifier(s.boards[playerId], card));
    s = maybeFinishRound(s);
    if (roundOrGameEnded(s.phase)) return s;
    return advanceTurnAfter(s, seat);
  }

  return {
    ...s,
    phase: {
      t: "choose_action",
      chooserSeat: seat,
      card,
      context: "hit",
      resume: { kind: "hit", hitSeat: seat },
    },
  };
}

export function submitStay(state: GameState, playerId: string): GameState {
  if (state.phase.t !== "play") throw new Error("Not in play");
  const seat = seatOf(state, playerId);
  if (state.phase.currentTurnSeat !== seat) throw new Error("Not your turn");
  const b = state.boards[playerId];
  if (!isActive(b)) throw new Error("Not active");
  let s = {
    ...state,
    boards: {
      ...state.boards,
      [playerId]: { ...b, status: "stayed" as const },
    },
  };
  s = maybeFinishRound(s);
  if (roundOrGameEnded(s.phase)) return s;
  return advanceTurnAfter(s, seat);
}

export function submitAckTargetNotification(
  state: GameState,
  playerId: string
): GameState {
  const p = state.pendingTargetAck;
  if (!p) throw new Error("No pending target notification");
  if (p.targetPlayerId !== playerId) {
    throw new Error("Not your notification");
  }
  return { ...state, pendingTargetAck: null };
}

export function submitAckBustReveal(
  state: GameState,
  playerId: string
): GameState {
  if (state.phase.t !== "bust_reveal") {
    throw new Error("Not in bust reveal");
  }
  if (state.phase.bustedPlayerId !== playerId) {
    throw new Error("Only the busted player can acknowledge");
  }
  return applyTotalsAndCheckGameOver(state);
}

export function submitAckRoundSummary(
  state: GameState,
  playerId: string
): GameState {
  if (state.phase.t !== "round_summary") {
    throw new Error("Not between rounds");
  }
  if (!state.seats.includes(playerId)) throw new Error("Invalid player");
  const acknowledged = [...new Set([...state.phase.acknowledged, playerId])];
  if (acknowledged.length < state.seats.length) {
    return {
      ...state,
      phase: { ...state.phase, acknowledged },
    };
  }
  return bootstrapDeal(startNextRound(state));
}

export function submitAckGameSummary(
  state: GameState,
  playerId: string
): GameState {
  if (state.phase.t !== "game_summary") {
    throw new Error("Not in game summary");
  }
  if (!state.seats.includes(playerId)) throw new Error("Invalid player");
  const acknowledged = [...new Set([...state.phase.acknowledged, playerId])];
  if (acknowledged.length < state.seats.length) {
    return {
      ...state,
      phase: { ...state.phase, acknowledged },
    };
  }
  return {
    ...state,
    pendingTargetAck: null,
    phase: { t: "game_over", winnerSeat: state.phase.winnerSeat },
  };
}

export function bootstrapDeal(state: GameState): GameState {
  return runDealFromIndex(state);
}
