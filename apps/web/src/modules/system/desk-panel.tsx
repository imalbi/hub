import { Link } from '@tanstack/react-router';
import { Panel } from '../../components/panel.tsx';
import { m } from '../../paraglide/messages.js';
import { ServerStatus } from './server-status.tsx';
export function StatusPanel({ overview = false, className = '' }: { overview?: boolean; className?: string }) {
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
        <ServerStatus />
      </p>
    </Panel>
  );
}
