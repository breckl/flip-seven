"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardShape } from "@/components/CardShape";
import { useDuplicateFlash } from "@/components/useDuplicateFlash";
import { loadPlayerId, savePlayerBinding } from "@/lib/client/player-storage";
import { cardLabel, hasFlipSeven } from "@/lib/game/rules";
import type {
  Card,
  GamePhase,
  GameState,
  PlayerBoard,
} from "@/lib/game/types";

type PlayerRow = { id: string; name: string; seatOrder: number };

type LobbyPayload = {
  status: "lobby";
  code: string;
  expectedPlayerCount: number;
  hostPlayerId: string | null;
  players: PlayerRow[];
};

type PlayingPayload = {
  status: "playing" | "finished";
  code: string;
  expectedPlayerCount: number;
  hostPlayerId: string | null;
  players: PlayerRow[];
  game: { version: number; state: GameState; updatedAt: string };
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
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string>("");
  const [showScores, setShowScores] = useState(false);
  /** Which player’s table row is shown in the top “tabs” panel */
  const [viewedPlayerId, setViewedPlayerId] = useState<string | null>(null);
  const [secondChanceFlash, setSecondChanceFlash] = useState(false);
  const prevSecondChance = useRef<boolean | null>(null);
  const [flipSevenFlash, setFlipSevenFlash] = useState(false);
  const prevFlipSeven = useRef<boolean | null>(null);
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
      (a, b) => a.seatOrder - b.seatOrder
    );
  }, [playingPayload]);

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

  const summaryPhase =
    !!playingPayload &&
    (playingPayload.game.state.phase.t === "round_summary" ||
      playingPayload.game.state.phase.t === "game_summary" ||
      playingPayload.game.state.phase.t === "game_over");

  const yourBoardNumsForFlash = useMemo(() => {
    if (!playingPayload || summaryPhase || !playerId) return undefined;
    return playingPayload.game.state.boards[playerId]?.nums;
  }, [playingPayload, summaryPhase, playerId]);

  const yourDupFlash = useDuplicateFlash(
    yourBoardNumsForFlash,
    `you-${playerId ?? ""}`
  );

  useEffect(() => {
    if (turnPlayerId) setViewedPlayerId(turnPlayerId);
  }, [turnPlayerId]);

  useEffect(() => {
    setPlayerId(loadPlayerId(c));
  }, [c]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setLobbyShareUrl(`${window.location.origin}/game/${c}`);
  }, [c]);

  const yourBoardForFlash =
    playingPayload && playerId
      ? playingPayload.game.state.boards[playerId]
      : undefined;
  const phaseForFlash = playingPayload?.game.state.phase;

  useEffect(() => {
    if (!yourBoardForFlash || !phaseForFlash) return;
    if (
      phaseForFlash.t === "round_summary" ||
      phaseForFlash.t === "game_summary" ||
      phaseForFlash.t === "game_over" ||
      phaseForFlash.t === "bust_reveal"
    ) {
      prevSecondChance.current = yourBoardForFlash.secondChance;
      return;
    }
    const now = yourBoardForFlash.secondChance;
    if (
      prevSecondChance.current !== null &&
      prevSecondChance.current === false &&
      now === true
    ) {
      setSecondChanceFlash(true);
      const id = window.setTimeout(() => setSecondChanceFlash(false), 4000);
      return () => window.clearTimeout(id);
    }
    prevSecondChance.current = now;
  }, [yourBoardForFlash?.secondChance, phaseForFlash?.t]);

  useEffect(() => {
    if (!yourBoardForFlash || !phaseForFlash) return;
    if (
      phaseForFlash.t === "round_summary" ||
      phaseForFlash.t === "game_summary" ||
      phaseForFlash.t === "game_over" ||
      phaseForFlash.t === "bust_reveal"
    ) {
      prevFlipSeven.current =
        hasFlipSeven(yourBoardForFlash.nums) &&
        yourBoardForFlash.status !== "bust";
      return;
    }
    const now =
      hasFlipSeven(yourBoardForFlash.nums) &&
      yourBoardForFlash.status !== "bust";
    if (
      prevFlipSeven.current !== null &&
      !prevFlipSeven.current &&
      now
    ) {
      setFlipSevenFlash(true);
      const id = window.setTimeout(() => setFlipSevenFlash(false), 6000);
      return () => window.clearTimeout(id);
    }
    prevFlipSeven.current = now;
  }, [
    yourBoardForFlash?.nums,
    yourBoardForFlash?.status,
    phaseForFlash?.t,
  ]);

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
    [c, playerId, refresh]
  );

  /** Self-targeted action: skip the notify modal and ack immediately */
  const pendingAck = playingPayload?.game.state.pendingTargetAck;
  const selfTargetAckStarted = useRef(false);
  useEffect(() => {
    if (!pendingAck) {
      selfTargetAckStarted.current = false;
      return;
    }
    if (!playerId) return;
    if (pendingAck.targetPlayerId !== playerId) return;
    if (pendingAck.actorPlayerId !== pendingAck.targetPlayerId) return;
    if (selfTargetAckStarted.current) return;
    selfTargetAckStarted.current = true;
    void postMove({ type: "ACK_TARGET_NOTIFY" });
  }, [pendingAck, playerId, postMove]);

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
    const full = data.players.length >= data.expectedPlayerCount;
    const isHost = playerId && data.hostPlayerId === playerId;
    const myName = playerId
      ? data.players.find((p) => p.id === playerId)?.name
      : null;
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        {myName ? (
          <p className="mb-4 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700">
            You: <span className="font-semibold text-stone-900">{myName}</span>
          </p>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold text-stone-900">Lobby</h1>
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
          Players {data.players.length} / {data.expectedPlayerCount} (minimum 3
          to play; this table waits until everyone has joined)
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
              {data.hostPlayerId === p.id ? (
                <span className="ml-2 text-xs text-amber-700">(host)</span>
              ) : null}
            </li>
          ))}
        </ul>
        {isHost ? (
          <button
            type="button"
            onClick={() => void startGame()}
            disabled={!full}
            className="mt-8 w-full rounded-xl bg-amber-600 px-4 py-3 text-white disabled:opacity-40"
          >
            {full ? "Start game" : "Waiting for all players"}
          </button>
        ) : (
          <p className="mt-8 text-sm text-stone-500">Waiting for host to start…</p>
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

  const pendingTarget = gs.pendingTargetAck;
  if (
    pendingTarget &&
    you === pendingTarget.targetPlayerId &&
    pendingTarget.actorPlayerId !== pendingTarget.targetPlayerId
  ) {
    const actorName =
      players.find((p) => p.id === pendingTarget.actorPlayerId)?.name ??
      "A player";
    const cardName = cardLabel(pendingTarget.card);
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-stone-900">
              You were targeted
            </h2>
            <p className="mt-3 text-stone-700">
              <span className="font-semibold">{actorName}</span> played{" "}
              <span className="font-semibold">{cardName}</span> on you.
            </p>
            <button
              type="button"
              disabled={!you}
              onClick={() => void postMove({ type: "ACK_TARGET_NOTIFY" })}
              className="mt-8 w-full rounded-xl bg-stone-900 px-4 py-3 text-white disabled:opacity-50"
            >
              Ok
            </button>
            {err ? (
              <p className="mt-4 text-sm text-red-600">{err}</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (gs.phase.t === "bust_reveal") {
    const ph = gs.phase;
    const bustedBoard = gs.boards[ph.bustedPlayerId];
    const bustedName =
      players.find((p) => p.id === ph.bustedPlayerId)?.name ?? "Player";
    const isBustedYou = you === ph.bustedPlayerId;

    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-6 shadow-xl">
            {isBustedYou && bustedBoard ? (
              <>
                <h2 className="text-xl font-semibold text-stone-900">
                  You&apos;re out!
                </h2>
                <p className="mt-2 text-sm text-stone-600">
                  You drew a duplicate. Review your cards, then continue.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {renderBoardLine(bustedBoard, yourDupFlash)}
                </div>
                <button
                  type="button"
                  disabled={!you}
                  onClick={() => void postMove({ type: "ACK_BUST_REVEAL" })}
                  className="mt-8 w-full rounded-xl bg-stone-900 px-4 py-3 text-white disabled:opacity-50"
                >
                  Ok
                </button>
                {err ? (
                  <p className="mt-4 text-sm text-red-600">{err}</p>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-center text-stone-700">
                  Waiting for{" "}
                  <span className="font-semibold">{bustedName}</span> to
                  confirm…
                </p>
                {err ? (
                  <p className="mt-4 text-center text-sm text-red-600">{err}</p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (gs.phase.t === "round_summary") {
    const ph = gs.phase;
    const sorted = [...players].sort((a, b) => a.seatOrder - b.seatOrder);
    const acked = ph.acknowledged.includes(you ?? "");
    const flipSevenThisRound = sorted.filter((p) => {
      const b = gs.boards[p.id];
      return b && b.status !== "bust" && hasFlipSeven(b.nums);
    });
    return (
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
            <button
              type="button"
              disabled={acked || !you}
              onClick={() => void postMove({ type: "ACK_ROUND_SUMMARY" })}
              className="mt-8 w-full rounded-xl bg-amber-600 px-4 py-3 text-white disabled:opacity-50"
            >
              {acked ? "Waiting for other players…" : "Start Next Round"}
            </button>
          </div>
        </div>
      </div>
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
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-stone-900">Game Complete</h2>
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
                        win ? "border-b border-stone-100 font-bold text-green-700" : "border-b border-stone-100"
                      }
                    >
                      <td className={`py-2 pr-2 ${win ? "text-green-700" : ""}`}>
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
            <button
              type="button"
              disabled={acked || !you}
              onClick={() => void postMove({ type: "ACK_GAME_SUMMARY" })}
              className="mt-8 w-full rounded-xl bg-green-700 px-4 py-3 text-white disabled:opacity-50"
            >
              {acked ? "Waiting for other players…" : "Done"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (gs.phase.t === "game_over") {
    const ws = gs.phase.winnerSeat;
    const winnerPid =
      ws != null && ws >= 0 && ws < gs.seats.length ? gs.seats[ws] : null;
    const sorted = [...players].sort((a, b) => a.seatOrder - b.seatOrder);
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
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
        <ul className="mt-8 space-y-2 text-left">
          {sorted.map((p) => (
            <li
              key={p.id}
              className={`flex justify-between border-b border-stone-100 py-2 ${
                winnerPid && p.id === winnerPid ? "font-bold text-green-700" : ""
              }`}
            >
              <span>{p.name}</span>
              <span className="font-mono">{gs.totals[p.id] ?? 0}</span>
            </li>
          ))}
        </ul>
        <p className="mt-10">
          <Link
            href="/"
            className="text-base font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900"
          >
            Back to homepage
          </Link>
        </p>
      </div>
    );
  }

  const currentSeat =
    gs.phase.t === "play"
      ? gs.phase.currentTurnSeat
      : gs.phase.t === "choose_action"
        ? gs.phase.chooserSeat
        : null;

  const currentPid =
    currentSeat !== null ? gs.seats[currentSeat] ?? null : null;

  const yourBoard = you ? gs.boards[you] : undefined;

  const totals = gs.totals;
  const myName = you ? players.find((p) => p.id === you)?.name : null;

  const viewPid =
    viewedPlayerId && players.some((p) => p.id === viewedPlayerId)
      ? viewedPlayerId
      : playersBySeat[0]?.id ?? null;
  const viewedBoard = viewPid ? gs.boards[viewPid] : undefined;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {myName ? (
            <p className="text-2xl font-semibold tracking-tight text-stone-900">
              {myName}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setShowScores(true)}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
        >
          Scores
        </button>
      </div>

      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-stone-500">Table</p>
        <div
          className="mt-3 flex gap-1 overflow-x-auto border-b border-stone-200 pb-px"
          role="tablist"
          aria-label="Players"
        >
            {playersBySeat.map((p) => {
            const board = gs.boards[p.id];
            const suffix = doneSuffix(board);
            const isTurn = currentPid === p.id;
            const isView = viewPid === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={isView}
                onClick={() => setViewedPlayerId(p.id)}
                className={`shrink-0 whitespace-nowrap rounded-t-lg border border-b-0 px-3 py-2 text-left text-sm transition-colors ${
                  isTurn
                    ? "border-transparent bg-[#DFF5EA] font-semibold text-stone-900"
                    : isView
                      ? "border-stone-400 bg-white text-stone-900 shadow-sm"
                      : "border-transparent bg-stone-100/80 text-stone-600 hover:bg-stone-100"
                }`}
              >
                {p.name}
                {suffix ? (
                  <span className="font-normal text-stone-500"> {suffix}</span>
                ) : null}
              </button>
            );
          })}
        </div>
        {viewPid && viewedBoard ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {renderBoardLine(
              viewedBoard,
              viewPid === you ? yourDupFlash : NO_DUP_FLASH
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-stone-400">—</p>
        )}
      </section>

      <section className="mt-8 rounded-2xl border border-stone-200 bg-amber-50/50 p-4">
        <p className="text-sm font-medium text-stone-600">Your hand</p>
        {secondChanceFlash ? (
          <p className="mt-2 text-sm font-medium text-green-700" role="status">
            Second chance card!
          </p>
        ) : null}
        {flipSevenFlash ? (
          <p className="mt-2 text-sm font-medium text-emerald-800" role="status">
            Flip 7! You have 7 different numbers — +15 bonus points, and the
            round ends when play catches up.
          </p>
        ) : null}
        {yourBoard ? (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {renderBoardLine(yourBoard, yourDupFlash)}
            </div>
            {yourBoard.status === "bust" ? (
              <p className="mt-3 text-sm font-medium text-red-700" role="status">
                You&apos;re out!
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-2 text-sm text-stone-500">Join this device to see your hand.</p>
        )}
      </section>

      <section className="mt-8 space-y-3">
        {gs.phase.t === "play" && you && (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={
                gs.phase.currentTurnSeat !== gs.seats.indexOf(you) ||
                gs.boards[you].status !== "active"
              }
              onClick={() => void postMove({ type: "HIT" })}
              className="flex-1 rounded-xl bg-stone-900 px-4 py-3 text-white disabled:opacity-40"
            >
              Hit
            </button>
            <button
              type="button"
              disabled={
                gs.phase.currentTurnSeat !== gs.seats.indexOf(you) ||
                gs.boards[you].status !== "active"
              }
              onClick={() => void postMove({ type: "STAY" })}
              className="flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 disabled:opacity-40"
            >
              Stay
            </button>
          </div>
        )}

        {gs.phase.t === "choose_action" && you && (
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
        )}

        {err ? <p className="text-sm text-red-600">{err}</p> : null}
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
  );
}

function doneSuffix(board: PlayerBoard | undefined): string | null {
  if (!board) return null;
  if (board.status === "bust") return "(Out)";
  if (board.status === "stayed" || board.status === "frozen") return "(Stay)";
  return null;
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
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm text-stone-700">
        Action: <span className="font-semibold">{cardLabel(phase.card)}</span>
      </p>
      {phase.chooserSeat === seats.indexOf(you) ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <select
            className="rounded-lg border border-stone-300 bg-white px-3 py-2"
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
          <button
            type="button"
            disabled={!targetId}
            onClick={onConfirm}
            className="rounded-lg bg-amber-700 px-4 py-2 text-white disabled:opacity-40"
          >
            Confirm target
          </button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-stone-600">
          Waiting for{" "}
          {players.find((p) => p.id === seats[phase.chooserSeat])?.name}…
        </p>
      )}
    </div>
  );
}

function renderBoardLine(
  board: PlayerBoard,
  duplicateNumIndices: Set<number> = new Set()
) {
  const mods: Card[] = [];
  if (board.hasX2) mods.push({ k: "m", v: "x2" });
  mods.push(...board.flatMods);
  const actions: Card[] = [];
  if (board.secondChance) actions.push({ k: "a", v: "second" });

  return (
    <>
      {mods.map((c, i) => (
        <CardShape key={`m-${i}`} card={c} small />
      ))}
      {board.nums.map((c, i) => (
        <CardShape
          key={`n-${i}`}
          card={c}
          small
          duplicateFlash={duplicateNumIndices.has(i)}
        />
      ))}
      {actions.map((c, i) => (
        <CardShape key={`a-${i}`} card={c} small />
      ))}
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
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={busy || !name.trim()}
        onClick={() => void submit()}
        className="mt-6 w-full rounded-xl bg-stone-900 px-4 py-3 text-white disabled:opacity-40"
      >
        Join
      </button>
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
