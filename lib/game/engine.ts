import { buildDeck, shuffle } from "./deck";
import { appendGroupFeed } from "./group-feed";
import type { ActionResume, Card, GameState, PlayerBoard } from "./types";
import { hasFlipSeven, isActive, scoreBoard } from "./rules";

const WIN = 200;

function withFeedDrewCard(
  state: GameState,
  actorId: string,
  card: Card,
): GameState {
  return appendGroupFeed(state, {
    kind: "drew_card",
    roundIndex: state.roundIndex,
    actorId,
    card,
  });
}

function withFeedActionWaiting(
  state: GameState,
  actorId: string,
  card: Card & { k: "a" },
): GameState {
  return appendGroupFeed(state, {
    kind: "action_waiting",
    roundIndex: state.roundIndex,
    actorId,
    card,
  });
}

function withFeedGaveAction(
  state: GameState,
  actorId: string,
  targetId: string,
  card: Card & { k: "a" },
): GameState {
  return appendGroupFeed(state, {
    kind: "gave_action",
    roundIndex: state.roundIndex,
    actorId,
    targetId,
    card,
  });
}

function withFeedDuplicateOut(
  state: GameState,
  actorId: string,
  numberValue: number,
): GameState {
  return appendGroupFeed(state, {
    kind: "duplicate_out",
    roundIndex: state.roundIndex,
    actorId,
    numberValue,
  });
}

function withFeedDuplicateSaved(
  state: GameState,
  actorId: string,
  numberValue: number,
): GameState {
  return appendGroupFeed(state, {
    kind: "duplicate_saved",
    roundIndex: state.roundIndex,
    actorId,
    numberValue,
  });
}

function withFeedFlip7Bonus(state: GameState, actorId: string): GameState {
  return appendGroupFeed(state, {
    kind: "flip7_bonus",
    roundIndex: state.roundIndex,
    actorId,
  });
}

function withFeedStayed(state: GameState, actorId: string): GameState {
  return appendGroupFeed(state, {
    kind: "stayed",
    roundIndex: state.roundIndex,
    actorId,
  });
}

function withFeedSecondChanceDiscarded(
  state: GameState,
  actorId: string,
  card: Card & { k: "a"; v: "second" },
): GameState {
  return appendGroupFeed(state, {
    kind: "second_chance_discarded",
    roundIndex: state.roundIndex,
    actorId,
    card,
  });
}

function maybeFeedFlip7(
  state: GameState,
  prevBoard: PlayerBoard,
  newBoard: PlayerBoard,
  playerId: string,
): GameState {
  const had = hasFlipSeven(prevBoard.nums);
  const has = hasFlipSeven(newBoard.nums);
  if (!had && has && newBoard.status !== "bust") {
    return withFeedFlip7Bonus(state, playerId);
  }
  return state;
}

function afterNumberDraw(
  state: GameState,
  actorId: string,
  card: Card & { k: "n" },
  prevBoard: PlayerBoard,
  r: { board: PlayerBoard; busted: boolean },
): GameState {
  let s = withFeedDrewCard(state, actorId, card);
  if (r.busted) {
    s = withFeedDuplicateOut(s, actorId, card.v);
  } else if (r.board.secondChanceRevealCard) {
    s = withFeedDuplicateSaved(s, actorId, card.v);
  }
  s = maybeFeedFlip7(s, prevBoard, r.board, actorId);
  return s;
}

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
          scoringPending: true,
        },
      };
    }
    return applyTotalsAndCheckGameOver(state);
  }
  const b = state.boards[bustedPlayerId];
  if (b?.status === "bust") {
    return {
      ...state,
      phase: {
        t: "bust_reveal",
        roundIndex: state.roundIndex,
        bustedPlayerId,
        scoringPending: false,
      },
    };
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
    secondChanceRevealCard: undefined,
  };
}

