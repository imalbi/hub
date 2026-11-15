import { CalendarBlankIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { Calendar } from '../../components/ui/calendar.tsx';
import { Switch } from '../../components/ui/switch.tsx';
import { MODAL_ROOT, SCRIM, useModal } from '../../components/ui/modal.ts';
import { localDay } from '../../lib/day.ts';
import { parseDay } from '../../lib/parse-day.ts';
import { m } from '../../paraglide/messages.js';
import { dayTitle, type CalendarEvent } from './days.ts';
import { useEventActions } from './use-calendar.tsx';

const EXIT_MS = 220;
// The calendar also edits events already past, so it has no useful minimum.
const EARLIEST = '2000-01-01';

/** What the card opens on: a new event for a day, or an existing one. Null keeps it closed. */
export type EventDraft = { event: CalendarEvent } | { day: string } | null;

/** The card for a new or an existing event: Invio saves, Esc closes, Elimina removes with Annulla (in the page). */
export function EventDialog({
  draft,
  onClose,
  onSaved,
  onRemoved,
}: {
  draft: EventDraft;
  onClose: () => void;
  onSaved: (day: string) => void;
  onRemoved: (event: CalendarEvent) => void;
}) {
  const { dialog, mounted, shown } = useModal(draft !== null, onClose, EXIT_MS);
  if (!mounted) return null;
  return (
    <dialog
      ref={dialog}
      aria-label={draft && 'event' in draft ? draft.event.title : m.calendar_new()}
      className={MODAL_ROOT}
    >
      <div
        role="presentation"
        className={SCRIM}
        onClick={onClose}
        style={{ opacity: shown ? 1 : 0, transition: `opacity ${EXIT_MS}ms ease-out` }}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-lg">
        <div
          data-modal-panel=""
          tabIndex={-1}
          className="pointer-events-auto w-full max-w-dialog-sm rounded-lg border border-border bg-surface p-lg shadow-lg outline-none"
          style={{ opacity: shown ? 1 : 0, transition: `opacity ${EXIT_MS}ms ease-out` }}
        >
          {draft && <EventForm draft={draft} onClose={onClose} onSaved={onSaved} onRemoved={onRemoved} />}
        </div>
      </div>
    </dialog>
  );
}

const field = 'min-h-touch rounded-md bg-muted px-md text-body outline-2 outline-transparent focus:outline-accent';

// Its own component so the draft starts fresh every time the dialog opens on something.
function EventForm({
  draft,
  onClose,
  onSaved,
  onRemoved,
}: {
  draft: NonNullable<EventDraft>;
  onClose: () => void;
  onSaved: (day: string) => void;
  onRemoved: (event: CalendarEvent) => void;
}) {
  const actions = useEventActions();
  const editing = 'event' in draft ? draft.event : null;
  const [today] = useState(() => localDay(new Date()));
  const [title, setTitle] = useState(editing?.title ?? '');
  const [shift, setShift] = useState(editing?.kind === 'shift');
  const [person, setPerson] = useState(editing?.person ?? '');
  const [day, setDay] = useState(editing?.day ?? ('day' in draft ? draft.day : today));
  const [start, setStart] = useState(editing?.start ?? '');
  const [end, setEnd] = useState(editing?.end ?? '');
  const [choosing, setChoosing] = useState(false);
  const [typedDay, setTypedDay] = useState('');
  const [unknownDay, setUnknownDay] = useState(false);
  const pending = actions.add.isPending || actions.update.isPending;
  // A shift may end the next day, so only an event has an order to keep.
  const badTimes = !shift && end !== '' && (start === '' || end <= start);
  const ready = shift ? person.trim().length > 0 && start !== '' && end !== '' : title.trim().length > 0 && !badTimes;

  function pick(next: string) {
    setDay(next);
    setChoosing(false);
    setTypedDay('');
    setUnknownDay(false);
  }
  function readTypedDay() {
    const next = parseDay(typedDay, today, 'future');
    if (next) pick(next);
    else setUnknownDay(true);
  }
  async function save() {
    if (!ready || pending) return;
    const input = shift
      ? { title: m.calendar_kind_shift(), day, start, end, kind: 'shift' as const, person }
      : { title, day, start: start || null, end: end || null, kind: 'event' as const, person: null };
    try {
      if (editing) await actions.update.mutateAsync({ ...input, id: editing.id });
      else await actions.add.mutateAsync(input);
      onSaved(day);
      onClose();
    } catch {
      // The error line below says it; the draft stays.
    }
  }
  const failed = actions.add.isError || actions.update.isError || actions.remove.isError;
  return (
    <div className="flex flex-col gap-md">
      <Switch label={m.calendar_event_shift()} checked={shift} onCheckedChange={setShift} />
      <label className="flex flex-col gap-xs">
        <span className="text-label text-muted-foreground">
          {shift ? m.calendar_event_person() : m.calendar_event_title()}
        </span>
        <input
          key={shift ? 'person' : 'title'}
          data-initial-focus=""
          value={shift ? person : title}
          maxLength={shift ? 60 : 120}
          onChange={(event) => (shift ? setPerson : setTitle)(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void save();
            }
          }}
          className={field}
        />
      </label>
      <div className="flex flex-col gap-xs">
        <span className="text-label text-muted-foreground">{m.calendar_event_day()}</span>
        <button
          type="button"
          aria-expanded={choosing}
          aria-label={`${m.calendar_pick_day()}: ${dayTitle(day)}`}
          onClick={() => setChoosing((open) => !open)}
          className={`${field} flex cursor-pointer items-center justify-between text-left`}
        >
          <span>{dayTitle(day)}</span>
          <CalendarBlankIcon className="size-icon-sm" aria-hidden />
        </button>
      </div>
      {choosing && (
        <div className="flex flex-col gap-sm rounded-md border border-border p-sm">
          <label className="flex flex-col gap-2xs">
            <span className="text-caption text-muted-foreground">{m.calendar_type_day()}</span>
            <input
              value={typedDay}
              placeholder={m.calendar_type_day_placeholder()}
              aria-invalid={unknownDay || undefined}
              onChange={(event) => {
                setTypedDay(event.target.value);
                setUnknownDay(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  readTypedDay();
                }
              }}
              className={`${field} placeholder:text-muted-foreground`}
            />
            {unknownDay && <span className="text-caption text-danger">{m.calendar_day_unknown()}</span>}
          </label>
          <Calendar
            value={day}
            onValueChange={pick}
            min={EARLIEST}
            previousLabel={m.calendar_month_previous()}
            nextLabel={m.calendar_month_next()}
          />
        </div>
      )}
      <div className="flex gap-md">
        <label className="flex flex-1 flex-col gap-xs">
          <span className="text-label text-muted-foreground">{m.calendar_event_start()}</span>
          <input type="time" value={start} onChange={(event) => setStart(event.target.value)} className={field} />
        </label>
        <label className="flex flex-1 flex-col gap-xs">
          <span className="text-label text-muted-foreground">{m.calendar_event_end()}</span>
          <input
            type="time"
            value={end}
            aria-invalid={badTimes || undefined}
            onChange={(event) => setEnd(event.target.value)}
            className={field}
          />
        </label>
      </div>
      {badTimes && <p className="text-caption text-danger">{m.calendar_event_times()}</p>}
      <div className="flex items-center justify-between gap-md">
        <p className="text-caption text-muted-foreground">{m.calendar_event_hint()}</p>
        <div className="flex gap-xs">
          {editing && (
            <button
              type="button"
              onClick={() => {
                actions.remove.mutateAsync({ id: editing.id }).then(
                  () => {
                    onRemoved(editing);
                    onClose();
                  },
                  // The error line below says it; the card stays open.
                  () => undefined,
                );
              }}
              className="min-h-touch cursor-pointer rounded-full border border-border px-md text-label"
            >
              {m.calendar_event_remove()}
            </button>
          )}
          <button
            type="button"
            disabled={!ready || pending}
            onClick={() => void save()}
            className="min-h-touch cursor-pointer rounded-full bg-foreground px-lg text-label font-medium text-background disabled:opacity-50"
          >
            {m.calendar_event_save()}
          </button>
        </div>
      </div>
      {failed && (
        <p role="alert" className="text-caption text-danger">
          {m.calendar_event_error()}
        </p>
      )}
    </div>
  );
}
