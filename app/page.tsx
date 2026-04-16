"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { savePlayerBinding } from "@/lib/client/player-storage";

export default function Home() {
  const router = useRouter();
  const [createName, setCreateName] = useState("");
  const [createCount, setCreateCount] = useState(4);
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: createName.trim(),
        expectedPlayerCount: createCount,
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
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
          Flip 7
        </h1>
        <p className="mt-2 text-stone-600">
          Press your luck — first to 200 wins. At least three people can play;
          there is no upper limit beyond the table size you set when creating a
          room.
        </p>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Create a game</h2>
        <label className="mt-4 block text-sm text-stone-700">
          Your name
          <input
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
          />
        </label>
        <label className="mt-4 block text-sm text-stone-700">
          Total players for this table (including you)
          <span className="mt-1 block text-xs font-normal text-stone-500">
            Minimum 3, maximum 18. Everyone must join before the host can
            start.
          </span>
          <input
            type="number"
            min={3}
            max={18}
            className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2"
            value={createCount}
            onChange={(e) => setCreateCount(Number(e.target.value))}
          />
        </label>
        <button
          type="button"
          disabled={busy || !createName.trim()}
          onClick={() => void create()}
          className="mt-6 w-full rounded-xl bg-stone-900 px-4 py-3 text-white disabled:opacity-40"
        >
          Create & get code
        </button>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Join a game</h2>
        <label className="mt-4 block text-sm text-stone-700">
          Room code
          <input
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono uppercase tracking-widest"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            maxLength={5}
          />
        </label>
        <label className="mt-4 block text-sm text-stone-700">
          Your name
          <input
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={busy || !joinCode.trim() || !joinName.trim()}
          onClick={() => void join()}
          className="mt-6 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 font-medium disabled:opacity-40"
        >
          Join
        </button>
      </section>

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
