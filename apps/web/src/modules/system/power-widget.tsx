import { Link } from '@tanstack/react-router';
import { useSubscription } from '@trpc/tanstack-react-query';
import { Panel } from '../../components/panel.tsx';
import { Readout } from '../../components/readout.tsx';
import { useConnectionLost, useTRPC } from '../../lib/trpc.ts';
import type { WidgetSize } from '../../lib/widget-size.ts';
import { m } from '../../paraglide/messages.js';
import { powerText } from './power-text.ts';

/** Piccolo puts today's kWh in the header and "adesso" below watts; Medio keeps the existing single-figure card. */
export function PowerWidget({ size }: { size: WidgetSize }) {
  const trpc = useTRPC();
  const power = useSubscription(trpc.system.onPower.subscriptionOptions());
  const stale = useConnectionLost();
  const { figure, today } = powerText(power.data);

  if (size === 'small') {
    return (
      <Panel
        title={m.power_title()}
        className={`relative h-full ${stale ? 'opacity-60' : ''}`}
        action={<span className="text-muted-foreground tabular-nums">{today}</span>}
      >
        <Link
          to="/desk/system"
          aria-label={m.zone_open({ zone: m.zone_system() })}
          className="absolute inset-0 rounded-lg focus-visible:outline focus-visible:outline-accent"
        />
        <div className="mt-auto flex flex-col gap-3xs">
          {power.data && <p>{figure ? <Readout>{figure}</Readout> : m.power_not_measured()}</p>}
          {figure && <p className="text-caption text-muted-foreground">{m.power_now()}</p>}
        </div>
      </Panel>
    );
  }

  return (
    <Panel title={m.power_title()} className={`h-full ${stale ? 'opacity-60' : ''}`}>
      <div className="mt-auto flex flex-col gap-2xs">
        <p className="text-caption text-muted-foreground tabular-nums">{today}</p>
        {power.data && <p>{figure ? <Readout>{figure}</Readout> : m.power_not_measured()}</p>}
      </div>
    </Panel>
  );
}
