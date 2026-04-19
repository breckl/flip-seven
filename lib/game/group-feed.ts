import type { GameState, GroupFeedEntry } from "./types";

const MAX_GROUP_FEED = 200;

export function appendGroupFeed(
  state: GameState,
  entry: Omit<GroupFeedEntry, "id">,
): GameState {
  const nextSeq = (state.groupFeedSeq ?? 0) + 1;
  const id = `${state.roundIndex}-${nextSeq}`;
  const row: GroupFeedEntry = { ...entry, id };
  const prev = state.groupFeed ?? [];
  const next = [...prev, row];
  const capped =
    next.length > MAX_GROUP_FEED ? next.slice(-MAX_GROUP_FEED) : next;
  return { ...state, groupFeed: capped, groupFeedSeq: nextSeq };
}
