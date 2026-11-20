import { Link, useRouter } from '@tanstack/react-router';
import { Panel } from '../../components/panel.tsx';
import { Readout } from '../../components/readout.tsx';
import { LoadingSkeleton } from '../../components/ui/loading-skeleton.tsx';
import { addDays, localDay } from '../../lib/day.ts';
import { useNow } from '../../lib/use-now.ts';
import type { WidgetSize } from '../../lib/widget-size.ts';
import { m } from '../../paraglide/messages.js';
import { useContributions } from './contributions.tsx';
import { nextCalendarEntry, upcomingEntries, WIDGET_DAYS, widgetDayLabel } from './days.ts';
import { kindName } from './kinds.ts';
import { useEvents } from './use-calendar.tsx';

/** Calendario widget on Panoramica in piccolo (3x1), medio (6x1), and grande (6x2). */
export function CalendarWidget({ size }: { size: WidgetSize }) {
  const router = useRouter();
  const now = useNow('clock');
  const nowDate = new Date(now);
  const today = localDay(nowDate);
  const nowTime = `${String(nowDate.getHours()).padStart(2, '0')}:${String(nowDate.getMinutes()).padStart(2, '0')}`;
  const range = { from: today, to: addDays(today, WIDGET_DAYS - 1) };
  const events = useEvents(range);
  const { items, sources } = useContributions(range);
  const title = size === 'small' ? m.calendar_widget_next() : m.calendar_upcoming();

  if (events.isError)
    return (
      <Panel title={title} className="h-full">
        <p className="text-caption text-muted-foreground">{m.tile_unavailable()}</p>
      </Panel>
    );

  if (events.isPending)
    return (
      <>
        {sources}
        <Panel title={title} className="h-full">
          <LoadingSkeleton label={m.tile_loading()} rows={size === 'large' ? 4 : 2} />
        </Panel>
      </>
    );

  const entries = upcomingEntries(events.data, items, today);
  const words = { today: m.calendar_today(), tomorrow: m.calendar_tomorrow() };

  if (size === 'small') {
    const next = nextCalendarEntry(entries, today, nowTime);
    const headerState = next ? (
      <span className="text-muted-foreground">
        {next.kind === 'timed' ? widgetDayLabel(next.entry.day, today, words) : kindName(next.entry.kind)}
      </span>
    ) : undefined;
    return (
      <>
        {sources}
        <Panel title={title} className="relative h-full" action={headerState}>
          <Link
            to="/desk/$module"
            params={{ module: 'calendar' }}
            aria-label={m.zone_open({ zone: m.calendar_title() })}
            className="absolute inset-0 rounded-lg focus-visible:outline focus-visible:outline-accent"
          />
          <div className="mt-auto flex min-w-0 flex-col gap-2xs">
            {!next ? (
              <p className="text-body text-muted-foreground">{m.calendar_empty()}</p>
            ) : next.kind === 'timed' ? (
              <>
                <p>
                  <Readout>{next.entry.time}</Readout>
                </p>
                <p className="truncate text-caption text-muted-foreground">{next.entry.title}</p>
              </>
            ) : (
              <>
                <p className="truncate text-display">{widgetDayLabel(next.entry.day, today, words)}</p>
                <p className="truncate text-caption text-muted-foreground">{next.entry.title}</p>
              </>
            )}
          </div>
        </Panel>
      </>
    );
  }

  const maxRows = size === 'large' ? 6 : 3;
  const visible = entries.slice(0, maxRows);
  const remaining = entries.length - visible.length;

  return (
    <>
      {sources}
      <Panel
        title={title}
        className="h-full"
        action={
          <Link
            to="/desk/$module"
            params={{ module: 'calendar' }}
            className="text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-accent"
          >
            {m.zone_open({ zone: m.calendar_title() })}
          </Link>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col gap-xs">
          {visible.length === 0 ? (
            <p className="mt-auto text-body text-muted-foreground">{m.calendar_empty()}</p>
          ) : (
            <ul className={`flex min-w-0 flex-col ${size === 'medium' ? 'mt-auto' : ''}`}>
              {visible.map((entry) => {
                const target = entry.href ?? '/desk/calendar';
                return (
                  <li key={entry.id} className="min-w-0 border-b border-dashed border-border last:border-b-0">
                    <a
                      href={target}
                      onClick={(event) => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                        event.preventDefault();
                        router.history.push(target);
                      }}
                      className={`flex min-w-0 items-center gap-sm ${size === 'large' ? 'py-sm' : 'py-xs'} rounded-sm hover:text-foreground focus-visible:outline focus-visible:outline-accent`}
                    >
                      <span className="w-label-col shrink-0 truncate text-label text-muted-foreground">
                        {widgetDayLabel(entry.day, today, words)}
                      </span>
                      <span
                        className={`w-agenda-tag shrink-0 truncate rounded-full border px-xs py-3xs text-center text-caption ${entry.kind === 'work' ? 'border-accent/50 text-accent' : 'border-border text-muted-foreground'}`}
                      >
                        {kindName(entry.kind)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-body">
                        {entry.time && (
                          <>
                            <span className="text-figure text-muted-foreground">{entry.time}</span>{' '}
                          </>
                        )}
                        {entry.title}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          {size === 'large' && remaining > 0 && (
            <p className="mt-auto truncate text-label text-muted-foreground tabular-nums">
              {m.calendar_more_entries({ count: remaining })}
            </p>
          )}
        </div>
      </Panel>
    </>
  );
}
