import { z } from 'zod';
import { protectedProcedure, router } from '../../core/trpc.ts';
import { isDay, type NotesStore } from './notes.ts';

const text = z.string().trim().min(1).max(280);
const forDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isDay, 'Not a calendar day');
const id = z.string().min(1).max(64);
// A record id is the module's own key: Lavoro's is `company|title`, often past 64 characters.
const ref = z.object({ source: z.string().trim().min(1).max(80), id: z.string().trim().min(1).max(300) });
const about = ref.extend({ title: z.string().trim().min(1).max(200) });

export function createNotesRouter(store: NotesStore) {
  return router({
    open: protectedProcedure.query(() => store.open()),
    about: protectedProcedure.input(ref).query(({ input }) => store.about(input)),
    onOpen: protectedProcedure.subscription(({ signal }) => store.subscribe(signal)),
    add: protectedProcedure
      .meta({
        label: 'Aggiungi post-it',
        description:
          'Add a short note (1 to 280 characters) for a local calendar day, YYYY-MM-DD, today when omitted. Oggi shows it on that day and the days after, until it is removed. Use it to leave the owner a reminder for tomorrow.',
      })
      .input(z.object({ text, forDay: forDay.optional(), about: about.optional() }))
      .mutation(({ input, ctx }) =>
        store.add(input, ctx.client.kind === 'agent' ? `agent:${ctx.client.name}` : 'desk'),
      ),
    edit: protectedProcedure
      .meta({
        label: 'Modifica post-it',
        description: 'Change the text, and optionally the day (YYYY-MM-DD), of an open note by its id',
      })
      .input(z.object({ id, text, forDay: forDay.optional(), about: about.nullable().optional() }))
      .mutation(({ input }) => store.edit(input)),
    remove: protectedProcedure
      .meta({ label: 'Stacca post-it', description: 'Remove a note by its id; restore brings it back' })
      .input(z.object({ id }))
      .mutation(({ input }) => store.setRemoved(input.id, true)),
    restore: protectedProcedure
      .meta({ label: 'Ripristina post-it', description: 'Bring back a note that was removed, by its id' })
      .input(z.object({ id }))
      .mutation(({ input }) => store.setRemoved(input.id, false)),
  });
}
