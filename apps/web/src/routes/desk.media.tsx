import { createFileRoute } from '@tanstack/react-router';
import { zoneSearch } from '../lib/zone-search.ts';
import { useIsOn } from '../lib/enabled-modules.ts';
import { AudioButton } from '../modules/media/audio-button.tsx';
import { PlayerBar } from '../modules/media/player-bar.tsx';
import { MusicPage } from '../modules/music/page.tsx';
import { m } from '../paraglide/messages.js';
import { ZonePage } from '../shell/zone-page.tsx';

export const Route = createFileRoute('/desk/media')({ validateSearch: zoneSearch, component: Media });

function MediaTab() {
  // Without Musica the page is the player alone (playerctl) with its output switch.
  return useIsOn()('music') ? (
    <MusicPage />
  ) : (
    <div className="flex min-h-0 flex-1 flex-col justify-end">
      <PlayerBar actions={<AudioButton />} />
    </div>
  );
}

const own = [{ id: 'media', label: m.zone_media, component: MediaTab, fill: true }];

function Media() {
  return <ZonePage zone="media" own={own} />;
}
