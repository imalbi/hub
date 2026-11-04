import { createFileRoute } from '@tanstack/react-router';
import { useToken } from '../auth.ts';
import { AudioOutputTile } from '../deck/audio-output-tile.tsx';
import { DeckFrame } from '../deck/deck-frame.tsx';
import { MediaTile } from '../deck/media-tile.tsx';
import { PairingScreen } from '../deck/pairing-screen.tsx';
import { m } from '../paraglide/messages.js';
import { ServerStatus } from '../server-status.tsx';
import { useConnectionLost } from '../trpc.ts';
import { useLayout } from '../use-layout.ts';

export const Route = createFileRoute('/deck')({ component: Deck });

function Deck() {
  useLayout('deck');
  // Without a token the deck shows nothing but the pairing screen, whatever the server would let through.
  return useToken() ? <PairedDeck /> : <PairingScreen />;
}

function PairedDeck() {
  const connectionLost = useConnectionLost();

  return (
    <DeckFrame status={connectionLost ? m.connection_lost() : <ServerStatus />}>
      <div className="grid grid-cols-3 gap-md">
        <AudioOutputTile />
        <MediaTile />
      </div>
    </DeckFrame>
  );
}
