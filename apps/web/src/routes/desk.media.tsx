import { createFileRoute } from '@tanstack/react-router';
import { PageGrid } from '../components/page-grid.tsx';
import { zoneSearch } from '../lib/zone-search.ts';
import { AudioPanel } from '../modules/audio/desk-panel.tsx';
import { MediaPanel } from '../modules/media/desk-panel.tsx';
import { m } from '../paraglide/messages.js';
import { ZonePage } from '../shell/zone-page.tsx';

export const Route = createFileRoute('/desk/media')({ validateSearch: zoneSearch, component: Media });

// The player hero is the page itself; its floating player hangs below the panel, hence the margin before the outputs.
function MediaTab() {
  return (
    <PageGrid>
      <MediaPanel className="col-span-12 mb-2xl" />
      <AudioPanel controls className="col-span-6" />
    </PageGrid>
  );
}

const own = [{ id: 'media', label: m.zone_media, component: MediaTab }];

function Media() {
  return <ZonePage zone="media" own={own} />;
}
