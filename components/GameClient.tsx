"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardShape } from "@/components/CardShape";
import { GroupFeed } from "@/components/GroupFeed";
import { PlayerHandMessageStack } from "@/components/PlayerHandMessageStack";
import { useDuplicateFlash } from "@/components/useDuplicateFlash";
import { usePlayerHandMessages } from "@/hooks/usePlayerHandMessages";
import { loadPlayerId, savePlayerBinding } from "@/lib/client/player-storage";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { RoundWhyGate } from "@/components/RoundWhyGate";
import {
  HOST_TEST_TRIGGER_SUBSTRING,
  TEST_SCENARIO_ID_DUP_SECOND_SOLE,
} from "@/lib/game/test-scenarios";
import {
  cardLabel,
  duplicateNumberIndices,
  hasFlipSeven,
  scoreBoard,
} from "@/lib/game/rules";
import type { RematchPayload } from "@/lib/rematch-payload";
import type { Card, GamePhase, GameState, PlayerBoard } from "@/lib/game/types";

type PlayerRow = { id: string; name: string; isBot: boolean; seatOrder: number };

type LobbyPayload = {
  status: "lobby";
  code: string;
  hostPlayerId: string | null;
  players: PlayerRow[];
};

type PlayingPayload = {
  status: "playing" | "finished";
  code: string;
  hostPlayerId: string | null;
  players: PlayerRow[];
  game: { version: number; state: GameState; updatedAt: string };
  rematch?: RematchPayload;
};

type Payload = LobbyPayload | PlayingPayload;

function isPlayingPayload(x: unknown): x is PlayingPayload {
  return (
    typeof x === "object" &&
    x !== null &&
    "game" in x &&
    "players" in x &&
    "status" in x &&
    ((x as PlayingPayload).status === "playing" ||
      (x as PlayingPayload).status === "finished")
  );
}

/** Duplicate bust flash only applies to your own hand, not when viewing others’ tabs */
const NO_DUP_FLASH = new Set<number>();

