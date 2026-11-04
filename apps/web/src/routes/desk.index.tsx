import { createFileRoute } from '@tanstack/react-router';
import { AudioPanel } from '../desk/audio-panel.tsx';
import { MediaPanel } from '../desk/media-panel.tsx';
import { PomodoroPanel } from '../desk/pomodoro-panel.tsx';
import { StatusPanel } from '../desk/status-panel.tsx';
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
