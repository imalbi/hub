import { createFileRoute } from '@tanstack/react-router';
import { WidgetBoard } from '../shell/widget-board.tsx';
import { PageSurface } from '../shell/page-surface.tsx';
import { StatusLine } from '../shell/status-line.tsx';

export const Route = createFileRoute('/desk/')({ component: Overview });

function Overview() {
  return (
    <div data-fill className="col-span-12 flex h-full min-h-0 flex-col">
      {/* Only Panoramica: on the other pages the status line said nothing the owner used (2026-11-17). */}
      <PageSurface statusLine={<StatusLine />}>
        <WidgetBoard />
      </PageSurface>
    </div>
  );
}
