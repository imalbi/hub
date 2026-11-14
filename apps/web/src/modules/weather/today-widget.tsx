import { CloudIcon, CloudRainIcon, CloudSnowIcon, SunIcon, CloudLightningIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { Panel } from '../../components/panel.tsx';
import { useLiveModuleUIs, useIsOn } from '../../lib/enabled-modules.ts';
import { useNow } from '../../lib/use-now.ts';
import { useTRPC } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';

const date = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const time = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });

export function TodayWidget() {
  const now = useNow('clock');
  const trpc = useTRPC();
  const isOn = useIsOn();
  const weather = useQuery({ ...trpc.weather.state.queryOptions(), enabled: isOn('weather'), refetchInterval: 60_000 });
  const modules = useLiveModuleUIs();
  const columns = modules.flatMap((module) => (module.todayColumn ? [module.todayColumn] : []));
  const current = weather.data;
  const Icon =
    !current || current.code <= 1
      ? SunIcon
      : current.code <= 3 || current.code === 45 || current.code === 48
        ? CloudIcon
        : current.code >= 95
          ? CloudLightningIcon
          : (current.code >= 71 && current.code <= 77) || current.code >= 85
            ? CloudSnowIcon
            : CloudRainIcon;
  return (
    <Panel title={m.today_title()} className="h-full">
      <div className="flex min-h-0 flex-1 items-end justify-between gap-lg">
        <div className="flex flex-3 flex-col gap-xs">
          <p className="text-title">{date.format(now)}</p>
          <p className="text-display tabular-nums">{time.format(now)}</p>
          {modules.flatMap((module) => {
            const items = module.todayItems
              ? Array.isArray(module.todayItems)
                ? module.todayItems
                : [module.todayItems]
              : [];
            return items.map((Item, index) => (
              <div className="text-body" key={`${module.name}-${index}`}>
                <Item />
              </div>
            ));
          })}
        </div>
        {columns.map((Column, index) => (
          <Column key={index} />
        ))}
        {current && (
          <div
            className={`flex items-center gap-sm ${current.stale ? 'opacity-60' : ''}`}
            title={current.stale ? m.weather_stale() : undefined}
          >
            <Icon className="size-icon" aria-hidden />
            <div>
              <p className="text-title">{current.name}</p>
              <p className="text-body tabular-nums">
                {Math.round(current.temperature)}° · {Math.round(current.min)}° / {Math.round(current.max)}°
              </p>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
