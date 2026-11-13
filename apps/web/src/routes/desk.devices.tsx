import { createFileRoute } from '@tanstack/react-router';
import { PageGrid } from '../components/page-grid.tsx';
import { zoneSearch } from '../lib/zone-search.ts';
import { DevicesPanel } from '../modules/devices/desk-panel.tsx';
import { ServicesPanel } from '../modules/devices/services-panel.tsx';
import { m } from '../paraglide/messages.js';
import { ZonePage } from '../shell/zone-page.tsx';

export const Route = createFileRoute('/desk/devices')({ validateSearch: zoneSearch, component: Devices });

function DevicesTab() {
  return (
    <PageGrid>
      <DevicesPanel className="col-span-6" />
      <ServicesPanel className="col-span-6" />
    </PageGrid>
  );
}

const own = [{ id: 'devices', label: m.devices_title, component: DevicesTab }];

function Devices() {
  return <ZonePage zone="devices" own={own} />;
}
