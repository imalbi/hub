import { createFileRoute } from '@tanstack/react-router';
import { StatusPanel } from '../modules/system/desk-panel.tsx';
export const Route = createFileRoute('/desk/system')({ component: System });
function System() {
  return <StatusPanel className="col-span-6" />;
}
