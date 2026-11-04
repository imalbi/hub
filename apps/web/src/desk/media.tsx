import { useMutation, useQuery } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { useConnectionLost, useTRPC, useTRPCClient } from '../trpc.ts';

function useMediaSource() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const media = useSubscription(trpc.media.onState.subscriptionOptions());
  const artKey = media.data?.artKey;
  const options = trpc.media.art.queryOptions();
  const artwork = useQuery({
    queryKey: [...options.queryKey, artKey],
    queryFn: async () => {
      const art = await client.media.art.query();
      // Only a matching cover earns infinite freshness; a transient miss or track race must be retryable.
      if (!art || art.key !== artKey) throw new Error('Artwork not ready');
      return art;
    },
    enabled: Boolean(artKey),
    staleTime: Infinity,
    retry: 2,
  });
  const playPause = useMutation(trpc.media.playPause.mutationOptions());
  const next = useMutation(trpc.media.next.mutationOptions());
  const previous = useMutation(trpc.media.previous.mutationOptions());
  const connectionLost = useConnectionLost();
  return {
    state: media.data,
    art: artwork.data?.key === artKey ? artwork.data : null,
    playing: media.data?.status === 'Playing',
    disabled: !media.data || connectionLost || playPause.isPending || next.isPending || previous.isPending,
    connectionLost,
    playPause,
    next,
    previous,
  };
}
const MediaContext = createContext<ReturnType<typeof useMediaSource> | null>(null);
export function MediaProvider({ children }: { children: ReactNode }) {
  const value = useMediaSource();
  return <MediaContext value={value}>{children}</MediaContext>;
}
export function useMedia() {
  const context = useContext(MediaContext);
  if (!context) throw new Error('MediaProvider is required');
  return context;
}
