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
    addSeries: useMutation(trpc.calendar.addSeries.mutationOptions(options)),
    updateSeries: useMutation(trpc.calendar.updateSeries.mutationOptions(options)),
    removeSeries: useMutation(trpc.calendar.removeSeries.mutationOptions(options)),
    restoreSeries: useMutation(trpc.calendar.restoreSeries.mutationOptions(options)),
    editOccurrence: useMutation(trpc.calendar.editOccurrence.mutationOptions(options)),
    restoreOccurrence: useMutation(trpc.calendar.restoreOccurrence.mutationOptions(options)),
    add: useMutation(trpc.calendar.add.mutationOptions(options)),
    update: useMutation(trpc.calendar.update.mutationOptions(options)),
    remove: useMutation(trpc.calendar.remove.mutationOptions(options)),
    restore: useMutation(trpc.calendar.restore.mutationOptions(options)),
  };
}
