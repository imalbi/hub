import { createFileRoute } from '@tanstack/react-router';
import { DevicesPanel } from '../desk/devices-panel.tsx';
import { ThemePanel } from '../desk/theme-panel.tsx';
export const Route = createFileRoute('/desk/devices')({ component: Devices });
function Devices() {
  return (
    <>
      <DevicesPanel className="col-span-8" />
      <ThemePanel className="col-span-4" />
    </>
  );
}
