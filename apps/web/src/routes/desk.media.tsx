import { createFileRoute } from '@tanstack/react-router';
import { AudioPanel } from '../modules/audio/desk-panel.tsx';
import { MediaPanel } from '../modules/media/desk-panel.tsx';
export const Route = createFileRoute('/desk/media')({ component: Media });
function Media() {
  return (
    <>
      <MediaPanel className="col-span-8" />
      <AudioPanel className="col-span-4" />
    </>
  );
}
