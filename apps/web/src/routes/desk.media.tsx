import { createFileRoute } from '@tanstack/react-router';
import { WidgetBoard } from '../shell/widget-board.tsx';

export const Route = createFileRoute('/desk/media')({ component: Media });

function Media() {
  return <WidgetBoard zone="media" />;
}