/** Clears transient Second Chance reveal markers before applying a new move (next poll still sees reveal from prior hit). */
function clearSecondChanceReveals(s: GameState): GameState {
  let changed = false;
  const boards = { ...s.boards };
  for (const id of s.seats) {
    const b = boards[id];
    if (b?.secondChanceRevealCard) {
      boards[id] = { ...b, secondChanceRevealCard: undefined };
      changed = true;
    }
  }
  return changed ? { ...s, boards } : s;
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
    groupFeed: [],
    groupFeedSeq: 0,
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

/** Single active player in the round (everyone else bust / stayed / frozen). */
function onlyActivePlayerId(state: GameState): string | null {
  let count = 0;
  let last: string | null = null;
  for (const id of state.seats) {
    if (isActive(state.boards[id])) {
      count += 1;
      last = id;
    }
  }
  return count === 1 ? last : null;
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
    groupFeed: [],
    groupFeedSeq: 0,
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
      return {
        board: {
          ...board,
          secondChance: false,
          secondChanceRevealCard: card,
        },
        busted: false,
      };
    }
    return {
      board: {
        ...board,
        nums: [...board.nums, card],
        status: "bust",
        secondChanceRevealCard: undefined,
      },
      busted: true,
    };
  }
  return {
    board: {
      ...board,
      nums: [...board.nums, card],
      secondChanceRevealCard: undefined,
    },
    busted: false,
  };
}

