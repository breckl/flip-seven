/** JSON-serializable card (94-card deck) */
export type Card =
  | { k: "n"; v: number }
  | {
      k: "m";
      v: "p2" | "p4" | "p6" | "p8" | "p10" | "x2";
    }
  | { k: "a"; v: "freeze" | "flip3" | "second" };

export type PlayerBoard = {
  nums: Card[];
  flatMods: Card[];
  hasX2: boolean;
  secondChance: boolean;
  status: "active" | "bust" | "stayed" | "frozen";
};

/** After resolving a Flip Three or nested action */
export type ActionResume =
  | { kind: "deal"; nextDealIndex: number }
  | { kind: "hit"; hitSeat: number };

export type GamePhase =
  | { t: "initial_deal"; dealIndex: number }
  | {
      t: "choose_action";
      chooserSeat: number;
      card: Card;
      context: "deal" | "hit" | "flip3";
      /** What to do after this action (and optional deferred queue) is fully resolved */
      resume: ActionResume;
      /** Nested Freeze / Flip3 drawn during a Flip Three sequence */
      deferred?: Card[];
    }
  | { t: "play"; currentTurnSeat: number }
  /** Last action was a bust that ended the round; busting player must ack before scoring */
  | {
      t: "bust_reveal";
      roundIndex: number;
      bustedPlayerId: string;
    }
  /** Round just scored; wait for all players to acknowledge before next deal */
  | {
      t: "round_summary";
      roundIndex: number;
      roundScores: Record<string, number>;
      acknowledged: string[];
    }
  /** Someone reached 200 with a clear winner; wait for acks before game_over */
  | {
      t: "game_summary";
      winnerSeat: number;
      roundIndex: number;
      roundScores: Record<string, number>;
      acknowledged: string[];
    }
  | { t: "game_over"; winnerSeat: number | null };

/** Target must dismiss before it clears (server tracks until ACK_TARGET_NOTIFY) */
export type PendingTargetAck = {
  targetPlayerId: string;
  actorPlayerId: string;
  card: Card;
};

export type GameState = {
  phase: GamePhase;
  dealerSeat: number;
  seats: string[];
  boards: Record<string, PlayerBoard>;
  drawPile: Card[];
  discardPile: Card[];
  totals: Record<string, number>;
  roundIndex: number;
  /** Completed rounds in order (for score history UI); omitted in older saved games */
  roundScoresHistory?: { roundIndex: number; scores: Record<string, number> }[];
  /** Set when Freeze / Flip 3 / Second Chance is played on a target; cleared on ack or round end */
  pendingTargetAck?: PendingTargetAck | null;
};
