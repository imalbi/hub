import { useMutation } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { NewspaperIcon } from '@phosphor-icons/react';
import { Tile } from '../../components/tile.tsx';
import { useConnectionLost, useTRPC } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';

/** The digest's count as a badge; a tap opens the page on the PC (reading happens there). */
export function NewsTile() {
  const trpc = useTRPC();
  const news = useSubscription(trpc.news.onState.subscriptionOptions());
  const open = useMutation(trpc.news.open.mutationOptions());
  const connectionLost = useConnectionLost();
  const state = news.data;
  const count = state?.fresh ? state.items : 0;
  return (
    <Tile
      icon={NewspaperIcon}
      label={m.news_title()}
      state={
        state === undefined
          ? connectionLost
            ? m.tile_unavailable()
            : m.tile_loading()
          : state === null
            ? m.news_off()
            : m.news_open_on_pc()
      }
      status={state ? m.news_count({ count }) : undefined}
      badge={count > 0 ? count : undefined}
      pending={open.isPending}
      error={open.isError}
      stale={connectionLost}
      onPress={() => {
        if (state) open.mutate();
      }}
    />
  );
}
