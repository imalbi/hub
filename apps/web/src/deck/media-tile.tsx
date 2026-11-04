import { useMutation } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { Pause, Play } from 'lucide-react';
import { Tile } from '../components/tile.tsx';
import { m } from '../paraglide/messages.js';
import { useConnectionLost, useTRPC } from '../trpc.ts';

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

  return (
    <Tile
      // The icon is the action a tap performs, like a transport control.
      icon={media.data?.status === 'Playing' ? Pause : Play}
      label={m.tile_media()}
      state={stateText()}
      pending={playPause.isPending}
      error={playPause.isError}
      stale={connectionLost}
      onPress={() => playPause.mutate()}
    />
  );
}
