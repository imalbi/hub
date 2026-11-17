import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Panel } from '../../components/panel.tsx';
import { TodayRow } from '../../components/today-row.tsx';
import { useLiveModuleUIs, useIsOn } from '../../lib/enabled-modules.ts';
import type { TodayDay, TodayLine, TodayLinesHook } from '../../lib/module-ui.ts';
import type { WidgetSize } from '../../lib/widget-size.ts';
import { useNow } from '../../lib/use-now.ts';
import { addDays, dayDate, localDay } from '../../lib/day.ts';
import { useTRPC } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';

const date = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const weekday = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric' });
const time = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });

// Lines per day by size (decision 9): cut by count with "e altre N", never clipped or scrolled.
const LINES: Partial<Record<WidgetSize, number>> = { medium: 2, wide: 3, large: 4, full: 6 };
// Post-it cards per day by size, cut the same way.
// Grande keeps one row of two: with four lines, "e altre N" and two rows of cards it overflowed its cell (step 64 review).
const CARDS: Partial<Record<WidgetSize, number>> = { wide: 2, large: 2, full: 2 };

type Reported = Record<string, TodayLine[] | null>;

/** Oggi in four sizes (step 66, board P2): date and time, the modules' lines, the post-its and the weather. */
export function TodayWidget({ size }: { size: WidgetSize }) {
  const now = useNow('clock');
  const modules = useLiveModuleUIs();
  const days: TodayDay[] = size === 'full' ? ['today', 'tomorrow'] : ['today'];
  const hooks = modules.flatMap((module) =>
    [module.todayItems ?? []].flat().map((hook, index) => ({ hook, id: `${module.name}-${index}` })),
  );
  const [reported, setReported] = useState<Reported>({});
  const report = useCallback((id: string, lines: TodayLine[] | null) => {
    setReported((previous) =>
      JSON.stringify(previous[id] ?? null) === JSON.stringify(lines) ? previous : { ...previous, [id]: lines },
    );
  }, []);
  const linesOf = (day: TodayDay) => hooks.flatMap(({ id }) => reported[`${id}:${day}`] ?? []);
  const Column = modules.find((module) => module.todayColumn)?.todayColumn;
  const max = LINES[size] ?? 3;
  const cards = CARDS[size] ?? 2;
  const clock = (
    <div className="flex flex-col gap-2xs">
      <p className="text-title whitespace-nowrap">{date.format(now)}</p>
      <p className="text-hero tabular-nums">{time.format(now)}</p>
    </div>
  );
  const probes = days.flatMap((day) =>
    hooks.map(({ hook, id }) => (
      <LinesProbe key={`${id}:${day}`} id={`${id}:${day}`} useLines={hook} day={day} report={report} />
    )),
  );
  return (
    <Panel title={m.today_title()} className="h-full">
      {probes}
      {size === 'medium' ? (
        <div className="flex min-h-0 flex-1 gap-lg">
          <div className="flex shrink-0 flex-col justify-end border-r border-border pr-lg">{clock}</div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-sm">
            <Lines lines={linesOf('today')} max={max} label={m.today_lines()} />
            <div className="flex items-center justify-between gap-sm">
              {Column ? <Column day="today" variant="count" max={0} /> : <span />}
              <Weather look="caption" />
            </div>
          </div>
        </div>
      ) : size === 'large' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-md">
          <div className="flex items-start justify-between gap-lg">
            {clock}
            <Weather look="block" align="end" />
          </div>
          <Divided>
            <Lines lines={linesOf('today')} max={max} label={m.today_lines()} />
          </Divided>
          {Column && (
            <Divided>
              <Column day="today" variant="grid" max={cards} />
            </Divided>
          )}
        </div>
      ) : size === 'full' ? (
        <div className="flex min-h-0 flex-1 gap-lg">
          <div className="flex shrink-0 flex-col justify-end gap-sm border-r border-border pr-lg">
            {clock}
            <Weather look="caption" />
          </div>
          {days.map((day) => (
            <div
              key={day}
              className="flex min-h-0 min-w-0 flex-1 flex-col gap-sm border-border not-last:border-r not-last:pr-lg"
            >
              <h3 className="text-caption text-muted-foreground">
                {day === 'today'
                  ? m.today_title()
                  : m.today_tomorrow({ day: weekday.format(dayDate(addDays(localDay(new Date(now)), 1))) })}
              </h3>
              <Lines
                lines={linesOf(day)}
                max={max}
                label={day === 'today' ? m.today_lines() : m.today_lines_tomorrow()}
              />
              {Column && <Column day={day} variant="stack" max={cards} />}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-lg">
          <div className="flex shrink-0 flex-col justify-end border-r border-border pr-lg">{clock}</div>
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <Lines lines={linesOf('today')} max={max} label={m.today_lines()} />
          </div>
          {Column && (
            <div className="flex w-1/4 min-w-0 flex-col border-l border-border pl-lg">
              <Column day="today" variant="column" max={cards} />
            </div>
          )}
          <div className="flex w-1/6 flex-col justify-end border-l border-border pl-lg">
            <Weather look="block" />
          </div>
        </div>
      )}
    </Panel>
  );
}

function Divided({ children }: { children: ReactNode }) {
  return <div className="border-t border-border pt-md">{children}</div>;
}

function Lines({ lines, max, label }: { lines: TodayLine[]; max: number; label: string }) {
  if (!lines.length) return null;
  const shown = lines.slice(0, max);
  return (
    <ul aria-label={label} className="flex min-w-0 flex-col gap-xs">
      {shown.map((line) => (
        <TodayRow key={line.id} line={line} />
      ))}
      {lines.length > max && (
        <li className="text-caption text-muted-foreground">{m.today_more({ count: lines.length - max })}</li>
      )}
    </ul>
  );
}

/** Calls one module's hook for one day and reports its lines up, so Oggi can count all of them before cutting. */
function LinesProbe({
  id,
  useLines,
  day,
  report,
}: {
  id: string;
  useLines: TodayLinesHook;
  day: TodayDay;
  report: (id: string, lines: TodayLine[] | null) => void;
}) {
  // `useLines`, not `hook` or `use`: the React Compiler skips a call it does not see as a hook (the hooks inside then
  // ran on some renders only: "Cannot set properties of undefined (setting 'destroy')"), and treats a bare `use` as React's.
  const lines = useLines(day);
  const key = JSON.stringify(lines);
  useEffect(() => {
    report(id, lines);
    // The serialised value is the dependency: a hook may return fresh objects on every render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key, report]);
  useEffect(() => () => report(id, null), [id, report]);
  return null;
}

/** The weather in a block (Grande, Largo) or one caption (Medio, Esteso); without data while on, it says so. */
function Weather({ look, align = 'start' }: { look: 'block' | 'caption'; align?: 'start' | 'end' }) {
  const trpc = useTRPC();
  const on = useIsOn()('weather');
  const weather = useQuery({ ...trpc.weather.state.queryOptions(), enabled: on, refetchInterval: 60_000 });
  const current = weather.data;
  if (!on || !weather.isSuccess) return null;
  if (!current)
    return (
      <p className="text-caption text-muted-foreground">
        {m.today_weather_missing()} ·{' '}
        <Link to="/desk/settings/$module" params={{ module: 'weather' }} className="underline">
          {m.today_weather_set()}
        </Link>
      </p>
    );
  const stale = current.stale ? 'opacity-60' : '';
  const title = current.stale ? m.weather_stale() : undefined;
  if (look === 'caption')
    return (
      <p className={`text-caption text-muted-foreground tabular-nums ${stale}`} title={title}>
        {Math.round(current.temperature)}° · {current.name}
      </p>
    );
  return (
    <div className={`flex flex-col ${align === 'end' ? 'items-end text-right' : ''} ${stale}`} title={title}>
      <p className="text-caption text-muted-foreground">{current.name}</p>
      <p className="text-display tabular-nums">{Math.round(current.temperature)}°</p>
      <p className="text-caption text-muted-foreground tabular-nums">
        {Math.round(current.min)}° / {Math.round(current.max)}°
      </p>
    </div>
  );
}
