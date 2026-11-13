import { createFileRoute } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { RegistryButton } from '../components/registry-button.tsx';
import { Panel } from '../components/panel.tsx';
import { zoneSearch } from '../lib/zone-search.ts';
import { useIsOn } from '../lib/enabled-modules.ts';
import { useTRPC } from '../lib/trpc.ts';
import { MediaPanel } from '../modules/media/desk-panel.tsx';
import { MusicSearch } from '../modules/music/search.tsx';
import { m } from '../paraglide/messages.js';
import { ZonePage } from '../shell/zone-page.tsx';

export const Route = createFileRoute('/desk/media')({ validateSearch: zoneSearch, component: Media });

function MediaTab() {
  const trpc = useTRPC();
  const isOn = useIsOn();
  const output = useMutation(trpc.audio.cycleOutput.mutationOptions());
  const outputButton = <RegistryButton secondary label={m.music_output()} action={() => output.mutateAsync()} />;
  return (
    <div className="flex flex-col gap-md">
      <MediaPanel className="mb-2xl" />
      {isOn('music') ? (
        <Panel title={m.music_search()} className="h-media-cover" action={outputButton}>
          <MusicSearch />
        </Panel>
      ) : (
        <div className="flex justify-end">{outputButton}</div>
      )}
    </div>
  );
}

const own = [{ id: 'media', label: m.zone_media, component: MediaTab }];

function Media() {
  return <ZonePage zone="media" own={own} />;
}
