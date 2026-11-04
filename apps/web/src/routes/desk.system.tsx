import { createFileRoute } from '@tanstack/react-router';
import { WidgetBoard } from '../shell/widget-board.tsx';

export const Route = createFileRoute('/desk/system')({ component: System });

function System() {
  return <WidgetBoard zone="system" />;
}
