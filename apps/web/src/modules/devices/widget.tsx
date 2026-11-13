import { DevicesBoard } from './desk-panel.tsx';

// The same panels as the page, stacked; the one widget whose content grows, so it scrolls inside the cell.
export function DevicesWidget() {
  return (
    <div className="flex h-full flex-col gap-lg overflow-y-auto">
      <DevicesBoard />
    </div>
  );
}
