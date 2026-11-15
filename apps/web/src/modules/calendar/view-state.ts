import { useState } from 'react';
import { SHOW_ALL, type Show } from './days.ts';

export type View = 'month' | 'week' | 'agenda';
const VIEW_KEY = 'hub.calendar.view';
const SHOW_KEY = 'hub.calendar.show';

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private window or blocked storage: the choice lasts until the page closes.
  }
}

const isView = (value: unknown): value is View => value === 'month' || value === 'week' || value === 'agenda';

/** The view and the Mostra toggles, remembered in this browser; each falls back to its default when storage is empty or broken. */
export function useViewState() {
  const [view, setViewState] = useState<View>(() => {
    const stored = read(VIEW_KEY);
    return isView(stored) ? stored : 'month';
  });
  const [show, setShowState] = useState<Show>(() => {
    const stored = read(SHOW_KEY);
    if (typeof stored !== 'object' || stored === null) return SHOW_ALL;
    // A key that is not a boolean keeps its default, so a half-written value never hides a kind by accident.
    return {
      work: !('work' in stored && stored.work === false),
      study: !('study' in stored && stored.study === false),
      shift: !('shift' in stored && stored.shift === false),
      note: !('note' in stored && stored.note === false),
    };
  });
  return {
    view,
    setView: (next: View) => {
      setViewState(next);
      write(VIEW_KEY, next);
    },
    show,
    setShow: (next: Show) => {
      setShowState(next);
      write(SHOW_KEY, next);
    },
  };
}
