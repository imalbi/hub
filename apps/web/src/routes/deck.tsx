import { createFileRoute } from '@tanstack/react-router';
import { AudioOutputTile } from '../deck/audio-output-tile.tsx';
import { MediaTile } from '../deck/media-tile.tsx';
import { m } from '../paraglide/messages.js';
import { ServerStatus } from '../server-status.tsx';
import { useConnectionLost } from '../trpc.ts';
import { useLayout } from '../use-layout.ts';

export const Route = createFileRoute('/deck')({ component: Deck });

function Deck() {
  useLayout('deck');
  const connectionLost = useConnectionLost();

  return (
    <main className="flex h-dvh flex-col gap-xl overflow-hidden p-md">
      <header className="flex items-center justify-between gap-xs">
        <p className="text-label">{m.deck_title()}</p>
        <p className="text-caption text-muted-foreground">{connectionLost ? m.connection_lost() : <ServerStatus />}</p>
      </header>
      <div className="grid grid-cols-3 gap-md">
        <AudioOutputTile />
        <MediaTile />
      </div>
    </main>
  );
}
