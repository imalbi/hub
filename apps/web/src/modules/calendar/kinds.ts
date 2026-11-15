import { m } from '../../paraglide/messages.js';
import { shortSpan, type DayEntry, type EntryKind } from './days.ts';

const names: Record<EntryKind, () => string> = {
  work: m.calendar_kind_work,
  note: m.calendar_kind_note,
  study: m.calendar_kind_study,
  shift: m.calendar_kind_shift,
  event: m.calendar_kind_event,
};
/** The kind's own name: what the agenda's tag says. */
export const kindName = (kind: EntryKind) => names[kind]();
/** The muted line of a card: the kind's name, or the contributing module's own words ("Lavoro, colloquio"). */
export const kindLabel = (entry: DayEntry) => entry.label ?? kindName(entry.kind);
/** What an item says about when: a shift's span, else its time. */
export const whenText = (entry: DayEntry) => entry.span ?? entry.time ?? '';
/** The muted first line of a card: "when · kind", or the kind alone for an all-day item. */
export const metaLine = (entry: DayEntry) =>
  // A shift reads "Turno 6-14" as on the week board: the full span wrapped to two lines in a week column.
  entry.kind === 'shift' && entry.own?.start && entry.own.end
    ? `${kindLabel(entry)} ${shortSpan(entry.own.start, entry.own.end)}`
    : `${whenText(entry) ? `${whenText(entry)} · ` : ''}${kindLabel(entry)}`;
