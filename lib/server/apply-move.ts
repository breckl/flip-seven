import {
  submitAckBustReveal,
  submitAckGameSummary,
  submitAckRoundSummary,
  submitAckTargetNotification,
  submitActionTarget,
  submitHit,
  submitStay,
} from "@/lib/game/engine";
import type { GameState } from "@/lib/game/types";

export type ClientMove =
  | { type: "HIT" }
  | { type: "STAY" }
  | { type: "ACTION_TARGET"; targetPlayerId: string }
  | { type: "ACK_BUST_REVEAL" }
  | { type: "ACK_TARGET_NOTIFY" }
  | { type: "ACK_ROUND_SUMMARY" }
  | { type: "ACK_GAME_SUMMARY" };

export function applyMove(
  state: GameState,
  playerId: string,
  move: ClientMove
): GameState {
  switch (move.type) {
    case "HIT":
      return submitHit(state, playerId);
    case "STAY":
      return submitStay(state, playerId);
    case "ACTION_TARGET":
      return submitActionTarget(state, playerId, move.targetPlayerId);
    case "ACK_BUST_REVEAL":
      return submitAckBustReveal(state, playerId);
    case "ACK_TARGET_NOTIFY":
      return submitAckTargetNotification(state, playerId);
    case "ACK_ROUND_SUMMARY":
      return submitAckRoundSummary(state, playerId);
    case "ACK_GAME_SUMMARY":
      return submitAckGameSummary(state, playerId);
    default:
      throw new Error("Unknown move");
  }
}
