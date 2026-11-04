import { createFileRoute } from '@tanstack/react-router';
import { useToken } from '../lib/auth.ts';
import { DeckFrame } from '../shell/deck-frame.tsx';
import { DeckPages } from '../shell/deck-pages.tsx';
import { DeckPlayer } from '../modules/media/deck-player.tsx';
import { MediaProvider } from '../modules/media/media-provider.tsx';
import { PairingScreen } from '../modules/devices/pairing-screen.tsx';
import { usePhaseChime } from '../modules/pomodoro/use-phase-chime.ts';
import { m } from '../paraglide/messages.js';
import { ServerStatus } from '../modules/system/server-status.tsx';
import { useConnectionLost } from '../lib/trpc.ts';
import { useLayout } from '../shell/use-layout.ts';
import { ThemeProvider } from '../theme/theme.tsx';

export const Route = createFileRoute('/deck')({ component: Deck });

function Deck() {
  useLayout('deck');
  // Without a token the deck shows nothing but the pairing screen, whatever the server would let through.
  const token = useToken();
  // Built-in themes work unpaired; custom and Caelestia ones need the server, so only after pairing.
  return <ThemeProvider remote={Boolean(token)}>{token ? <PairedDeck /> : <PairingScreen />}</ThemeProvider>;
}

function PairedDeck() {
  const connectionLost = useConnectionLost();
  usePhaseChime();

  return (
    <DeckFrame status={connectionLost ? m.connection_lost() : <ServerStatus />}>
      <MediaProvider>
        <DeckPages />
        <DeckPlayer />
      </MediaProvider>
    </DeckFrame>
  );
}
