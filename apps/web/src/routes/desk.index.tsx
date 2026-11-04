import { createFileRoute } from '@tanstack/react-router';
import { AudioPanel } from '../modules/audio/desk-panel.tsx';
import { MediaPanel } from '../modules/media/desk-panel.tsx';
import { PomodoroPanel } from '../modules/pomodoro/desk-panel.tsx';
import { StatusPanel } from '../modules/system/desk-panel.tsx';
export const Route = createFileRoute('/desk/')({ component: Overview });
function Overview() {
  return (
    <>
      <PomodoroPanel compact className="col-span-7" />
      <MediaPanel compact className="col-span-5" />
      <StatusPanel overview className="col-span-5" />
      <AudioPanel compact className="col-span-7" />
    </>
  );
}
