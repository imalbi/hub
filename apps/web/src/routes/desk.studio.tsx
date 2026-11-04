import { createFileRoute } from '@tanstack/react-router';
import { WidgetBoard } from '../shell/widget-board.tsx';

export const Route = createFileRoute('/desk/studio')({ component: Studio });

function Studio() {
  return <WidgetBoard zone="study" />;
}
