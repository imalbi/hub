import { useSubscription } from '@trpc/tanstack-react-query';
import { Panel } from '../../components/panel.tsx';
import { useConnectionLost, useTRPC } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';
import { powerText } from './power-text.ts';

/** Watts now as the big light figure, today's kWh under it. Same layout at every size: one figure. */
export function PowerWidget() {
  const trpc = useTRPC();
  const power = useSubscription(trpc.system.onPower.subscriptionOptions());
  const stale = useConnectionLost();
  const { figure, today } = powerText(power.data);
  return (
    <Panel title={m.power_title()} className={`h-full ${stale ? 'opacity-60' : ''}`}>
      <div className="mt-auto flex flex-col gap-2xs">
        <p className="text-caption text-muted-foreground tabular-nums">{today}</p>
        {power.data && <p className="text-display tabular-nums">{figure ?? m.power_not_measured()}</p>}
      </div>
    </Panel>
  );
}
