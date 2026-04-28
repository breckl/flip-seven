import { buildDeck, shuffle } from "./deck";
import type { Card, GameState, PlayerBoard } from "./types";

/** When the host’s display name contains this substring, optional test scenarios activate. */
export const HOST_TEST_TRIGGER_SUBSTRING = "2468";

export const TEST_SCENARIO_ID_DUP_SECOND_SOLE = "dup-second-chance-sole";

function pullCardFromPile(pile: Card[], card: Card): void {
  const i = pile.findIndex((c) => c.k === card.k && c.v === card.v);
  if (i < 0) {
    throw new Error(`[test] Missing card in pile for ${card.k}:${String(card.v)}`);
  }
  pile.splice(i, 1);
}

/** popDraw takes from the end of drawPile — push the next card to draw here. */
function ensureNextDrawIsSecondChance(pile: Card[]): void {
  const idx = pile.findIndex((c) => c.k === "a" && c.v === "second");
  if (idx < 0) throw new Error("[test] No Second Chance card left in pile");
  const [card] = pile.splice(idx, 1);
  pile.push(card);
}

/**
 * Repro: sole active player already has Second Chance; next Hit draws another
 * Second Chance → must discard (no other recipient). Host should be the lone
 * survivor so they can tap Hit immediately.
 *
 * Preconditions: exactly two seats; `hostPlayerId` must be one of them.
 * Skips deal: simulates “a couple rounds in” via `roundIndex: 2`.
 */
export function buildSecondChanceDuplicateTestScenario(
  state: GameState,
  hostPlayerId: string,
): GameState {
  if (state.seats.length !== 2) {
    throw new Error("[test] Scenario requires exactly two players");
  }
  const hostSeat = state.seats.indexOf(hostPlayerId);
  if (hostSeat < 0) {
    throw new Error("[test] Host not in seats");
  }
  const stayedSeat = hostSeat === 0 ? 1 : 0;
  const solePid = state.seats[hostSeat];
  const stayedPid = state.seats[stayedSeat];

  const soleNums: Card[] = [
    { k: "n", v: 1 },
    { k: "n", v: 2 },
    { k: "n", v: 3 },
  ];
  const stayedNums: Card[] = [
    { k: "n", v: 4 },
    { k: "n", v: 5 },
  ];

  let pile = shuffle(buildDeck(), 2_468_2468);
  for (const c of [...soleNums, ...stayedNums]) {
    pullCardFromPile(pile, c);
  }
  ensureNextDrawIsSecondChance(pile);

  const boards: Record<string, PlayerBoard> = {
    ...state.boards,
    [solePid]: {
      nums: soleNums,
      flatMods: [],
      hasX2: false,
      secondChance: true,
      status: "active",
      secondChanceRevealCard: undefined,
    },
    [stayedPid]: {
      nums: stayedNums,
      flatMods: [],
      hasX2: false,
      secondChance: false,
      status: "stayed",
      secondChanceRevealCard: undefined,
    },
  };

  return {
    ...state,
    boards,
    drawPile: pile,
    discardPile: [],
    phase: {
      t: "play",
      currentTurnSeat: hostSeat,
    },
    roundIndex: 2,
    pendingTargetAck: null,
    groupFeed: [],
    groupFeedSeq: 0,
    testScenarioId: TEST_SCENARIO_ID_DUP_SECOND_SOLE,
  };
}
