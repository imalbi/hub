import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLiveModuleUIs } from '../lib/enabled-modules.ts';
import type { DayMark, DayMarksHook } from '../lib/module-ui.ts';
import { useNow } from '../lib/use-now.ts';
import { useTRPC } from '../lib/trpc.ts';
import { m } from '../paraglide/messages.js';
import { dayPosition } from './day-line-math.ts';

type Report = { marks?: DayMark[]; summary?: string | null };
const date = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const time = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });

export function DayLine({ heading = false, actions }: { heading?: boolean; actions?: ReactNode }) {
  const now = useNow('clock');
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
  const hooks = modules.flatMap((module) =>
    [module.dayMarks ?? []].flat().map((hook, index) => ({ id: `${module.name}-marks-${index}`, hook })),
  );
  const summaries = modules.filter((module) => module.daySummary);
  const reports = [
    ...hooks.map(({ id }) => reported[id]),
    ...summaries.map((module) => reported[`${module.name}-summary`]),
  ].filter((entry) => entry !== undefined);
  const blocks = sessions.data ?? [];
  const totalMinutes = Math.round(
    blocks.reduce((sum, session) => sum + session.endedAt - session.startedAt, 0) / 60000,
  );
  return (
    <section aria-label={m.day_line()} className="flex min-w-0 flex-col gap-sm">
      {hooks.map(({ id, hook }) => (
        <MarkProbe key={id} id={id} useMarks={hook} report={report} />
      ))}
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
      <div className="day-ruler" data-day-ruler>
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
        {reports
          .flatMap((entry) => entry.marks ?? [])
          .map((mark) => (
            <span key={mark.id} className="day-mark" style={{ left: `${dayPosition(mark.at, now) * 100}%` }}>
              <span className="day-caption text-caps tracking-normal normal-case">
                {time.format(mark.at)} {mark.label}
              </span>
            </span>
          ))}
        <span data-day-now className="day-now" style={{ left: `${dayPosition(now) * 100}%` }}>
          <span className="day-caption text-caps tracking-normal text-accent normal-case">{m.day_now()}</span>
        </span>
      </div>
      <div aria-hidden className="mb-lg flex justify-between text-figure text-muted-foreground">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i}>{String(6 + i * 2).padStart(2, '0')}</span>
        ))}
      </div>
    </section>
  );
}

function MarkProbe({
  id,
  useMarks,
  report,
}: {
  id: string;
  useMarks: DayMarksHook;
  report: (id: string, value: Report | null) => void;
}) {
  const marks = useMarks();
  useEffect(() => {
    report(id, { marks });
  }, [id, marks, report]);
  useEffect(() => () => report(id, null), [id, report]);
  return null;
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
