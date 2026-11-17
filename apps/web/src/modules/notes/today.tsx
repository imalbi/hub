import { Kbd } from '../../components/ui/kbd.tsx';
import type { TodayColumnVariant, TodayDay } from '../../lib/module-ui.ts';
import { useNow } from '../../lib/use-now.ts';
import { m } from '../../paraglide/messages.js';
import { addDays, dayDate, localDay } from '../../lib/day.ts';
import { agentName, splitNotes, writtenOn, type Note } from './days.ts';

const dayFormat = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' });
import { openCapture } from './store.ts';
import { useNoteActions, useNotes } from './use-notes.ts';

/**
 * The post-its of a day in Oggi (step 66), in the shape the widget's size asks for: a count (Medio), a titled column
 * (Largo), a titled grid two per row (Grande) or a bare stack at the bottom (Esteso). Cut by `max` with "altre N",
 * never scrolled. Today's are those due today or earlier; tomorrow's ends with its count and Aggiungi.
 */
export function NotesColumn({ day, variant, max }: { day: TodayDay; variant: TodayColumnVariant; max: number }) {
  const notes = useNotes().data;
  const today = localDay(new Date(useNow('clock')));
  const target = day === 'today' ? today : addDays(today, 1);
  const shown =
    day === 'today' ? splitNotes(notes ?? [], today).due : (notes ?? []).filter((note) => note.forDay === target);
  const count =
    day === 'today' ? m.notes_count_today({ count: shown.length }) : m.notes_count_tomorrow({ count: shown.length });
  if (variant === 'count') return shown.length ? <p className="text-caption text-muted-foreground">{count}</p> : null;
  if (!shown.length && day === 'today') return null;
  const titled = variant !== 'stack';
  return (
    <section
      aria-label={day === 'today' ? m.notes_today_region() : m.notes_tomorrow_region()}
      className={`flex min-h-0 min-w-0 flex-col gap-xs ${titled ? '' : 'mt-auto'}`}
    >
      {titled && (
        <div className="flex items-center justify-between gap-sm">
          <h3 className="text-caption text-muted-foreground">{m.notes_today_heading()}</h3>
          <Kbd>N</Kbd>
        </div>
      )}
      <ul className={variant === 'grid' ? 'grid grid-cols-2 gap-xs' : 'flex flex-col gap-xs'}>
        {shown.slice(0, max).map((note, index) => (
          <TodayNote key={note.id} note={note} today={today} first={index === 0} />
        ))}
      </ul>
      {shown.length > max && (
        <p className="text-caption text-muted-foreground">{m.today_more({ count: shown.length - max })}</p>
      )}
      {day === 'tomorrow' && (
        <div className="flex items-center justify-between gap-sm">
          <p className="text-caption text-muted-foreground">{count}</p>
          <button
            type="button"
            onClick={() => openCapture('tomorrow')}
            aria-label={m.notes_add_tomorrow()}
            className="min-h-touch cursor-pointer rounded-full border border-border px-md text-label hover:bg-muted"
          >
            {m.notes_add()}
          </button>
        </div>
      )}
    </section>
  );
}

// One line per card, as on board P2; where it came from (yesterday, an agent) follows the text, muted.
function TodayNote({ note, today, first }: { note: Note; today: string; first: boolean }) {
  const actions = useNoteActions();
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
    <li className="group flex min-w-0 items-center gap-xs rounded-md bg-foreground/5 px-md py-sm">
      <p className={`min-w-0 flex-1 truncate ${first ? 'text-body font-medium' : 'text-body'}`} title={note.text}>
        {note.text}
        {label && <span className="font-normal text-muted-foreground"> · {label}</span>}
      </p>
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
}
