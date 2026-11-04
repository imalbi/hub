import { createFileRoute } from '@tanstack/react-router';
import { PomodoroPanel } from '../modules/pomodoro/desk-panel.tsx';
export const Route = createFileRoute('/desk/studio')({ component: Studio });
function Studio() {
  return <PomodoroPanel className="col-span-8" />;
}
