import { createFileRoute } from '@tanstack/react-router';
import { AudioPanel } from '../desk/audio-panel.tsx';
import { MediaPanel } from '../desk/media-panel.tsx';
export const Route = createFileRoute('/desk/media')({ component: Media });
function Media() {
  return (
    <>
      <MediaPanel className="col-span-8" />
      <AudioPanel className="col-span-4" />
    </>
  );
}
