import { createFileRoute, notFound } from '@tanstack/react-router';
import { useLiveModuleUIs } from '../lib/enabled-modules.ts';
import { zoneSearch } from '../lib/zone-search.ts';
import { ContentBoundary } from '../shell/content-boundary.tsx';
import { ZonePage } from '../shell/zone-page.tsx';

export const Route = createFileRoute('/desk/$module')({
  validateSearch: zoneSearch.loose(),
  component: ModuleZone,
});

function ModuleZone() {
  const { module } = Route.useParams();
  const zone = useLiveModuleUIs().find((entry) => entry.zone?.id === module)?.zone;
  if (!zone) throw notFound();
  // A page that brings its own `ZoneTabs` gets only the frame: the bar sits above the surface it renders, as on every page.
  if (zone.ownTabs)
    return (
      <div data-fill className="col-span-12 flex h-full min-h-0 flex-col gap-lg">
        <ContentBoundary key={module}>
          <zone.page />
        </ContentBoundary>
      </div>
    );
  return <ZonePage zone={zone.id} own={[{ id: zone.id, label: zone.label, component: zone.page, fill: zone.fill }]} />;
}
