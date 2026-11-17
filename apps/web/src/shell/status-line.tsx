import { useQuery } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useLiveModuleUIs } from '../lib/enabled-modules.ts';
import { useTRPC } from '../lib/trpc.ts';
import { uptimeText } from '../modules/system/uptime.ts';
import { powerText } from '../modules/system/power-text.ts';
import { m } from '../paraglide/messages.js';

export function StatusLine() {
  const trpc = useTRPC();
  const health = useQuery({ ...trpc.health.queryOptions(), refetchInterval: 60_000 });
  const power = useSubscription(trpc.system.onPower.subscriptionOptions());
  const audio = useSubscription(trpc.audio.onState.subscriptionOptions());
  const modules = useLiveModuleUIs();
  const powerValue = power.data && powerText(power.data);
  return (
    <footer
      role="contentinfo"
      aria-label={m.status_line()}
      className="flex shrink-0 items-center gap-xl overflow-hidden border-t border-border px-lg py-sm text-mono-label tracking-normal text-muted-foreground normal-case"
    >
      <span className="text-foreground">hub</span>
      {health.data && <span>{uptimeText(health.data.uptime)}</span>}
      {powerValue && <span>{[powerValue.figure, powerValue.today].filter(Boolean).join(' · ')}</span>}
      {audio.data && (
        <span>
          {audio.data.current?.label} {Math.round(audio.data.volume * 100)}%
        </span>
      )}
      {modules.flatMap((module) =>
        [module.statusItems ?? []].flat().map((Item, index) => <Item key={`${module.name}-${index}`} />),
      )}
      <span className="ml-auto whitespace-nowrap">{m.status_search()}</span>
    </footer>
  );
}
