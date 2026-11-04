import { createFileRoute } from '@tanstack/react-router';
import { WidgetBoard } from '../shell/widget-board.tsx';

export const Route = createFileRoute('/desk/devices')({ component: Devices });

function Devices() {
  return <WidgetBoard zone="devices" />;
}
