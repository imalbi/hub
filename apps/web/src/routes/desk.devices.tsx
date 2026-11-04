import { createFileRoute } from '@tanstack/react-router';
import { DevicesPanel } from '../modules/devices/desk-panel.tsx';
import { ThemePanel } from '../theme/theme-panel.tsx';
export const Route = createFileRoute('/desk/devices')({ component: Devices });
function Devices() {
  return (
    <>
      <DevicesPanel className="col-span-5" />
      <ThemePanel className="col-span-7" />
    </>
  );
}
