import { useMutation } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { PauseIcon, PlayIcon } from '@phosphor-icons/react';
import { Tile } from '../../components/tile.tsx';
import { m } from '../../paraglide/messages.js';
import { useConnectionLost, useTRPC } from '../../lib/trpc.ts';

export function MediaTile() {
  const trpc = useTRPC();
  const connectionLost = useConnectionLost();
  const media = useSubscription(trpc.media.onState.subscriptionOptions());
  // The server pushes the new state after the action, so there is nothing to invalidate here.
  const playPause = useMutation(trpc.media.playPause.mutationOptions());

  function stateText() {
    if (media.data === undefined) return connectionLost ? m.tile_unavailable() : m.tile_loading();
    if (media.data === null || !media.data.title) return m.media_nothing_playing();
    return media.data.artist ? m.media_track(media.data) : media.data.title;
  }

  // The icon alone says whether it plays, so the accessible name spells it out.
  function statusText() {
    if (!media.data?.title) return undefined;
    return { Playing: m.media_playing, Paused: m.media_paused, Stopped: m.media_stopped }[media.data.status]();
  }

  return (
    <Tile
      // The icon is the action a tap performs, like a transport control.
      icon={media.data?.status === 'Playing' ? PauseIcon : PlayIcon}
      iconName={media.data?.status === 'Playing' ? 'pause' : 'play'}
      label={m.tile_media()}
      state={stateText()}
      status={statusText()}
      pending={playPause.isPending}
      error={playPause.isError}
      stale={connectionLost}
      onPress={() => playPause.mutate()}
    />
  );
}
