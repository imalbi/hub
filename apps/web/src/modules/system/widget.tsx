import { useQuery } from '@tanstack/react-query';
import { Panel } from '../../components/panel.tsx';
import { useTRPC } from '../../lib/trpc.ts';
import type { WidgetSize } from '../../lib/widget-size.ts';
import { m } from '../../paraglide/messages.js';
import { uptimeText } from './uptime.ts';
import { StatusPanel } from './desk-panel.tsx';

export function ServerWidget({ size }: { size: WidgetSize }) {
  return size === 'small' ? <SmallServer /> : <StatusPanel overview className="h-full" />;
}

/** Phone-widget shape: the label on top, the one figure large at the bottom. */
function SmallServer() {
  const trpc = useTRPC();
  const health = useQuery(trpc.health.queryOptions());
  return (
    <Panel title={m.server_panel_title()} className="h-full">
      <div className="mt-auto flex flex-col gap-2xs">
        <p className="text-caption text-muted-foreground">
          {health.data ? m.server_up_since() : health.error ? m.server_unreachable() : m.server_connecting()}
        </p>
        {health.data && <p className="text-display tabular-nums">{uptimeText(health.data.uptime)}</p>}
      </div>
    </Panel>
  );
}
