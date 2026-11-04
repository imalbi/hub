import { createFileRoute } from '@tanstack/react-router';
import { MediaPanel } from '../modules/media/desk-panel.tsx';
import { WidgetBoard } from '../shell/widget-board.tsx';

export const Route = createFileRoute('/desk/media')({ component: Media });

// The player hero is the page itself, not a widget; the board below holds the zone's widgets.
function Media() {
  return (
    <>
      <MediaPanel className="col-span-12 mb-2xl" />
      <WidgetBoard zone="media" />
    </>
  );
}
