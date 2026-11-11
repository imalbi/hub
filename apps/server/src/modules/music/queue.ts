import type { Song } from './youtube.ts';

type Queue = { current: Song | null; upcoming: Song[]; played: string[]; errors: number };
type Action =
  | { type: 'play'; song: Song }
  | { type: 'load'; songs: Song[] }
  | { type: 'refill'; songs: Song[] }
  | { type: 'advance'; error: boolean };

export const emptyQueue: Queue = { current: null, upcoming: [], played: [], errors: 0 };

export function queueReducer(state: Queue, action: Action): Queue {
  if (action.type === 'load')
    return {
      current: action.songs[0] ?? null,
      upcoming: action.songs.slice(1),
      played: state.current ? [...state.played, state.current.id] : state.played,
      errors: 0,
    };
  if (action.type === 'play')
    return {
      current: action.song,
      upcoming: [],
      played: state.current ? [...state.played, state.current.id] : state.played,
      errors: 0,
    };
  if (action.type === 'refill') {
    const seen = new Set([...state.played, state.current?.id, ...state.upcoming.map((song) => song.id)]);
    const upcoming = [...state.upcoming];
    for (const song of action.songs) {
      if (!seen.has(song.id)) {
        seen.add(song.id);
        upcoming.push(song);
      }
    }
    return { ...state, upcoming };
  }
  const errors = action.error ? state.errors + 1 : 0;
  return {
    current: errors >= 3 ? null : (state.upcoming[0] ?? null),
    upcoming: errors >= 3 ? [] : state.upcoming.slice(1),
    played: state.current ? [...state.played, state.current.id] : state.played,
    errors,
  };
}
