"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { savePlayerBinding } from "@/lib/client/player-storage";

export default function Home() {
  const router = useRouter();
  const [tab, setTab] = useState<"create" | "join">("create");
  const [createName, setCreateName] = useState("");
  const [createWithComputer, setCreateWithComputer] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const instructionsRef = useRef<HTMLDialogElement>(null);

  const create = async () => {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: createName.trim(),
        addComputerPlayer: createWithComputer,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr((j as { error?: string }).error ?? "Could not create");
      return;
    }
    const j = (await res.json()) as { code: string; playerId: string };
    savePlayerBinding(j.code, j.playerId);
    router.push(`/game/${j.code}`);
  };

  const join = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code || !joinName.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/sessions/${code}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: joinName.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr((j as { error?: string }).error ?? "Could not join");
      return;
    }
    const j = (await res.json()) as { playerId: string };
    savePlayerBinding(code, j.playerId);
    router.push(`/game/${code}`);
  };

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-10 px-4 py-16">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
          Flip 7
        </h1>
        <button
          type="button"
          onClick={() => instructionsRef.current?.showModal()}
          className="shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-50"
        >
          Instructions
        </button>
      </div>

      <dialog
        ref={instructionsRef}
        className="instructions-dialog fixed inset-0 z-50 hidden h-[100dvh] max-h-[100dvh] w-full max-w-none rounded-none border-0 bg-white p-0 text-stone-800 shadow-none backdrop:bg-stone-900/40 backdrop:backdrop-blur-[2px] open:flex open:flex-col md:inset-auto md:left-1/2 md:top-1/2 md:h-auto md:max-h-[min(85vh,36rem)] md:w-[calc(100%-2rem)] md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border md:border-stone-200 md:shadow-2xl"
        aria-labelledby="instructions-title"
      >
        <div className="relative z-10 flex shrink-0 items-center justify-between border-b border-stone-200 bg-white px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] md:pt-4">
          <h2 id="instructions-title" className="text-lg font-semibold text-stone-900">
            Instructions
          </h2>
          <form method="dialog" className="contents">
            <button
              type="submit"
              className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
              aria-label="Close"
            >
              <span aria-hidden className="text-xl leading-none">
                ×
              </span>
            </button>
          </form>
        </div>
        <div className="relative z-0 min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed">
          <p className="text-stone-600">
            Quick summary — scroll for scoring, special cards, and how this app works.
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-stone-800">
            <li>
              First player to <strong>200 points</strong> (across rounds) wins.
            </li>
            <li>
              Each round you flip cards from a shared deck and try to <strong>build
              the best hand</strong> without busting.
            </li>
            <li>
              If a <strong>number appears twice</strong> on your board, you{" "}
              <strong>bust</strong> — that round scores 0 for you, unless{" "}
              <strong>Second Chance</strong> saves you once (see below).
            </li>
            <li>
              Number cards score their face value. Modifier cards add flat points
              (+2 through +10) or <strong>×2</strong> your number total.
            </li>
            <li>
              Action cards let you <strong>Freeze</strong> someone, give{" "}
              <strong>Flip 3</strong> (three bonus flips), or grant{" "}
              <strong>Second Chance</strong> (one do-over on a bust).
            </li>
            <li>
              If you collect <strong>seven different number values</strong> on your
              board in one round — a <strong>Flip 7</strong> — you get{" "}
              <strong>+15</strong> bonus points for that round.
            </li>
          </ul>

          <h3 className="mt-8 text-base font-semibold text-stone-900">
            Rounds &amp; turns
          </h3>
          <p className="mt-2 text-stone-600">
            Players are dealt one card at a time in order; the dealer rotates each
            round. On your turn you typically flip the next card from the deck onto
            your board. When everyone is either frozen or bust (or the deck can’t
            continue), the round ends and points are totaled.
          </p>

          <h3 className="mt-6 text-base font-semibold text-stone-900">Scoring</h3>
          <p className="mt-2 text-stone-600">
            For a valid (non-busted) board: add all number cards, then apply{" "}
            <strong>×2</strong> if you have that modifier, then add any flat +2 / +4
            / +6 / +8 / +10 cards. If you have seven distinct number values (Flip 7),
            add <strong>+15</strong> on top.
          </p>

          <h3 className="mt-6 text-base font-semibold text-stone-900">
            Special cards (summary)
          </h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-stone-600">
            <li>
              <strong className="text-stone-800">Freeze</strong> — Play on an
              opponent with an active board. They stop drawing for the round; their
              current board scores if the round ends normally.
            </li>
            <li>
              <strong className="text-stone-800">Flip 3</strong> — Play on someone
              with an active board. They immediately flip up to three more cards
              from the deck (following normal number / bust rules inside that
              sequence).
            </li>
            <li>
              <strong className="text-stone-800">Second Chance</strong> — Play on
              someone who doesn’t already have it. The next time they would bust on
              a number flip, that bust is ignored once; they keep playing.
            </li>
          </ul>

          <h3 className="mt-6 text-base font-semibold text-stone-900">
            Playing in this app
          </h3>
          <p className="mt-2 text-stone-600">
            Create a room or join with a five-letter code. When at least two
            players are in the lobby, the host can start the game. The UI walks
            you through flips, targeting for action cards, and round summaries.
          </p>
          <p className="mt-3 text-xs text-stone-500">
            Flip 7 is a published game by The Op. This app is an unofficial fan
            implementation — see the link below for the official product.
          </p>
        </div>
        <div className="relative z-10 hidden shrink-0 border-t border-stone-200 bg-white px-5 py-3 md:block">
          <form method="dialog" className="block w-full">
            <PrimaryButton
              type="submit"
              className="w-full py-2.5 text-sm"
            >
              Got it
            </PrimaryButton>
          </form>
        </div>
      </dialog>

      <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        <div
          className="flex gap-1.5 rounded-2xl bg-stone-100 p-1.5"
          role="tablist"
          aria-label="Home"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "create"}
            onClick={() => setTab("create")}
            className={`flex-1 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors ${
              tab === "create"
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-600 hover:text-stone-800"
            }`}
          >
            Create a Game
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "join"}
            onClick={() => setTab("join")}
            className={`flex-1 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors ${
              tab === "join"
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-600 hover:text-stone-800"
            }`}
          >
            Join a Game
          </button>
        </div>

        {tab === "create" ? (
          <div className="px-3 pb-3 pt-5" role="tabpanel">
            <label className="block text-sm text-stone-700">
              Your name
              <input
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </label>
            <PrimaryButton
              disabled={busy || !createName.trim()}
              onClick={() => void create()}
              className="mt-6 w-full"
            >
              Create Game
            </PrimaryButton>
            <label className="mt-3 flex items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={createWithComputer}
                onChange={(e) => setCreateWithComputer(e.target.checked)}
              />
              Add a computer player
            </label>
          </div>
        ) : (
          <div className="px-3 pb-3 pt-5" role="tabpanel">
            <label className="block text-sm text-stone-700">
              Game Code
              <input
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-base uppercase tracking-widest"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                maxLength={5}
              />
            </label>
            <label className="mt-4 block text-sm text-stone-700">
              Your name
              <input
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base"
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
              />
            </label>
            <PrimaryButton
              disabled={busy || !joinCode.trim() || !joinName.trim()}
              onClick={() => void join()}
              className="mt-6 w-full"
            >
              Join Game
            </PrimaryButton>
          </div>
        )}
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <p className="text-center text-sm text-stone-500">
        <Link href="https://theop.games/products/flip-7" className="underline">
          Official Flip 7
        </Link>{" "}
        by The Op — this app is an unofficial fan implementation.
      </p>
    </main>
  );
}
