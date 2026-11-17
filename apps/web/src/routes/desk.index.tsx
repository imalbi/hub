import { createFileRoute } from '@tanstack/react-router';
import { WidgetBoard } from '../shell/widget-board.tsx';
import { PageSurface } from '../shell/page-surface.tsx';

export const Route = createFileRoute('/desk/')({ component: Overview });

function Overview() {
  return (
    <div data-fill className="col-span-12 flex h-full min-h-0 flex-col">
      <PageSurface>
        <WidgetBoard />
      </PageSurface>
    </div>
  );
}
