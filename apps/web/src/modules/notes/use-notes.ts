import { useMutation } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useTRPC } from '../../lib/trpc.ts';
import { showUndo } from './store.ts';
import type { Note } from './days.ts';

/** The open post-its, live: every page that shows them stays in step without a refetch. */
export function useNotes() {
  const trpc = useTRPC();
  return useSubscription(trpc.notes.onOpen.subscriptionOptions());
}

export function useNoteActions() {
  const trpc = useTRPC();
  const remove = useMutation(trpc.notes.remove.mutationOptions());
  const restore = useMutation(trpc.notes.restore.mutationOptions());
  const edit = useMutation(trpc.notes.edit.mutationOptions());
  return {
    edit: (note: Note, text: string) => edit.mutateAsync({ id: note.id, text }),
    remove: async (note: Note) => {
      await remove.mutateAsync({ id: note.id });
      showUndo({ id: note.id, text: note.text });
    },
    restore: async (id: string) => {
      await restore.mutateAsync({ id });
      showUndo(null);
    },
  };
}
