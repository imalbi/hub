import { createFileRoute, notFound } from '@tanstack/react-router';
import { useLiveModuleUIs } from '../lib/enabled-modules.ts';
import { zoneSearch } from '../lib/zone-search.ts';
import { ZonePage } from '../shell/zone-page.tsx';

export const Route = createFileRoute('/desk/$module')({
  validateSearch: zoneSearch.loose(),
  component: ModuleZone,
});

function ModuleZone() {
  const { module } = Route.useParams();
  const zone = useLiveModuleUIs().find((entry) => entry.zone?.id === module)?.zone;
  if (!zone) throw notFound();
  return <ZonePage zone={zone.id} own={[{ id: zone.id, label: zone.label, component: zone.page }]} />;
}
