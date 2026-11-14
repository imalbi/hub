import { createFileRoute } from '@tanstack/react-router';
import { zoneSearch } from '../lib/zone-search.ts';
import { DevicesBoard } from '../modules/devices/desk-panel.tsx';
import { m } from '../paraglide/messages.js';
import { ZonePage } from '../shell/zone-page.tsx';

export const Route = createFileRoute('/desk/devices')({ validateSearch: zoneSearch, component: Devices });

function DevicesTab() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-12 grid-rows-1 gap-lg">
      <DevicesBoard fill />
    </div>
  );
}

const own = [{ id: 'devices', label: m.devices_title, component: DevicesTab, fill: true }];

function Devices() {
  return <ZonePage zone="devices" own={own} />;
}
