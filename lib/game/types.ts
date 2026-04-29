/** Why the round or game transitioned to scoring (for UI copy before scores). */
export type RoundEndReason =
  | { kind: "flip7"; playerIds: string[] }
  | { kind: "no_active_players" }
  /** Someone reached the score cap this round — phase will be game_summary */
  | { kind: "score_cap"; winnerPlayerId: string };

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
  /** The number card that would have busted; set when Second Chance negates a duplicate (not added to nums). Cleared on the next move. */
  secondChanceRevealCard?: Card | null;
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
  /** Busting player must ack: then scoring (round over) or play continues */
  | {
      t: "bust_reveal";
      roundIndex: number;
      bustedPlayerId: string;
      /** If true (default), OK goes to round scoring. If false, OK advances play. */
      scoringPending?: boolean;
    }
  /** Round just scored; wait for all players to acknowledge before next deal */
  | {
      t: "round_summary";
      roundIndex: number;
      roundScores: Record<string, number>;
      acknowledged: string[];
      /** Shown once before score breakdown (optional for older saved states). */
      endReason?: RoundEndReason;
    }
  /** Someone reached 200 with a clear winner; wait for acks before game_over */
  | {
      t: "game_summary";
      winnerSeat: number;
      roundIndex: number;
      roundScores: Record<string, number>;
      acknowledged: string[];
      endReason?: RoundEndReason;
    }
  | { t: "game_over"; winnerSeat: number | null };

/** Target must dismiss before it clears (server tracks until ACK_TARGET_NOTIFY) */
export type PendingTargetAck = {
  targetPlayerId: string;
  actorPlayerId: string;
  card: Card;
};

export type GroupFeedKind =
  | "drew_card"
  | "action_waiting"
  | "gave_action"
  | "stayed"
  | "duplicate_out"
  | "duplicate_saved"
  | "flip7_bonus"
  /** Solo last active player drew a second Second Chance; card discarded (no other target). */
  | "second_chance_discarded";

/** Server-append-only activity log for the group feed UI (JSON-serializable). */
export type GroupFeedEntry = {
  id: string;
  roundIndex: number;
  /** Primary player the line is about (client hides when this is the local player). */
  actorId: string;
  targetId?: string;
  kind: GroupFeedKind;
  card?: Card;
  /** Duplicate number for bust / Second Chance save lines */
  numberValue?: number;
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
  /** Activity feed entries; omitted in older saved games */
  groupFeed?: GroupFeedEntry[];
  /** Monotonic counter for feed entry ids */
  groupFeedSeq?: number;
  /** Server-side bot pacing so bot turns feel human. */
  botPendingTurn?: { actorId: string; executeAtMs: number } | null;
  /** Dev/test: which canned scenario was loaded (optional). */
  testScenarioId?: string;
};
