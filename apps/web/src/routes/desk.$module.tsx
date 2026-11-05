import { createFileRoute, notFound } from '@tanstack/react-router';
import { moduleUIs } from '../lib/modules.ts';
import { WidgetBoard } from '../shell/widget-board.tsx';
export const Route = createFileRoute('/desk/$module')({ component: ModuleZone });
function ModuleZone() {
  const { module } = Route.useParams();
  const zone = moduleUIs.find((entry) => entry.zone?.id === module)?.zone;
  if (!zone) throw notFound();
  const Page = zone.page;
  return (
    <>
      {Page && <Page />}
      <WidgetBoard zone={zone.id} />
    </>
  );
}
