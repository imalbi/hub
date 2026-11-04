import { createFileRoute } from '@tanstack/react-router';
import { WidgetBoard } from '../shell/widget-board.tsx';

export const Route = createFileRoute('/desk/')({ component: Overview });

function Overview() {
  return <WidgetBoard zone="overview" />;
}
