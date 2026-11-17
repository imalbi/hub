import { m } from '../paraglide/messages.js';
import type { CurrentRecord } from '../lib/current-record.ts';
import { NoteCard } from '../modules/notes/card.tsx';
import { openCapture } from '../modules/notes/store.ts';
import { useNotes } from '../modules/notes/use-notes.ts';

export function RecordNotes({ record }: { record: CurrentRecord }) {
  const notes = (useNotes().data ?? []).filter(
    (note) => note.about?.source === record.source && note.about.id === record.id,
  );
  return (
    <section aria-label={m.notes_title()} className="flex flex-col gap-sm">
      {notes.length > 0 && <h3 className="text-label">{m.notes_title()}</h3>}
      {notes.length > 0 && (
        <ul className="flex flex-col gap-sm">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => openCapture(undefined, record)}
        className="min-h-touch cursor-pointer self-start rounded-full border border-border px-md text-label hover:bg-muted"
      >
        {m.notes_add()}
      </button>
    </section>
  );
}
