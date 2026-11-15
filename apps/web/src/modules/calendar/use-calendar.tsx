import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc.ts';

export type Range = { from: string; to: string };

export function useEvents(range: Range) {
  const trpc = useTRPC();
  return useQuery(trpc.calendar.range.queryOptions(range));
}

export function useEventActions() {
  const trpc = useTRPC();
  const cache = useQueryClient();
  // The prefix of every range query: a change on any day may sit in the month shown, in Oggi or in a neighbour.
  const refresh = () => cache.invalidateQueries({ queryKey: trpc.calendar.range.queryKey() });
  const options = { onSuccess: refresh };
  return {
    add: useMutation(trpc.calendar.add.mutationOptions(options)),
    update: useMutation(trpc.calendar.update.mutationOptions(options)),
    remove: useMutation(trpc.calendar.remove.mutationOptions(options)),
    restore: useMutation(trpc.calendar.restore.mutationOptions(options)),
  };
}
