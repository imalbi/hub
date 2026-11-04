import { createFileRoute } from '@tanstack/react-router';
import { useToken } from '../lib/auth.ts';
import { AudioOutputTile } from '../modules/audio/deck-tile.tsx';
import { DeckFrame } from '../shell/deck-frame.tsx';
import { MediaTile } from '../modules/media/deck-tile.tsx';
import { PairingScreen } from '../modules/devices/pairing-screen.tsx';
import { PomodoroTile } from '../modules/pomodoro/deck-tile.tsx';
import { m } from '../paraglide/messages.js';
import { ServerStatus } from '../modules/system/server-status.tsx';
import { useConnectionLost } from '../lib/trpc.ts';
import { useLayout } from '../shell/use-layout.ts';

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
        <PomodoroTile />
      </div>
    </DeckFrame>
  );
}
