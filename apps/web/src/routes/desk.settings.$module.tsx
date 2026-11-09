import { createFileRoute } from '@tanstack/react-router';
import { ModulePage } from '../settings/module-page.tsx';

export const Route = createFileRoute('/desk/settings/$module')({ component: ModuleRoute });

function ModuleRoute() {
  const { module } = Route.useParams();
  // Keyed by name: moving to another module starts a fresh draft.
  return <ModulePage key={module} name={module} />;
}
