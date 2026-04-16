const KEY = "flip7_player";

export function savePlayerBinding(code: string, playerId: string) {
  if (typeof window === "undefined") return;
  const map = readAll();
  map[code.toUpperCase()] = playerId;
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function loadPlayerId(code: string): string | null {
  if (typeof window === "undefined") return null;
  const map = readAll();
  return map[code.toUpperCase()] ?? null;
}

function readAll(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}
