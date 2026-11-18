import { createFileRoute } from '@tanstack/react-router';
import { useToken } from '../lib/auth.ts';
import { DeckPages } from '../shell/deck-pages.tsx';
import { MediaProvider } from '../modules/media/media-provider.tsx';
import { PairingScreen } from '../modules/devices/pairing-screen.tsx';
import { usePhaseChime } from '../modules/pomodoro/use-phase-chime.ts';
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
  usePhaseChime();

  return (
    <MediaProvider>
      <DeckPages />
    </MediaProvider>
  );
}
