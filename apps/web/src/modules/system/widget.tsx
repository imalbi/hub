import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Panel } from '../../components/panel.tsx';
import { Readout } from '../../components/readout.tsx';
import { useTRPC } from '../../lib/trpc.ts';
import type { WidgetSize } from '../../lib/widget-size.ts';
import { m } from '../../paraglide/messages.js';
import { StatusPanel } from './desk-panel.tsx';
import { uptimeText } from './uptime.ts';

export function ServerWidget({ size }: { size: WidgetSize }) {
  return size === 'small' ? <SmallServer /> : <StatusPanel overview className="h-full" />;
}

/** Phone-widget shape: active state in header, uptime figure large bottom-left with "dall'ultimo avvio". */
function SmallServer() {
  const trpc = useTRPC();
  const health = useQuery(trpc.health.queryOptions());
  const headerState = health.data ? (
    <span className="inline-flex items-center gap-xs text-muted-foreground">
      <span aria-hidden className="size-2xs rounded-full bg-success" />
      <span>{m.server_active()}</span>
    </span>
  ) : (
    <span className="text-muted-foreground">{health.error ? m.server_unreachable() : m.server_connecting()}</span>
  );
  return (
    <Panel title={m.server_panel_title()} className="relative h-full" action={headerState}>
      <Link
        to="/desk/system"
        aria-label={m.zone_open({ zone: m.zone_system() })}
        className="absolute inset-0 rounded-lg focus-visible:outline focus-visible:outline-accent"
      />
      <div className="mt-auto flex flex-col gap-3xs">
        {health.data && (
          <>
            <p>
              <Readout>{uptimeText(health.data.uptime)}</Readout>
            </p>
            <p className="text-caption text-muted-foreground">{m.server_since_start()}</p>
          </>
        )}
      </div>
    </Panel>
  );
}
