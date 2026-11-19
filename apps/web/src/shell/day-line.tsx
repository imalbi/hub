import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLiveModuleUIs } from '../lib/enabled-modules.ts';
import { localDay } from '../lib/day.ts';
import { useContributions } from '../modules/calendar/contributions.tsx';
import { useEvents } from '../modules/calendar/use-calendar.tsx';
import { entriesByDay } from '../modules/calendar/days.ts';
import { useNow } from '../lib/use-now.ts';
import { useTRPC } from '../lib/trpc.ts';
import { m } from '../paraglide/messages.js';
import { dayPosition, packCaptions } from './day-line-math.ts';

type Report = { summary?: string | null };
const date = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const time = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });

export function DayLine({ heading = false, actions }: { heading?: boolean; actions?: ReactNode }) {
  const now = useNow('clock');
  const day = localDay(new Date(now));
  const range = { from: day, to: day };
  const events = useEvents(range);
  const contributions = useContributions(range);
  const entries = (entriesByDay(events.data ?? [], contributions.items).get(day) ?? []).filter((entry) => entry.time);
  const captions = [
    ...entries.map((entry) => {
      const at = new Date(`${day}T${entry.time}:00`);
      const short = time.format(at);
      return { id: entry.id, at: at.getTime(), short, full: `${short} ${entry.title}` };
    }),
    { id: 'day-now', at: now, short: m.day_now(), full: m.day_now() },
  ].toSorted((a, b) => a.at - b.at);
  const ruler = useRef<HTMLDivElement>(null);
  const [placements, setPlacements] = useState<ReturnType<typeof packCaptions>>([]);
  const captionKey = JSON.stringify(captions.map(({ id, at, full }) => [id, at, full]));
  useLayoutEffect(() => {
    const element = ruler.current;
    if (!element) return;
    const measure = () => {
      const full = element.querySelectorAll<HTMLElement>('[data-caption-full]');
      const short = element.querySelectorAll<HTMLElement>('[data-caption-short]');
      const measured = captions.map((caption, index) => ({
        x: dayPosition(caption.at, now) * element.clientWidth,
        width: full[index]?.getBoundingClientRect().width ?? 0,
        shortWidth: short[index]?.getBoundingClientRect().width ?? 0,
      }));
      setPlacements(packCaptions(element.clientWidth, measured));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const text of element.querySelectorAll<HTMLElement>('[data-caption-full], [data-caption-short]'))
      observer.observe(text);
    measure();
    return () => observer.disconnect();
    // The serialised value changes whenever the rendered text or time changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionKey]);
  const trpc = useTRPC();
  const queries = useQueryClient();
  const sessions = useQuery(trpc.pomodoro.today.queryOptions());
  useSubscription({
    ...trpc.pomodoro.onState.subscriptionOptions(),
    onData: () => void queries.invalidateQueries({ queryKey: trpc.pomodoro.today.queryKey() }),
  });
  const modules = useLiveModuleUIs();
  const [reported, setReported] = useState<Record<string, Report>>({});
  const report = useCallback((id: string, value: Report | null) => {
    setReported((old) => {
      if (JSON.stringify(old[id] ?? null) === JSON.stringify(value)) return old;
      const next = { ...old };
      if (value) next[id] = value;
      else delete next[id];
      return next;
    });
  }, []);
  const summaries = modules.filter((module) => module.daySummary);
  const reports = summaries.map((module) => reported[`${module.name}-summary`]).filter((entry) => entry !== undefined);
  const blocks = sessions.data ?? [];
  const totalMinutes = Math.round(
    blocks.reduce((sum, session) => sum + session.endedAt - session.startedAt, 0) / 60000,
  );
  return (
    <section aria-label={m.day_line()} className="flex min-w-0 flex-col gap-sm">
      {contributions.sources}
      {summaries.map(
        (module) =>
          module.daySummary && (
            <SummaryProbe
              key={module.name}
              id={`${module.name}-summary`}
              useSummary={module.daySummary}
              report={report}
            />
          ),
      )}
      {heading && (
        <div className="flex items-center justify-between gap-md text-muted-foreground">
          <span className="text-caps">{date.format(now)}</span>
          <span className="ml-auto text-caps">
            {[
              m.day_focus_summary({ count: blocks.length, minutes: totalMinutes }),
              ...reports.map((entry) => entry.summary).filter(Boolean),
            ].join(' · ')}
          </span>
          {actions}
        </div>
      )}
      <div ref={ruler} className="day-ruler" data-day-ruler>
        {blocks.map((session) => (
          <span
            key={`${session.startedAt}-${session.endedAt}`}
            data-day-block
            className="day-block"
            style={{
              left: `${dayPosition(session.startedAt, now) * 100}%`,
              width: `${Math.max(0, dayPosition(session.endedAt, now) - dayPosition(session.startedAt, now)) * 100}%`,
            }}
          />
        ))}
        {entries.map((entry) => {
          const at = new Date(`${day}T${entry.time}:00`);
          const start = dayPosition(at, now);
          const end =
            entry.own?.end && entry.own.end > (entry.time ?? '')
              ? dayPosition(new Date(`${day}T${entry.own.end}:00`), now)
              : entry.own?.end
                ? 1
                : start;
          return (
            <span
              key={entry.id}
              data-day-event
              aria-label={entry.title}
              className={end > start ? 'day-event' : 'day-mark'}
              style={{ left: `${start * 100}%`, ...(end > start ? { width: `${(end - start) * 100}%` } : {}) }}
            />
          );
        })}
        <span data-day-now className="day-now" style={{ left: `${dayPosition(now) * 100}%` }} />
        {captions.map((caption, index) => (
          <span key={caption.id}>
            <span aria-hidden data-caption-full className="day-caption-measure text-caps tracking-normal normal-case">
              {caption.full}
            </span>
            <span aria-hidden data-caption-short className="day-caption-measure text-caps tracking-normal normal-case">
              {caption.short}
            </span>
            {!placements[index] && <span className="sr-only">{caption.full}</span>}
            {placements[index] && (
              <span
                data-day-caption
                aria-label={caption.full}
                title={caption.full}
                className={`day-caption text-caps tracking-normal normal-case ${caption.id === 'day-now' ? 'text-accent' : ''}`}
                style={{ left: placements[index].x, top: `${3.5 + placements[index].row * 1.5}rem` }}
              >
                {placements[index].short ? caption.short : caption.full}
              </span>
            )}
          </span>
        ))}
      </div>
      <div
        aria-hidden
        className="mb-lg flex justify-between text-figure text-muted-foreground"
        style={{ marginBottom: entries.length ? '3rem' : undefined }}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i}>{String(6 + i * 2).padStart(2, '0')}</span>
        ))}
      </div>
    </section>
  );
}

function SummaryProbe({
  id,
  useSummary,
  report,
}: {
  id: string;
  useSummary: () => string | null;
  report: (id: string, value: Report | null) => void;
}) {
  const summary = useSummary();
  useEffect(() => {
    report(id, { summary });
  }, [id, summary, report]);
  useEffect(() => () => report(id, null), [id, report]);
  return null;
}
