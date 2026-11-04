import { m } from '../../paraglide/messages.js';
import { Cover, Transport } from './controls.tsx';
import { useMedia } from './media-provider.tsx';

/** The desk's player pill at phone size, on every deck page while a player has a track (playing or paused). */
export function DeckPlayer() {
  const media = useMedia();
  if (!media.state?.title || media.state.status === 'Stopped') return null;
  return (
    <section
      aria-label={m.deck_player()}
      className="desk-glass flex min-w-0 items-center gap-sm rounded-full border py-xs pr-xs pl-xs"
    >
      <Cover />
      <div className="min-w-0 flex-1">
        <p className="truncate text-label">{media.state.title}</p>
        <p className="truncate text-caption text-muted-foreground">{media.state.artist}</p>
      </div>
      <Transport />
    </section>
  );
}
