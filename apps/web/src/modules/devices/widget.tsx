import { DevicesPanel } from './desk-panel.tsx';

// The same panel at both sizes; the one widget whose content grows, so a long device list scrolls inside the cell.
export function DevicesWidget() {
  return (
    <div className="h-full overflow-y-auto">
      <DevicesPanel className="min-h-full" />
    </div>
  );
}
