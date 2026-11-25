import { createFileRoute } from '@tanstack/react-router';
import { zoneSearch } from '../lib/zone-search.ts';
import { AudioButton } from '../modules/media/audio-button.tsx';
import { PlayerBar } from '../modules/media/player-bar.tsx';
import { m } from '../paraglide/messages.js';
import { ZonePage } from '../shell/zone-page.tsx';

export const Route = createFileRoute('/desk/media')({ validateSearch: zoneSearch, component: Media });

function MediaTab() {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-end">
      <PlayerBar actions={<AudioButton />} />
    </div>
  );
}

const own = [{ id: 'media', label: m.zone_media, component: MediaTab, fill: true, float: true, fallback: true }];

function Media() {
  return <ZonePage zone="media" own={own} />;
}
