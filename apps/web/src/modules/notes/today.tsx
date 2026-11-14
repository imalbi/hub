import { Link } from '@tanstack/react-router';
import { useNow } from '../../lib/use-now.ts';
import { m } from '../../paraglide/messages.js';
import { agentName, dayDate, localDay, splitNotes, writtenOn } from './days.ts';
import { useNoteActions, useNotes } from './use-notes.ts';

const MAX_SHOWN = 5;
const dayFormat = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' });
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The middle column of Oggi: the post-its for today or earlier as raised cards, pushed to the bottom. Nothing when there are none. */
export function NotesColumn() {
  const notes = useNotes().data;
  const actions = useNoteActions();
  const today = localDay(new Date(useNow('clock')));
  const { due } = splitNotes(notes ?? [], today);
  if (!due.length) return null;
  return (
    <section
      aria-label={m.notes_today_region()}
      className="flex min-h-0 min-w-0 flex-4 flex-col gap-xs self-stretch overflow-y-auto"
    >
      <ul className="mt-auto flex flex-col gap-xs">
        {due.slice(0, MAX_SHOWN).map((note, index) => {
          const origin = writtenOn(note, today);
          const agent = agentName(note);
          const label = [
            origin.kind === 'yesterday'
              ? m.notes_from_yesterday()
              : origin.kind === 'day'
                ? m.notes_from_day({ day: dayFormat.format(dayDate(origin.day)) })
                : null,
            agent ? m.notes_by_agent({ name: agent }) : null,
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <li key={note.id} className="group flex min-w-0 items-start gap-xs rounded-md bg-muted px-md py-sm">
              <div className="flex min-w-0 flex-1 flex-col gap-2xs">
                {label && <p className="text-caption text-muted-foreground">{capitalize(label)}</p>}
                <p className={`break-words whitespace-pre-wrap ${index === 0 ? 'text-body font-medium' : 'text-body'}`}>
                  {note.text}
                </p>
              </div>
              <button
                type="button"
                aria-label={m.notes_remove_named({ text: note.text })}
                onClick={() => void actions.remove(note)}
                className="cursor-pointer rounded-full bg-border px-sm text-caption opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
              >
                {m.notes_remove()}
              </button>
            </li>
          );
        })}
      </ul>
      {due.length > MAX_SHOWN && (
        <Link to="/desk" className="text-caption text-muted-foreground underline">
          {m.notes_more({ count: due.length - MAX_SHOWN })}
        </Link>
      )}
    </section>
  );
}
