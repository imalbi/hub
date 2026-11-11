import { createFileRoute } from '@tanstack/react-router';
import { PageGrid } from '../components/page-grid.tsx';
import { zoneSearch } from '../lib/zone-search.ts';
import { AudioPanel } from '../modules/audio/desk-panel.tsx';
import { ControlsWidget } from '../modules/system/controls-widget.tsx';
import { StatusPanel } from '../modules/system/desk-panel.tsx';
import { PowerWidget } from '../modules/system/power-widget.tsx';
import { m } from '../paraglide/messages.js';
import { ZonePage } from '../shell/zone-page.tsx';

export const Route = createFileRoute('/desk/system')({ validateSearch: zoneSearch, component: System });

// The widgets already are panels; at this step they only change frame, so each sits in a cell of the grid.
function SystemTab() {
  return (
    <PageGrid>
      <div className="col-span-12">
        <ControlsWidget size="wide" />
      </div>
      <div className="col-span-6">
        <PowerWidget />
      </div>
      <StatusPanel className="col-span-6" />
      <AudioPanel controls className="col-span-6" />
    </PageGrid>
  );
}

const own = [{ id: 'system', label: m.zone_system, component: SystemTab }];

function System() {
  return <ZonePage zone="system" own={own} />;
}
