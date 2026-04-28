import type { RoundEndReason } from "@/lib/game/types";

export function roundEndExplanation(
  reason: RoundEndReason,
  nameOf: (id: string) => string,
): { title: string; body: string } {
  switch (reason.kind) {
    case "flip7": {
      const ids = reason.playerIds;
      const names = ids.map(nameOf).filter(Boolean);
      const list =
        names.length === 0
          ? "Someone"
          : names.length === 1
            ? names[0]
            : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
      const verb = ids.length <= 1 ? "has" : "have";
      return {
        title: "Flip 7 — round over",
        body: `This round ended because ${list} ${verb} seven different numbers on their board (Flip 7).`,
      };
    }
    case "no_active_players":
      return {
        title: "Round over",
        body: "No one still had an active board — everyone had busted, stayed, or been frozen.",
      };
    case "score_cap":
      return {
        title: "Game over",
        body: `${nameOf(reason.winnerPlayerId)} reached 200 points and wins the game.`,
      };
    default: {
      const _never: never = reason;
      return _never;
    }
  }
}