export function GameClient({ code }: { code: string }) {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rematchBusy, setRematchBusy] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string>("");
  const [showScores, setShowScores] = useState(false);
  /** Players section: activity feed vs other players' cards */
  const [playersSectionTab, setPlayersSectionTab] = useState<
    "activity" | "cards"
  >("activity");
  /** Cycles 0–3 dots for “Name’s Turn…” while someone is up */
  const [turnDotCount, setTurnDotCount] = useState(0);
  const [lobbyShareUrl, setLobbyShareUrl] = useState("");

  const c = code.toUpperCase();

  const playingPayload =
    data && (data.status === "playing" || data.status === "finished")
      ? (data as PlayingPayload)
      : null;

  const activeTargets = useMemo(() => {
    if (!playingPayload) return [];
    const gs = playingPayload.game.state;
    return playingPayload.players.filter((p) => {
      const b = gs.boards[p.id];
      return b && b.status === "active";
    });
  }, [playingPayload]);

  const playersBySeat = useMemo(() => {
    if (!playingPayload) return [] as PlayerRow[];
    return [...playingPayload.players].sort(
      (a, b) => a.seatOrder - b.seatOrder,
    );
  }, [playingPayload]);

  const visibleGroupFeed = useMemo(() => {
    if (!playingPayload || !playerId) return [];
    const feed = playingPayload.game.state.groupFeed ?? [];
    return feed.filter((e) => e.actorId !== playerId);
  }, [playingPayload, playerId]);

  const turnPlayerId = useMemo(() => {
    if (!playingPayload) return null;
    const gs = playingPayload.game.state;
    if (gs.phase.t === "play") {
      return gs.seats[gs.phase.currentTurnSeat] ?? null;
    }
    if (gs.phase.t === "choose_action") {
      return gs.seats[gs.phase.chooserSeat] ?? null;
    }
    return null;
  }, [playingPayload]);

  /** Freeze / Flip 3 while the chooser must pick a target — show in hand until they confirm */
  const pendingChooserActionCard = useMemo(() => {
    if (!playingPayload || !playerId) return null;
    const gs = playingPayload.game.state;
    if (gs.phase.t !== "choose_action") return null;
    if (gs.seats.indexOf(playerId) !== gs.phase.chooserSeat) return null;
    const card = gs.phase.card;
    if (card.k !== "a") return null;
    if (card.v !== "freeze" && card.v !== "flip3") return null;
    return card;
  }, [playingPayload, playerId]);

  const summaryPhase =
    !!playingPayload &&
    (playingPayload.game.state.phase.t === "round_summary" ||
      playingPayload.game.state.phase.t === "game_summary" ||
      playingPayload.game.state.phase.t === "game_over");

  const yourBoardNumsForFlash = useMemo(() => {
    if (!playingPayload || summaryPhase || !playerId) return undefined;
    const phase = playingPayload.game.state.phase;
    if (phase.t === "bust_reveal") return undefined;
    return playingPayload.game.state.boards[playerId]?.nums;
  }, [playingPayload, summaryPhase, playerId]);

  const yourDupFlash = useDuplicateFlash(
    yourBoardNumsForFlash,
    `you-${playerId ?? ""}`,
  );

  useEffect(() => {
    setTurnDotCount(0);
  }, [turnPlayerId]);

  useEffect(() => {
    if (!turnPlayerId) {
      return;
    }
    const id = window.setInterval(() => {
      setTurnDotCount((c) => (c >= 3 ? 0 : c + 1));
    }, 500);
    return () => window.clearInterval(id);
  }, [turnPlayerId]);

  useEffect(() => {
    setPlayerId(loadPlayerId(c));
  }, [c]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setLobbyShareUrl(`${window.location.origin}/game/${c}`);
  }, [c]);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/sessions/${c}/game`, { cache: "no-store" });
    if (!res.ok) {
      setErr("Could not load session");
      return;
    }
    const j = (await res.json()) as Payload;
    setData(j);
    setErr(null);
  }, [c]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 2000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const postMove = useCallback(
    async (move: {
      type:
        | "HIT"
        | "STAY"
        | "ACTION_TARGET"
        | "ACK_BUST_REVEAL"
        | "ACK_TARGET_NOTIFY"
        | "ACK_ROUND_SUMMARY"
        | "ACK_GAME_SUMMARY";
      targetPlayerId?: string;
    }) => {
      if (!playerId) return;
      const res = await fetch(`/api/sessions/${c}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          move:
            move.type === "ACTION_TARGET"
              ? { type: "ACTION_TARGET", targetPlayerId: move.targetPlayerId! }
              : { type: move.type },
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Move failed");
        return;
      }
      const j: unknown = await res.json().catch(() => null);
      if (isPlayingPayload(j)) {
        setData(j);
        setErr(null);
        return;
      }
      await refresh();
    },
    [c, playerId, refresh],
  );

  const { messages: handMessages } = usePlayerHandMessages(
    playingPayload,
    playerId,
    postMove,
  );

  /** Sole remaining active player: auto-submit action target (server applies to self) */
  const autoOnlyTargetKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!playingPayload || !playerId) return;
    const gs = playingPayload.game.state;
    if (gs.phase.t !== "choose_action") {
      autoOnlyTargetKeyRef.current = null;
      return;
    }
    if (gs.seats.indexOf(playerId) !== gs.phase.chooserSeat) return;
    if (activeTargets.length !== 1) return;
    const ph = gs.phase;
    const key = `${playingPayload.game.version}-${ph.chooserSeat}-${JSON.stringify(ph.card)}-${(ph.deferred ?? []).length}`;
    if (autoOnlyTargetKeyRef.current === key) return;
    autoOnlyTargetKeyRef.current = key;
    void postMove({
      type: "ACTION_TARGET",
      targetPlayerId: activeTargets[0].id,
    });
  }, [playingPayload, playerId, activeTargets, postMove]);

  const startGame = async () => {
    if (!playerId) return;
    const res = await fetch(`/api/sessions/${c}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr((j as { error?: string }).error ?? "Could not start");
      return;
    }
    await refresh();
  };

  if (!data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-stone-600">Loading…</div>
    );
  }

  if (data.status === "lobby") {
    const canStart = data.players.length >= 2;
    const isHost = playerId && data.hostPlayerId === playerId;
    const hostName = data.hostPlayerId
      ? data.players.find((p) => p.id === data.hostPlayerId)?.name
      : null;
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold text-stone-900">
            {hostName ? `${hostName}'s Lobby` : "Lobby"}
          </h1>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700"
          >
            Refresh
          </button>
        </div>
        <p className="mt-2 text-stone-600">
          Code:{" "}
          <span className="font-mono text-lg font-semibold tracking-widest">
            {data.code}
          </span>
        </p>
        <p className="mt-1 text-sm text-stone-500">
          {data.players.length} player{data.players.length === 1 ? "" : "s"}{" "}
          (minimum 2 players)
        </p>
        {isHost && lobbyShareUrl ? (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-left">
            <p className="text-sm font-medium text-stone-800">
              Share this link with other players
            </p>
            <a
              href={lobbyShareUrl}
              className="mt-2 block break-all text-sm font-mono text-amber-900 underline"
            >
              {lobbyShareUrl}
            </a>
          </div>
        ) : null}
        <ul className="mt-6 space-y-2">
          {data.players.map((p) => (
            <li
              key={p.id}
              className="rounded-lg border border-stone-200 bg-white px-4 py-3"
            >
              {p.name}
              {p.isBot ? (
                <span className="ml-2 text-xs text-sky-700">(computer)</span>
              ) : null}
              {data.hostPlayerId === p.id ? (
                <span className="ml-2 text-xs text-amber-700">(host)</span>
              ) : null}
            </li>
          ))}
        </ul>
        {isHost && canStart && hostName?.includes(HOST_TEST_TRIGGER_SUBSTRING) ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <span className="font-semibold">Test mode:</span> With exactly two players,
            Start loads a mid-game scenario — you will be the only active player with
            Second Chance already on your board; your next Hit draws another Second
            Chance (discarded as sole player).
          </p>
        ) : null}
        {isHost ? (
          <PrimaryButton
            onClick={() => void startGame()}
            disabled={!canStart}
            className="mt-8 w-full"
          >
            {canStart ? "Start game" : "Need at least 2 players to start"}
          </PrimaryButton>
        ) : (
          <p className="mt-8 text-sm text-stone-500">
            Waiting for host to start…
          </p>
        )}
        {err ? <p className="mt-4 text-sm text-red-600">{err}</p> : null}
      </div>
    );
  }

  if (!playingPayload) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-stone-600">
        Loading game…
      </div>
    );
  }

  const gs = playingPayload.game.state;
  const players = playingPayload.players;
  const you = playerId;
  const nameOfPlayer = (id: string) =>
    players.find((p) => p.id === id)?.name ?? "Player";

  const testScenarioBanner =
    gs.testScenarioId === TEST_SCENARIO_ID_DUP_SECOND_SOLE ? (
      <div
        role="status"
        className="fixed left-0 right-0 top-0 z-[70] border-b border-amber-300 bg-amber-100 px-3 py-2 text-center text-xs leading-snug text-amber-950"
      >
        Test mode (host name contains {HOST_TEST_TRIGGER_SUBSTRING}): duplicate Second
        Chance — you have Second Chance as the sole active player. Tap Hit to draw
        another (it will be discarded).
      </div>
    ) : null;

  if (gs.phase.t === "round_summary") {
    const ph = gs.phase;
    const sorted = [...players].sort((a, b) => a.seatOrder - b.seatOrder);
    const acked = ph.acknowledged.includes(you ?? "");
    const flipSevenThisRound = sorted.filter((p) => {
      const b = gs.boards[p.id];
      return b && b.status !== "bust" && hasFlipSeven(b.nums);
    });
    return (
      <>
        {testScenarioBanner}
        <RoundWhyGate
          gateKey={`rs-${ph.roundIndex}`}
          reason={ph.endReason}
          nameOf={nameOfPlayer}
        >
        <div className="mx-auto max-w-lg px-4 py-8">
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-stone-900">
                Round {ph.roundIndex} complete.
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                {ph.acknowledged.length} / {players.length} players ready
              </p>
              {flipSevenThisRound.length > 0 ? (
                <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  Flip 7 (+15 each):{" "}
                  {flipSevenThisRound.map((p) => p.name).join(", ")}
                </p>
              ) : null}
              <table className="mt-6 w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-left text-stone-500">
                    <th className="pb-2 pr-2">Player</th>
                    <th className="pb-2 pr-2 text-right">Round</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p) => (
                    <tr key={p.id} className="border-b border-stone-100">
                      <td className="py-2 pr-2">{p.name}</td>
                      <td className="py-2 pr-2 text-right font-mono">
                        {ph.roundScores[p.id] ?? 0}
                      </td>
                      <td className="py-2 text-right font-mono">
                        {gs.totals[p.id] ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <PrimaryButton
                disabled={acked || !you}
                onClick={() => void postMove({ type: "ACK_ROUND_SUMMARY" })}
                className="mt-8 w-full"
              >
                {acked ? "Waiting for other players…" : "Start Next Round"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      </RoundWhyGate>
      </>
    );
  }

  if (gs.phase.t === "game_summary") {
    const ph = gs.phase;
    const sorted = [...players].sort((a, b) => a.seatOrder - b.seatOrder);
    const winnerPid = gs.seats[ph.winnerSeat];
    const acked = ph.acknowledged.includes(you ?? "");
    const flipSevenFinalRound = sorted.filter((p) => {
      const b = gs.boards[p.id];
      return b && b.status !== "bust" && hasFlipSeven(b.nums);
    });
    return (
      <>
        {testScenarioBanner}
        <RoundWhyGate
          gateKey={`gs-${ph.roundIndex}`}
          reason={ph.endReason}
          nameOf={nameOfPlayer}
        >
        <div className="mx-auto max-w-lg px-4 py-8">
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-stone-900">
                Game Complete
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                {ph.acknowledged.length} / {players.length} players acknowledged
              </p>
              {flipSevenFinalRound.length > 0 ? (
                <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  Flip 7 (+15 each):{" "}
                  {flipSevenFinalRound.map((p) => p.name).join(", ")}
                </p>
              ) : null}
              <table className="mt-6 w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-left text-stone-500">
                    <th className="pb-2 pr-2">Player</th>
                    <th className="pb-2 pr-2 text-right">Round</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p) => {
                    const win = p.id === winnerPid;
                    return (
                      <tr
                        key={p.id}
                        className={
                          win
                            ? "border-b border-stone-100 font-bold text-green-700"
                            : "border-b border-stone-100"
                        }
                      >
                        <td
                          className={`py-2 pr-2 ${win ? "text-green-700" : ""}`}
                        >
                          {p.name}
                          {win ? " — Winner" : ""}
                        </td>
                        <td
                          className={`py-2 pr-2 text-right font-mono ${win ? "text-green-700" : ""}`}
                        >
                          {ph.roundScores[p.id] ?? 0}
                        </td>
                        <td
                          className={`py-2 text-right font-mono ${win ? "text-green-700" : ""}`}
                        >
                          {gs.totals[p.id] ?? 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <PrimaryButton
                disabled={acked || !you}
                onClick={() => void postMove({ type: "ACK_GAME_SUMMARY" })}
                className="mt-8 w-full"
              >
                {acked ? "Waiting for other players…" : "Done"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      </RoundWhyGate>
      </>
    );
  }

  if (gs.phase.t === "game_over") {
    const ws = gs.phase.winnerSeat;
    const winnerPid =
      ws != null && ws >= 0 && ws < gs.seats.length ? gs.seats[ws] : null;
    const sorted = [...players].sort((a, b) => a.seatOrder - b.seatOrder);
    const roundHistory = gs.roundScoresHistory ?? [];
    const hostId = playingPayload.hostPlayerId;
    const isHostGameOver = Boolean(you && hostId === you);
    const rematch = playingPayload.rematch;

    const goToNewLobby = (newCode: string, newPlayerId: string) => {
      savePlayerBinding(newCode, newPlayerId);
      router.push(`/game/${newCode.toUpperCase()}`);
    };

    const startRematch = async () => {
      if (!you) return;
      setRematchBusy(true);
      setErr(null);
      const res = await fetch(`/api/sessions/${c}/rematch/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: you }),
      });
      setRematchBusy(false);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Could not start new game");
        return;
      }
      const j = (await res.json()) as { code: string; playerId: string };
      goToNewLobby(j.code, j.playerId);
    };

    const joinRematch = async () => {
      if (!you) return;
      setRematchBusy(true);
      setErr(null);
      const res = await fetch(`/api/sessions/${c}/rematch/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: you }),
      });
      setRematchBusy(false);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Could not join new game");
        return;
      }
      const j = (await res.json()) as { code: string; playerId: string };
      goToNewLobby(j.code, j.playerId);
    };

    return (
      <>
        {testScenarioBanner}
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-stone-900">Game Complete</h1>
        <p className="mt-4 text-lg">
          Winner:{" "}
          {winnerPid ? (
            <span className="font-bold text-green-700">
              {players.find((p) => p.id === winnerPid)?.name ?? "—"}
            </span>
          ) : (
            <span className="text-stone-600">—</span>
          )}
        </p>
        <div className="mt-8 overflow-x-auto text-left">
          <table className="w-full min-w-[280px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-stone-500">
                <th className="sticky left-0 bg-white py-2 pr-4 font-medium">
                  Player
                </th>
                {roundHistory.map((h) => (
                  <th
                    key={h.roundIndex}
                    className="whitespace-nowrap px-2 py-2 text-right font-medium"
                  >
                    {h.roundIndex}
                  </th>
                ))}
                <th className="whitespace-nowrap py-2 pl-2 text-right font-semibold text-stone-700">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr
                  key={p.id}
                  className={`border-b border-stone-100 last:border-b-0 ${
                    winnerPid && p.id === winnerPid ? "font-bold text-green-700" : ""
                  }`}
                >
                  <td
                    className={`sticky left-0 bg-white py-2 pr-4 ${
                      winnerPid && p.id === winnerPid ? "text-green-700" : ""
                    }`}
                  >
                    {p.name}
                  </td>
                  {roundHistory.map((h) => (
                    <td
                      key={h.roundIndex}
                      className="px-2 py-2 text-right font-mono tabular-nums"
                    >
                      {h.scores[p.id] ?? 0}
                    </td>
                  ))}
                  <td className="py-2 pl-2 text-right font-mono font-semibold tabular-nums text-stone-900">
                    {gs.totals[p.id] ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mx-auto mt-10 max-w-md space-y-4 text-left">
          {isHostGameOver ? (
            <div className="space-y-2">
              <p className="text-sm text-stone-600">
                Start a new lobby with a fresh room code. Other players can choose
                whether to join from this finished game screen.
              </p>
              <PrimaryButton
                type="button"
                disabled={rematchBusy || !you}
                onClick={() => void startRematch()}
                className="w-full"
              >
                {rematchBusy ? "Starting…" : "Start a new game"}
              </PrimaryButton>
            </div>
          ) : rematch?.targetStatus === "lobby" ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-stone-800">
                The host started a new game.
              </p>
              {rematch.joinedOldPlayerIds.includes(you ?? "") ? (
                <Link
                  href={`/game/${rematch.targetCode}`}
                  className="inline-flex w-full items-center justify-center rounded-lg bg-amber-600 px-4 py-3 text-center text-base font-medium text-white hover:bg-amber-700"
                >
                  Open new lobby
                </Link>
              ) : (
                <PrimaryButton
                  type="button"
                  disabled={rematchBusy || !you}
                  onClick={() => void joinRematch()}
                  className="w-full"
                >
                  {rematchBusy ? "Joining…" : "Join new game"}
                </PrimaryButton>
              )}
            </div>
          ) : rematch ? (
            <div className="space-y-2 text-sm text-stone-600">
              <p>The new game already started.</p>
              {rematch.joinedOldPlayerIds.includes(you ?? "") ? (
                <Link
                  href={`/game/${rematch.targetCode}`}
                  className="font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900"
                >
                  Open game ({rematch.targetCode})
                </Link>
              ) : (
                <p>
                  Room code:{" "}
                  <span className="font-mono font-semibold tracking-widest">
                    {rematch.targetCode}
                  </span>{" "}
                  — open{" "}
                  <Link
                    href={`/game/${rematch.targetCode}`}
                    className="font-medium text-amber-800 underline underline-offset-2"
                  >
                    /game/{rematch.targetCode}
                  </Link>{" "}
                  to join if there is still space.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-stone-500">
              Waiting for the host to start a new game…
            </p>
          )}
        </div>
        {err ? <p className="mt-4 text-sm text-red-600">{err}</p> : null}
        <p className="mt-10">
          <Link
            href="/"
            className="text-base font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900"
          >
            Back to homepage
          </Link>
        </p>
      </div>
      </>
    );
  }

  const currentSeat =
    gs.phase.t === "play"
      ? gs.phase.currentTurnSeat
      : gs.phase.t === "choose_action"
        ? gs.phase.chooserSeat
        : null;

  const currentPid =
    currentSeat !== null ? (gs.seats[currentSeat] ?? null) : null;

  const yourBoard = you ? gs.boards[you] : undefined;

  const totals = gs.totals;
  const myName = you ? players.find((p) => p.id === you)?.name : null;

  const playDisabled =
    gs.phase.t === "play" &&
    !!you &&
    (gs.phase.currentTurnSeat !== gs.seats.indexOf(you) ||
      gs.boards[you].status !== "active");

  const isYourTurn = !!you && currentPid === you;

  const roundPoints =
    yourBoard !== undefined ? scoreBoard(yourBoard) : 0;
  const gameTotal = you ? (totals[you] ?? 0) : 0;

  const showFixedPlayBar = gs.phase.t === "play" && !!you;

  const bustReveal = gs.phase.t === "bust_reveal" ? gs.phase : null;
  const bustWaitingName =
    bustReveal && you && you !== bustReveal.bustedPlayerId
      ? (players.find((p) => p.id === bustReveal.bustedPlayerId)?.name ??
        "Player")
      : null;

  return (
    <>
    {testScenarioBanner}
    <div
      className={`mx-auto max-w-3xl px-4 ${
        gs.testScenarioId ? "pt-11 md:pt-14" : "pt-4 md:pt-8"
      } ${
        showFixedPlayBar
          ? "pb-[calc(5.75rem+env(safe-area-inset-bottom))]"
          : "pb-6 md:pb-8"
      }`}
    >
      {bustWaitingName ? (
        <p className="mb-3 text-center text-sm text-stone-600" role="status">
          Waiting for{" "}
          <span className="font-semibold text-stone-800">{bustWaitingName}</span>{" "}
          to confirm…
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="min-w-0 flex-1">
          {myName ? (
            <p className="max-w-[min(100%,9rem)] truncate text-xl font-semibold tracking-tight text-stone-900 sm:max-w-none md:text-2xl">
              {myName}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-end gap-3 sm:gap-4">
          <div className="text-right">
            <p className="font-mono text-base font-semibold tabular-nums text-stone-900">
              {roundPoints}
            </p>
            <p className="text-[0.65rem] leading-tight text-stone-500 sm:text-xs">
              Round
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-base font-semibold tabular-nums text-stone-900">
              {gameTotal}
            </p>
            <p className="text-[0.65rem] leading-tight text-stone-500 sm:text-xs">
              Game
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowScores(true)}
            className="shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
          >
            Scores
          </button>
        </div>
      </div>

      <div className="mt-5 md:mt-8">
        {isYourTurn ? (
          <p className="text-sm font-bold text-stone-900">
            Your Turn{".".repeat(turnDotCount)}
          </p>
        ) : (
          <p className="text-sm font-medium text-stone-500">Your hand</p>
        )}
        {yourBoard ? (
          <>
            <div className="mt-4 space-y-2">
              <div className="grid w-full grid-cols-7 gap-1.5">
                {renderBoardNumberRow(
                  yourBoard,
                  yourBoard.status === "bust"
                    ? duplicateNumberIndices(yourBoard.nums)
                    : yourDupFlash,
                  yourBoard.status === "bust",
                  true,
                )}
              </div>
              {pendingChooserActionCard || boardHasModsRow(yourBoard) ? (
                <div className="grid w-full grid-cols-7 gap-1.5">
                  {pendingChooserActionCard ? (
                    <CardShape
                      card={pendingChooserActionCard}
                      small
                      fitNumberRow
                    />
                  ) : null}
                  {renderBoardModsRow(yourBoard, true)}
                </div>
              ) : null}
            </div>
            <PlayerHandMessageStack messages={handMessages} />
          </>
        ) : (
          <p className="mt-2 text-sm text-stone-500">
            Join this device to see your hand.
          </p>
        )}
      </div>

      {(gs.phase.t === "choose_action" && you) || err ? (
        <div className="mt-6 space-y-4">
          {gs.phase.t === "choose_action" && you ? (
            <section
              className="space-y-3 rounded-2xl bg-[#DFF5EA] p-4 shadow-sm"
              aria-label="Card action"
            >
              <ChooseActionPanel
                phase={gs.phase}
                you={you}
                seats={gs.seats}
                players={players}
                activeTargets={activeTargets}
                targetId={targetId}
                setTargetId={setTargetId}
                onConfirm={() => {
                  void postMove({
                    type: "ACTION_TARGET",
                    targetPlayerId: targetId,
                  });
                }}
              />
            </section>
          ) : null}

          {err ? <p className="text-sm text-red-600">{err}</p> : null}
        </div>
      ) : null}

      <section className="mt-8">
        <div
          className="flex gap-1.5 rounded-2xl bg-stone-100 p-1.5"
          role="tablist"
          aria-label="Activity and other players cards"
        >
          <button
            type="button"
            role="tab"
            aria-selected={playersSectionTab === "activity"}
            onClick={() => setPlayersSectionTab("activity")}
            className={`flex-1 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors ${
              playersSectionTab === "activity"
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-600 hover:text-stone-800"
            }`}
          >
            Activity
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={playersSectionTab === "cards"}
            onClick={() => setPlayersSectionTab("cards")}
            className={`flex-1 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors ${
              playersSectionTab === "cards"
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-600 hover:text-stone-800"
            }`}
          >
            Cards
          </button>
        </div>

        {playersSectionTab === "activity" ? (
          <div className="mt-4" role="tabpanel">
            {!playerId ? (
              <p className="text-sm text-stone-500">
                Join this device to see other players&apos; activity.
              </p>
            ) : (
              <GroupFeed
                entries={visibleGroupFeed}
                players={playingPayload?.players ?? []}
              />
            )}
          </div>
        ) : (
          <div className="mt-4" role="tabpanel">
            <div className="space-y-6" aria-label="Players cards">
              {playersBySeat
                .filter((p) => p.id !== you)
                .map((p) => {
                  const board = gs.boards[p.id];
                  const suffix = doneSuffix(board);
                  const isTurn = currentPid === p.id;
                  const otherModsRow = board
                    ? renderBoardModsRow(board, true)
                    : null;
                  return (
                    <div key={p.id}>
                      <p className="text-sm text-stone-700">
                        {isTurn ? (
                          <span className="font-bold text-stone-900">
                            {p.name}&apos;s Turn{".".repeat(turnDotCount)}
                            {suffix ? (
                              <span className="font-normal text-stone-500">
                                {" "}
                                {suffix}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <>
                            <span className="font-medium">{p.name}</span>
                            {suffix ? (
                              <span className="font-normal text-stone-500">
                                {" "}
                                {suffix}
                              </span>
                            ) : null}
                          </>
                        )}
                      </p>
                      {board ? (
                        <div className="mt-2 space-y-2">
                          <div className="grid w-full grid-cols-7 gap-1.5">
                            {renderBoardNumberRow(
                              board,
                              NO_DUP_FLASH,
                              false,
                              true,
                            )}
                          </div>
                          {otherModsRow ? (
                            <div className="grid w-full grid-cols-7 gap-1.5">
                              {otherModsRow}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </section>

      {showScores ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[80vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Scores</h2>
              <button
                type="button"
                className="text-sm text-stone-500"
                onClick={() => setShowScores(false)}
              >
                Close
              </button>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[280px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-left text-stone-500">
                    <th className="sticky left-0 bg-white py-2 pr-4 font-medium">
                      Player
                    </th>
                    {(gs.roundScoresHistory ?? []).map((h) => (
                      <th
                        key={h.roundIndex}
                        className="whitespace-nowrap px-2 py-2 text-right font-medium"
                      >
                        R{h.roundIndex}
                      </th>
                    ))}
                    <th className="whitespace-nowrap py-2 pl-2 text-right font-semibold text-stone-700">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...players]
                    .sort((a, b) => a.seatOrder - b.seatOrder)
                    .map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-stone-100 last:border-b-0"
                      >
                        <td className="sticky left-0 bg-white py-2 pr-4">
                          {p.name}
                        </td>
                        {(gs.roundScoresHistory ?? []).map((h) => (
                          <td
                            key={h.roundIndex}
                            className="px-2 py-2 text-right font-mono tabular-nums"
                          >
                            {h.scores[p.id] ?? 0}
                          </td>
                        ))}
                        <td className="py-2 pl-2 text-right font-mono font-semibold tabular-nums text-stone-900">
                          {totals[p.id] ?? 0}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>

      {showFixedPlayBar ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-stone-200 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto flex max-w-3xl gap-2">
            <PrimaryButton
              disabled={playDisabled}
              onClick={() => void postMove({ type: "HIT" })}
              className="w-[70%] min-h-[3.6rem] py-[0.9rem]"
            >
              Hit
            </PrimaryButton>
            <PrimaryButton
              variant="secondary"
              disabled={playDisabled}
              onClick={() => void postMove({ type: "STAY" })}
              className="w-[30%] min-h-[3.6rem] py-[0.9rem]"
            >
              Stay
            </PrimaryButton>
          </div>
        </div>
      ) : null}
    </>
  );
}

function doneSuffix(board: PlayerBoard | undefined): string | null {
  if (!board) return null;
  if (board.status === "bust") return "(Out)";
  if (board.status === "stayed" || board.status === "frozen") return "(Stay)";
  return null;
}

function chooseActionLeadLine(
  phase: Extract<GamePhase, { t: "choose_action" }>,
): string {
  const label = cardLabel(phase.card);
  switch (phase.context) {
    case "deal":
      return `You were dealt ${label}. Choose a player.`;
    case "hit":
      return `You drew ${label}. Choose a player.`;
    case "flip3":
      return `During your Flip 3, you drew ${label}. Choose a player.`;
  }
}

function ChooseActionPanel({
  phase,
  you,
  seats,
  players,
  activeTargets,
  targetId,
  setTargetId,
  onConfirm,
}: {
  phase: Extract<GamePhase, { t: "choose_action" }>;
  you: string;
  seats: string[];
  players: PlayerRow[];
  activeTargets: PlayerRow[];
  targetId: string;
  setTargetId: (id: string) => void;
  onConfirm: () => void;
}) {
  const chooserIsYou = phase.chooserSeat === seats.indexOf(you);
  return (
    <>
      {chooserIsYou ? (
        <p className="text-sm font-medium text-stone-800">
          {chooseActionLeadLine(phase)}
        </p>
      ) : (
        <p className="text-sm text-stone-700">
          Action: <span className="font-semibold">{cardLabel(phase.card)}</span>
        </p>
      )}
      {chooserIsYou ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <select
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-base"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            <option value="">Choose player…</option>
            {activeTargets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === you ? "Me" : p.name}
              </option>
            ))}
          </select>
          <PrimaryButton
            disabled={!targetId}
            onClick={onConfirm}
            className="rounded-lg px-4 py-2 text-sm"
          >
            Save
          </PrimaryButton>
        </div>
      ) : (
        <p className="mt-2 text-sm text-stone-600">
          Waiting for{" "}
          {players.find((p) => p.id === seats[phase.chooserSeat])?.name}…
        </p>
      )}
    </>
  );
}


function boardHasModsRow(board: PlayerBoard): boolean {
  return (
    board.hasX2 ||
    board.flatMods.length > 0 ||
    board.secondChance ||
    board.status === "frozen"
  );
}

function renderBoardNumberRow(
  board: PlayerBoard,
  duplicateNumIndices: Set<number>,
  duplicateStatic: boolean,
  fitSevenAcross?: boolean,
) {
  const dupHere = (i: number) => duplicateNumIndices.has(i);
  return (
    <>
      {board.nums.map((c, i) => (
        <CardShape
          key={`n-${i}`}
          card={c}
          small
          fitNumberRow={fitSevenAcross}
          duplicateFlash={!duplicateStatic && dupHere(i)}
          duplicateHighlight={duplicateStatic && dupHere(i)}
        />
      ))}
    </>
  );
}

/** Modifiers (×2, +flat), Freeze when frozen, 2nd Chance — second row; null if nothing to show */
function renderBoardModsRow(board: PlayerBoard, fitSevenAcross?: boolean) {
  const mods: Card[] = [];
  if (board.hasX2) mods.push({ k: "m", v: "x2" });
  mods.push(...board.flatMods);
  const actions: Card[] = [];
  if (board.secondChance) actions.push({ k: "a", v: "second" });
  if (board.status === "frozen") actions.push({ k: "a", v: "freeze" });
  if (mods.length === 0 && actions.length === 0) return null;
  return (
    <>
      {mods.map((c, i) => (
        <CardShape
          key={`m-${i}`}
          card={c}
          small
          fitNumberRow={fitSevenAcross}
        />
      ))}
      {actions.map((c, i) => (
        <CardShape
          key={`a-${i}`}
          card={c}
          small
          fitNumberRow={fitSevenAcross}
        />
      ))}
    </>
  );
}

function renderBoardLine(
  board: PlayerBoard,
  duplicateNumIndices: Set<number> = new Set(),
  duplicateStatic = false,
) {
  const modsRow = renderBoardModsRow(board, true);
  return (
    <>
      <div className="grid w-full grid-cols-7 gap-1.5">
        {renderBoardNumberRow(board, duplicateNumIndices, duplicateStatic, true)}
      </div>
      {modsRow ? (
        <div className="mt-2 grid w-full grid-cols-7 gap-1.5">{modsRow}</div>
      ) : null}
    </>
  );
}

export function JoinGate({
  code,
  onJoined,
}: {
  code: string;
  onJoined: (playerId: string) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = code.toUpperCase();

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/sessions/${c}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? "Could not join");
      return;
    }
    const j = (await res.json()) as { playerId: string };
    savePlayerBinding(c, j.playerId);
    onJoined(j.playerId);
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold">Join game</h1>
      <p className="mt-2 text-stone-600">
        Code:{" "}
        <span className="font-mono font-semibold tracking-widest">{c}</span>
      </p>
      <label className="mt-6 block text-sm font-medium text-stone-700">
        Your name
        <input
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <PrimaryButton
        disabled={busy || !name.trim()}
        onClick={() => void submit()}
        className="mt-6 w-full"
      >
        Join
      </PrimaryButton>
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
