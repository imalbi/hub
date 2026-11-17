import { useSyncExternalStore } from 'react';

type State = { capturing: boolean; day?: 'today' | 'tomorrow'; removed: { id: string; text: string } | null };

// Capture opens from the shortcut and the widget, Annulla shows in the shell: one small store, outside React.
let state: State = { capturing: false, removed: null };
const listeners = new Set<() => void>();
let undoTimer: ReturnType<typeof setTimeout> | undefined;
const UNDO_MS = 8000;

function set(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

/** `day` preselects the day (Oggi's Aggiungi under Domani); without it the capture picks by the hour. */
export const openCapture = (day?: 'today' | 'tomorrow') => set({ ...state, capturing: true, day });
export const closeCapture = () => set({ ...state, capturing: false });

/** Remember the post-it just removed so Annulla can bring it back for a few seconds. */
export function showUndo(removed: { id: string; text: string } | null) {
  clearTimeout(undoTimer);
  if (removed) undoTimer = setTimeout(() => showUndo(null), UNDO_MS);
  set({ ...state, removed });
}

export function useNotesUi() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
