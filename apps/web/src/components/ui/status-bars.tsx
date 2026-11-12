// Hairline UI · status-bars · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components
import { useId, useState } from 'react';
import { NumberRoll } from './number-roll.tsx';

export type DayStatus = 'operational' | 'degraded' | 'major' | 'none';
export type StatusService = {
  id: string;
  name: string;
  status: DayStatus;
  latency: number | null;
  uptime: number | null;
  days: { date: string; status: DayStatus; minutes: number }[];
};
export type StatusBarsCopy = {
  overall: (status: DayStatus) => string;
  status: (status: DayStatus) => string;
  day: (date: string, status: DayStatus, minutes: number) => string;
  help: string;
  latency: (ms: number) => string;
  uptime: string;
  daysAgo: (days: number) => string;
  today: string;
  services: string;
};
const colors: Record<DayStatus, string> = {
  operational: 'bg-success',
  degraded: 'bg-muted-foreground',
  major: 'bg-danger',
  none: 'bg-muted',
};
function Service({ service, copy }: { service: StatusService; copy: StatusBarsCopy }) {
  const helpId = useId();
  const [active, setActive] = useState<number | null>(null);
  const day = active === null ? null : service.days[active];
  const firstVisible = Math.max(0, service.days.length - 30);
  function move(index: number) {
    setActive(Math.max(0, Math.min(service.days.length - 1, index)));
  }
  return (
    <article className="border-b border-border py-md last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <div className="flex items-baseline gap-sm">
          <h3 className="text-label font-medium">{service.name}</h3>
          <span className="text-caption text-muted-foreground">{copy.status(service.status)}</span>
          {service.latency !== null && (
            <span data-latency className="text-caption text-muted-foreground">
              {copy.latency(service.latency)}
            </span>
          )}
        </div>
        {service.uptime !== null && (
          <p className="text-caption text-muted-foreground">
            <NumberRoll
              value={service.uptime / 100}
              format={{ style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }}
            />{' '}
            {copy.uptime}
          </p>
        )}
      </div>
      <div className="relative mt-sm">
        {day && (
          <output className="absolute bottom-full left-0 z-10 rounded-lg border border-border bg-background p-sm text-caption shadow-lg">
            {copy.day(day.date, day.status, day.minutes)}
          </output>
        )}
        <button
          type="button"
          aria-label={service.name}
          aria-describedby={helpId}
          onFocus={() => move(service.days.length - 1)}
          onBlur={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
          onKeyDown={(event) => {
            const current = active ?? service.days.length - 1;
            if (event.key === 'ArrowLeft') move(current - 1);
            else if (event.key === 'ArrowRight') move(current + 1);
            else if (event.key === 'Home') move(0);
            else if (event.key === 'End') move(service.days.length - 1);
            else if (event.key === 'Escape') setActive(null);
            else return;
            event.preventDefault();
          }}
          className="flex h-touch w-full gap-3xs rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {service.days.map((item, index) => (
            <span
              key={item.date}
              data-bar={item.date}
              onPointerEnter={() => setActive(index)}
              className={`min-w-0 flex-1 rounded-sm ${colors[item.status]} ${index < firstVisible ? 'hidden @lg:block' : ''}`}
            />
          ))}
        </button>
        <span id={helpId} className="sr-only">
          {copy.help}
        </span>
      </div>
      <div className="mt-2xs flex justify-between text-caption text-muted-foreground">
        <span>
          <span className="@lg:hidden">{copy.daysAgo(Math.min(30, service.days.length))}</span>
          <span className="hidden @lg:inline">{copy.daysAgo(service.days.length)}</span>
        </span>
        <span>{copy.today}</span>
      </div>
    </article>
  );
}
export function StatusBars({ services, copy }: { services: StatusService[]; copy: StatusBarsCopy }) {
  const status: DayStatus = services.some((s) => s.status === 'major')
    ? 'major'
    : services.some((s) => s.status === 'degraded')
      ? 'degraded'
      : services.some((s) => s.status === 'none') || !services.length
        ? 'none'
        : 'operational';
  return (
    <div className="@container rounded-xl border border-border bg-background">
      <h2 className="flex items-center gap-sm border-b border-border p-lg text-title">
        <span aria-hidden className={`size-xs rounded-full ${colors[status]}`} />
        {copy.overall(status)}
      </h2>
      <section aria-label={copy.services} className="px-lg">
        {services.map((service) => (
          <Service key={service.id} service={service} copy={copy} />
        ))}
      </section>
    </div>
  );
}
