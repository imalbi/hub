import type { CalendarItem } from '../../lib/module-ui.ts';
import { useNotes } from './use-notes.ts';

/** The post-its with a day in the range, as read-only items for the Calendario page. */
export function useNotesCalendarItems({ from, to }: { from: string; to: string }): CalendarItem[] | undefined {
  return useNotes()
    .data?.filter((note) => note.forDay >= from && note.forDay <= to)
    .map((note) => ({
      id: `note-${note.id}`,
      day: note.forDay,
      title: note.text,
      kind: 'note',
    }));
}
