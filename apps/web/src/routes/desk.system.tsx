import { createFileRoute } from '@tanstack/react-router';
import { StatusPanel } from '../desk/status-panel.tsx';
export const Route = createFileRoute('/desk/system')({ component: System });
function System() {
  return <StatusPanel className="col-span-6" />;
}
