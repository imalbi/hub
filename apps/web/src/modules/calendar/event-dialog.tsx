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
export type RemovedEvent =
  | { id: string; title: string; kind: 'event' | 'series' }
  | { id: string; title: string; kind: 'occurrence'; day: string };
type RuleDay = NonNullable<CalendarEvent['series']>['days'][number];

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
  onRemoved: (event: RemovedEvent) => void;
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
          className="pointer-events-auto max-h-full w-full max-w-dialog-sm overflow-y-auto rounded-lg border border-border bg-surface p-lg shadow-lg outline-none"
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
  onRemoved: (event: RemovedEvent) => void;
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
  const [scope, setScope] = useState<'day' | 'series' | null>(editing?.seriesId ? null : 'day');
  const [repeat, setRepeat] = useState(false);
  const [rules, setRules] = useState<RuleDay[]>([]);
  const [fromDay, setFromDay] = useState(editing?.day ?? ('day' in draft ? draft.day : today));
  const [untilDay, setUntilDay] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [typedDay, setTypedDay] = useState('');
  const [unknownDay, setUnknownDay] = useState(false);
  const pending =
    actions.add.isPending ||
    actions.update.isPending ||
    actions.addSeries.isPending ||
    actions.updateSeries.isPending ||
    actions.editOccurrence.isPending ||
    actions.removeSeries.isPending;
  const weekdays = [
    m.calendar_repeat_monday(),
    m.calendar_repeat_tuesday(),
    m.calendar_repeat_wednesday(),
    m.calendar_repeat_thursday(),
    m.calendar_repeat_friday(),
    m.calendar_repeat_saturday(),
    m.calendar_repeat_sunday(),
  ];
  // A shift may end the next day, so only an event has an order to keep.
  const badTimes = !shift && end !== '' && (start === '' || end <= start);
  const rulesValid =
    rules.length > 0 &&
    rules.every((rule) => (shift ? !!rule.start && !!rule.end : !rule.end || (!!rule.start && rule.end > rule.start)));
  const ready =
    scope !== null &&
    (shift
      ? person.trim().length > 0 && (repeat || (start !== '' && end !== ''))
      : title.trim().length > 0 && (repeat || !badTimes)) &&
    (!repeat || (rulesValid && fromDay !== '' && (!untilDay || untilDay >= fromDay)));

  function chooseScope(next: 'day' | 'series') {
    setScope(next);
    const series = editing?.series;
    if (next === 'series' && series) {
      setTitle(series.title);
      setShift(series.kind === 'shift');
      setPerson(series.person ?? '');
      setRules(series.days);
      setFromDay(series.fromDay);
      setUntilDay(series.untilDay ?? '');
      setRepeat(true);
    } else {
      setTitle(editing?.title ?? '');
      setShift(editing?.kind === 'shift');
      setPerson(editing?.person ?? '');
      setStart(editing?.start ?? '');
      setEnd(editing?.end ?? '');
      setRepeat(false);
    }
  }
  function changeRepeat(value: boolean) {
    setRepeat(value);
    if (value && !rules.length)
      setRules([{ weekday: new Date(`${day}T00:00:00Z`).getUTCDay() || 7, start: start || null, end: end || null }]);
    if (value) setFromDay(day);
  }
  function toggleDay(weekday: number) {
    setRules((current) =>
      current.some((rule) => rule.weekday === weekday)
        ? current.filter((rule) => rule.weekday !== weekday)
        : [...current, { weekday, start: start || null, end: end || null }].toSorted((a, b) => a.weekday - b.weekday),
    );
  }
  function setRuleTime(weekday: number, key: 'start' | 'end', value: string) {
    setRules((current) => current.map((rule) => (rule.weekday === weekday ? { ...rule, [key]: value || null } : rule)));
  }

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
    const input: {
      title: string;
      day: string;
      start: string | null;
      end: string | null;
      kind: 'event' | 'shift';
      person: string | null;
    } = {
      title: shift ? m.calendar_kind_shift() : title,
      day,
      start: start || null,
      end: end || null,
      kind: shift ? 'shift' : 'event',
      person: shift ? person : null,
    };
    try {
      if (repeat) {
        const series = {
          title: input.title,
          kind: input.kind,
          person: input.person,
          days: rules,
          fromDay,
          untilDay: untilDay || null,
        };
        if (editing?.seriesId && scope === 'series')
          await actions.updateSeries.mutateAsync({ id: editing.seriesId, ...series });
        else {
          const created = await actions.addSeries.mutateAsync(series);
          if (editing) {
            try {
              await actions.remove.mutateAsync({ id: editing.id });
            } catch (error) {
              await actions.removeSeries.mutateAsync({ id: created.id });
              throw error;
            }
          }
        }
      } else if (editing?.seriesId && editing.seriesDay) {
        await actions.editOccurrence.mutateAsync({ seriesId: editing.seriesId, day: editing.seriesDay, fields: input });
      } else if (editing) await actions.update.mutateAsync({ ...input, id: editing.id });
      else await actions.add.mutateAsync(input);
      onSaved(day);
      onClose();
    } catch {
      // The error line below says it; the draft stays.
    }
  }
  async function remove() {
    if (!editing || scope === null) return;
    try {
      if (editing.seriesId && scope === 'series') {
        await actions.removeSeries.mutateAsync({ id: editing.seriesId });
        onRemoved({ id: editing.seriesId, title: editing.title, kind: 'series' });
      } else if (editing.seriesId && editing.seriesDay) {
        await actions.editOccurrence.mutateAsync({ seriesId: editing.seriesId, day: editing.seriesDay, fields: null });
        onRemoved({ id: editing.seriesId, day: editing.seriesDay, title: editing.title, kind: 'occurrence' });
      } else {
        await actions.remove.mutateAsync({ id: editing.id });
        onRemoved({ id: editing.id, title: editing.title, kind: 'event' });
      }
      onClose();
    } catch {
      /* The error line keeps the draft open. */
    }
  }
  const failed =
    actions.add.isError ||
    actions.update.isError ||
    actions.remove.isError ||
    actions.addSeries.isError ||
    actions.updateSeries.isError ||
    actions.removeSeries.isError ||
    actions.editOccurrence.isError;

  return (
    <div className="flex flex-col gap-md">
      {editing?.seriesId && (
        <div className="flex flex-col gap-xs">
          <p className="text-label text-muted-foreground">{m.calendar_occurrence_choose()}</p>
          <div className="flex gap-xs">
            <button
              type="button"
              aria-pressed={scope === 'day'}
              onClick={() => chooseScope('day')}
              className="min-h-touch cursor-pointer rounded-full border border-border px-md text-label aria-pressed:bg-foreground aria-pressed:text-background"
            >
              {m.calendar_occurrence_only()}
            </button>
            <button
              type="button"
              aria-pressed={scope === 'series'}
              onClick={() => chooseScope('series')}
              className="min-h-touch cursor-pointer rounded-full border border-border px-md text-label aria-pressed:bg-foreground aria-pressed:text-background"
            >
              {m.calendar_occurrence_series()}
            </button>
          </div>
        </div>
      )}
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
      {!repeat && (
        <>
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
        </>
      )}
      {!repeat && (
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
      )}
      {!repeat && badTimes && <p className="text-caption text-danger">{m.calendar_event_times()}</p>}
      {(!editing?.seriesId || scope === 'series') && (
        <Switch
          label={m.calendar_repeat()}
          checked={repeat}
          onCheckedChange={changeRepeat}
          disabled={!!editing?.seriesId}
        />
      )}
      {repeat && (
        <div className="flex flex-col gap-sm">
          <fieldset className="grid grid-cols-7 gap-xs" aria-label={m.calendar_weekdays()}>
            {weekdays.map((name, index) => (
              <button
                key={name}
                type="button"
                aria-label={name}
                aria-pressed={rules.some((rule) => rule.weekday === index + 1)}
                onClick={() => toggleDay(index + 1)}
                className="min-h-touch cursor-pointer rounded-full border border-border px-0 text-label aria-pressed:bg-foreground aria-pressed:text-background"
              >
                {name.slice(0, 3)}
              </button>
            ))}
          </fieldset>
          {rules.map((rule, index) => (
            <div key={rule.weekday} className="flex items-end gap-xs">
              <span className="flex min-h-touch w-2xl shrink-0 items-center text-label">
                {weekdays[rule.weekday - 1]?.slice(0, 3)}
              </span>
              <label className="flex min-w-0 flex-1 flex-col gap-xs">
                {index === 0 && <span className="text-caption text-muted-foreground">{m.calendar_event_start()}</span>}
                <input
                  aria-label={m.calendar_repeat_day_start({ day: weekdays[rule.weekday - 1] ?? '' })}
                  type="time"
                  value={rule.start ?? ''}
                  onChange={(event) => setRuleTime(rule.weekday, 'start', event.target.value)}
                  className={field}
                />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-xs">
                {index === 0 && <span className="text-caption text-muted-foreground">{m.calendar_event_end()}</span>}
                <input
                  aria-label={m.calendar_repeat_day_end({ day: weekdays[rule.weekday - 1] ?? '' })}
                  type="time"
                  value={rule.end ?? ''}
                  onChange={(event) => setRuleTime(rule.weekday, 'end', event.target.value)}
                  className={field}
                />
              </label>
            </div>
          ))}
          <div className="flex gap-xs">
            <label className="flex min-w-0 flex-1 flex-col gap-xs">
              <span className="text-label text-muted-foreground">{m.calendar_repeat_from()}</span>
              <input
                type="date"
                value={fromDay}
                onChange={(event) => setFromDay(event.target.value)}
                className={field}
              />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-xs">
              <span className="text-label text-muted-foreground">{m.calendar_repeat_until()}</span>
              <input
                type="date"
                value={untilDay}
                onChange={(event) => setUntilDay(event.target.value)}
                className={field}
              />
            </label>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-md">
        <p className="text-caption text-muted-foreground">{m.calendar_event_hint()}</p>
        <div className="flex gap-xs">
          {editing && (
            <button
              type="button"
              disabled={scope === null || pending}
              onClick={() => void remove()}
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
