/** Formats a Pomodoro tag (`study/G3/Chimica` -> `G3 · Chimica`) for the Medio widget header. */
export function formatPomodoroTag(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const trimmed = tag.startsWith('study/') ? tag.slice('study/'.length) : tag;
  const parts = trimmed
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Total completed focus minutes today from `pomodoro.today` session timestamps. */
export function focusMinutesToday(sessions: readonly { startedAt: number; endedAt: number }[]): number {
  return Math.round(
    sessions.reduce((sum, session) => sum + Math.max(0, session.endedAt - session.startedAt), 0) / 60_000,
  );
}
