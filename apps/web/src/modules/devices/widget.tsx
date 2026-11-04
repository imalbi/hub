import { DevicesPanel } from './desk-panel.tsx';

// The same panel at both sizes; a long device list scrolls inside the cell.
export function DevicesWidget() {
  return <DevicesPanel className="min-h-full" />;
}
