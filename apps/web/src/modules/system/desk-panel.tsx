import { Link } from '@tanstack/react-router';
import { useInWidget } from '../../shell/widget-context.ts';
import { Readout } from '../../components/readout.tsx';
import { Panel } from '../../components/panel.tsx';
import { m } from '../../paraglide/messages.js';
import { ServerStatus } from './server-status.tsx';
export function StatusPanel({ overview = false, className = '' }: { overview?: boolean; className?: string }) {
  const widget = useInWidget();
  return (
    <Panel
      title={m.server_panel_title()}
      className={className}
      action={
        overview ? (
          <Link to="/desk/system" className="text-caption text-muted-foreground hover:text-foreground">
            {m.zone_open({ zone: m.zone_system() })}
          </Link>
        ) : undefined
      }
    >
      <p className="text-title tabular-nums">
        {widget ? (
          <Readout>
            <ServerStatus />
          </Readout>
        ) : (
          <ServerStatus />
        )}
      </p>
    </Panel>
  );
}
