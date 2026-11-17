import { PlusIcon } from '@phosphor-icons/react';
import { Panel } from '../../components/panel.tsx';
import { useNow } from '../../lib/use-now.ts';
import { m } from '../../paraglide/messages.js';
import { NoteCard } from './card.tsx';
import { localDay } from '../../lib/day.ts';
import { splitNotes } from './days.ts';
import { openCapture } from './store.ts';
import { useNotes } from './use-notes.ts';

/** The Panoramica widget: every open post-it, newest first, the ones for later days under "In arrivo" in dashed cards. */
export function NotesWidget() {
  const notes = useNotes().data;
  const today = localDay(new Date(useNow('clock')));
  const { due, upcoming } = splitNotes(notes ?? [], today);
  return (
    <Panel
      title={m.notes_title()}
      className="h-full"
      action={
        <button
          type="button"
          onClick={() => openCapture()}
          className="flex min-h-xl cursor-pointer items-center gap-xs rounded-full border border-border px-md text-label hover:bg-muted"
        >
          <PlusIcon className="size-icon-xs" aria-hidden />
          {m.notes_add()}
        </button>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-md overflow-y-auto">
        {notes && !notes.length && <p className="text-body text-muted-foreground">{m.notes_empty()}</p>}
        {due.length > 0 && (
          <ul className="grid grid-cols-3 gap-sm">
            {due
              .toSorted((a, b) => b.createdAt - a.createdAt)
              .map((note) => (
                <NoteCard key={note.id} note={note} />
              ))}
          </ul>
        )}
        {upcoming.length > 0 && (
          <section aria-label={m.notes_upcoming()} className="flex flex-col gap-xs">
            <h3 className="text-label text-muted-foreground">{m.notes_upcoming()}</h3>
            <ul className="grid grid-cols-3 gap-sm">
              {upcoming.map((note) => (
                <NoteCard key={note.id} note={note} today={today} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </Panel>
  );
}
