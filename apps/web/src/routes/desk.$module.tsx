import { createFileRoute, notFound } from '@tanstack/react-router';
import { moduleUIs } from '../lib/modules.ts';
import { zoneSearch } from '../lib/zone-search.ts';
import { ZonePage } from '../shell/zone-page.tsx';

export const Route = createFileRoute('/desk/$module')({ validateSearch: zoneSearch, component: ModuleZone });

function ModuleZone() {
  const { module } = Route.useParams();
  const zone = moduleUIs.find((entry) => entry.zone?.id === module)?.zone;
  if (!zone) throw notFound();
  return <ZonePage zone={zone.id} own={[{ id: zone.id, label: zone.label, component: zone.page }]} />;
}