function applyModifier(board: PlayerBoard, card: Card & { k: "m" }): PlayerBoard {
  if (card.v === "x2") {
    return { ...board, hasX2: true, secondChanceRevealCard: undefined };
  }
  return {
    ...board,
    flatMods: [...board.flatMods, card],
    secondChanceRevealCard: undefined,
  };
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
      const prevB = s.boards[targetPid];
      const r = applyNumber(prevB, c);
      s = withBoard(s, targetSeat, r.board);
      s = afterNumberDraw(s, targetPid, c, prevB, r);
      if (r.busted) {
        flipBust = true;
        break;
      }
      if (hasFlipSeven(s.boards[targetPid].nums)) break;
    } else if (c.k === "m") {
      const prevB = s.boards[targetPid];
      const nextB = applyModifier(prevB, c);
      s = withBoard(s, targetSeat, nextB);
      s = withFeedDrewCard(s, targetPid, c);
      s = maybeFeedFlip7(s, prevB, nextB, targetPid);
    } else if (c.v === "second") {
      const b = s.boards[targetPid];
      if (!b.secondChance) {
        s = withFeedDrewCard(s, targetPid, c);
        s = withBoard(s, targetSeat, {
          ...b,
          secondChance: true,
          secondChanceRevealCard: undefined,
        });
      } else {
        s = withFeedDrewCard(s, targetPid, c);
        deferred.push(c);
      }
    } else {
      s = withFeedDrewCard(s, targetPid, c);
      deferred.push(c);
    }
  }

  if (flipBust) {
    s = maybeFinishRoundAfterBust(s, targetPid);
  } else {
    s = maybeFinishRound(s);
  }
  if (roundOrGameEnded(s.phase)) return s;

  /** Flip3 target may have busted; they must not get choose_action for deferred draws. */
  if (!isActive(s.boards[targetPid])) {
    return applyResume(s, resume);
  }

  if (deferred.length > 0) {
    const [first, ...rest] = deferred;
    if (first.k !== "a") throw new Error("Deferred flip3 card must be action");
    return {
      ...withFeedActionWaiting(s, targetPid, first),
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
    const chooserPid = pidAt(state, chooserSeat);
    if (!isActive(state.boards[chooserPid])) {
      return applyResume(state, resume);
    }
    const [first, ...rest] = deferred;
    if (first.k !== "a") throw new Error("Deferred flip3 card must be action");
    return {
      ...withFeedActionWaiting(state, chooserPid, first),
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

/**
 * Apply Freeze / Flip 3 / Second Chance to a target after the chooser picked (or solo auto).
 * When soloOnly, Second Chance skips target notification (card stays in hand until used).
 */
function applyActionCardAsChooser(
  s: GameState,
  chooserSeat: number,
  chooserPlayerId: string,
  targetPlayerId: string,
  card: Card & { k: "a" },
  resume: ActionResume,
  deferred: Card[] | undefined,
  soloOnly: boolean,
): GameState {
  const targetSeat = seatOf(s, targetPlayerId);
  const targetPid = targetPlayerId;

  /** Last active player only: cannot hold two Second Chances or give one away — discard the extra. */
  if (card.v === "second" && soloOnly) {
    const tb = s.boards[targetPid];
    if (tb.secondChance) {
      let out: GameState = {
        ...s,
        discardPile: [...s.discardPile, card],
      };
      out = withFeedSecondChanceDiscarded(out, chooserPlayerId, card);
      out = maybeFinishRound(out);
      if (roundOrGameEnded(out.phase)) return out;
      return afterChooseAction(out, resume, deferred, chooserSeat);
    }
  }

  const sGift = withFeedGaveAction(s, chooserPlayerId, targetPlayerId, card);

  if (card.v === "freeze") {
    const tb = sGift.boards[targetPid];
    if (!isActive(tb)) throw new Error("Invalid target");
    let out = sGift;
    out = withBoard(out, targetSeat, {
      ...tb,
      status: "frozen",
      secondChanceRevealCard: undefined,
    });
    out = withPendingTargetAck(out, targetPid, chooserPlayerId, card);
    out = maybeFinishRound(out);
    if (roundOrGameEnded(out.phase)) return out;
    return carryPendingTargetAck(
      out,
      afterChooseAction(out, resume, deferred, chooserSeat),
    );
  }

  if (card.v === "flip3") {
    const tb = sGift.boards[targetPid];
    if (!isActive(tb)) throw new Error("Invalid target");
    return runFlipThree(
      withPendingTargetAck(sGift, targetPid, chooserPlayerId, card),
      targetSeat,
      resume,
    );
  }

  if (card.v === "second") {
    const tb = sGift.boards[targetPid];
    if (!isActive(tb)) throw new Error("Invalid target");
    if (tb.secondChance) {
      throw new Error("Pick another player — they already have Second Chance");
    }
    let out = withBoard(sGift, targetSeat, {
      ...tb,
      secondChance: true,
      secondChanceRevealCard: undefined,
    });
    if (!soloOnly) {
      out = withPendingTargetAck(out, targetPid, chooserPlayerId, card);
    }
    out = maybeFinishRound(out);
    if (roundOrGameEnded(out.phase)) return out;
    if (!soloOnly) {
      return carryPendingTargetAck(
        out,
        afterChooseAction(out, resume, deferred, chooserSeat),
      );
    }
    return afterChooseAction(out, resume, deferred, chooserSeat);
  }

  throw new Error("Unhandled action");
}

export function submitActionTarget(
  state: GameState,
  chooserPlayerId: string,
  targetPlayerId: string
): GameState {
  const state0 = clearSecondChanceReveals(state);
  if (state0.phase.t !== "choose_action") throw new Error("Not choosing action");
  const ph = state0.phase;
  if (seatOf(state0, chooserPlayerId) !== ph.chooserSeat) {
    throw new Error("Not your choice");
  }
  const card = ph.card;
  if (card.k !== "a") throw new Error("Invalid card");

  const only = onlyActivePlayerId(state0);
  const soloOnly = only !== null && only === chooserPlayerId;
  const effectiveTargetId = soloOnly ? only : targetPlayerId;
  if (!state0.seats.includes(effectiveTargetId)) {
    throw new Error("Invalid target");
  }

  return applyActionCardAsChooser(
    state0,
    ph.chooserSeat,
    chooserPlayerId,
    effectiveTargetId,
    card,
    ph.resume,
    ph.deferred,
    soloOnly,
  );
}

export function runDealFromIndex(state: GameState): GameState {
  let s = clearSecondChanceReveals(state);
  const n = s.seats.length;
  const order = dealSeatOrder(s.dealerSeat, n);
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
      const pid = pidAt(s, seat);
      const only = onlyActivePlayerId(s);
      if (only && only === pid) {
        s = withFeedDrewCard(s, pid, card);
        return applyActionCardAsChooser(
          s,
          seat,
          pid,
          pid,
          card,
          { kind: "deal", nextDealIndex: idx + 1 },
          undefined,
          true,
        );
      }
      s = withFeedDrewCard(s, pid, card);
      s = withFeedActionWaiting(s, pid, card);
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
      const pid = pidAt(s, seat);
      const prevB = s.boards[pid];
      const nextB = applyModifier(prevB, card);
      s = withBoard(s, seat, nextB);
      s = withFeedDrewCard(s, pid, card);
      s = maybeFeedFlip7(s, prevB, nextB, pid);
    } else {
      const pid = pidAt(s, seat);
      const prevB = s.boards[pid];
      const r = applyNumber(prevB, card);
      s = withBoard(s, seat, r.board);
      s = afterNumberDraw(s, pid, card, prevB, r);
    }

    idx += 1;
  }

  const turn = firstPlaySeat(s);
  if (turn < 0) return maybeFinishRound(s);
  return maybeFinishRound({ ...s, phase: { t: "play", currentTurnSeat: turn } });
}

export function submitHit(state: GameState, playerId: string): GameState {
  let s0 = clearSecondChanceReveals(state);
  if (s0.phase.t !== "play") throw new Error("Not in play");
  const seat = seatOf(s0, playerId);
  if (s0.phase.currentTurnSeat !== seat) throw new Error("Not your turn");
  const b = s0.boards[playerId];
  if (!isActive(b)) throw new Error("Not active");

  const p = popDraw(s0);
  if (!p.card) throw new Error("Deck empty");
  let s = p.state;
  const card = p.card;

  if (card.k === "n") {
    const prevB = s.boards[playerId];
    const r = applyNumber(prevB, card);
    s = withBoard(s, seat, r.board);
    s = afterNumberDraw(s, playerId, card, prevB, r);
    if (r.busted) {
      s = maybeFinishRoundAfterBust(s, playerId);
    } else {
      s = maybeFinishRound(s);
    }
    if (roundOrGameEnded(s.phase)) return s;
    return advanceTurnAfter(s, seat);
  }

  if (card.k === "m") {
    const prevB = s.boards[playerId];
    const nextB = applyModifier(prevB, card);
    s = withBoard(s, seat, nextB);
    s = withFeedDrewCard(s, playerId, card);
    s = maybeFeedFlip7(s, prevB, nextB, playerId);
    s = maybeFinishRound(s);
    if (roundOrGameEnded(s.phase)) return s;
    return advanceTurnAfter(s, seat);
  }

  if (card.k === "a") {
    const only = onlyActivePlayerId(s);
    if (only && only === playerId) {
      s = withFeedDrewCard(s, playerId, card);
      return applyActionCardAsChooser(
        s,
        seat,
        playerId,
        playerId,
        card,
        { kind: "hit", hitSeat: seat },
        undefined,
        true,
      );
    }
  }

  s = withFeedDrewCard(s, playerId, card);
  s = withFeedActionWaiting(s, playerId, card);
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
  const state0 = clearSecondChanceReveals(state);
  if (state0.phase.t !== "play") throw new Error("Not in play");
  const seat = seatOf(state0, playerId);
  if (state0.phase.currentTurnSeat !== seat) throw new Error("Not your turn");
  const b = state0.boards[playerId];
  if (!isActive(b)) throw new Error("Not active");
  let s = {
    ...state0,
    boards: {
      ...state0.boards,
      [playerId]: {
        ...b,
        status: "stayed" as const,
        secondChanceRevealCard: undefined,
      },
    },
  };
  s = withFeedStayed(s, playerId);
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
  const scoringPending = state.phase.scoringPending !== false;
  if (scoringPending) {
    return applyTotalsAndCheckGameOver(state);
  }
  return advanceTurnAfter(state, seatOf(state, playerId));
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
