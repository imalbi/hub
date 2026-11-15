import { z } from 'zod';
import { agentOrLoopbackProcedure, protectedProcedure, router } from '../../core/trpc.ts';
import { fitsKind, isDay, KIND_RULE, type CalendarStore } from './calendar.ts';

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isDay, 'Not a calendar day');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const id = z.string().min(1).max(64);
// `kind` has no default here: an update that leaves it out keeps the stored kind (and person), so the rules of a kind
// are checked on the merged row in the store; an add without it is an event.
const fields = z.object({
  title: z.string().trim().min(1).max(120),
  day,
  start: time.nullish(),
  end: time.nullish(),
  kind: z
    .enum(['event', 'shift'])
    .optional()
    .describe(
      'event (default) or shift, a work shift of a person: it needs a person, a start and an end, and an end not after the start means the next day; an update without it keeps the kind',
    ),
  person: z.string().trim().min(1).max(60).nullish().describe('Who works the shift, 1 to 60 characters; shifts only'),
});
const range = z.object({ from: day, to: day }).refine((value) => value.from <= value.to, 'from is after to');

export function createCalendarRouter(store: CalendarStore) {
  // Reading is open to a paired phone; writing is for the PC and for agents, like the other modules' actions.
  return router({
    range: protectedProcedure.input(range).query(({ input }) => store.range(input.from, input.to)),
    add: agentOrLoopbackProcedure
      .meta({
        label: 'Aggiungi evento',
        description:
          'Add an event to the calendar: a title (1 to 120 characters), a local day YYYY-MM-DD and optionally a start and an end time HH:MM (the end needs a start and comes after it). Use it for an appointment the owner mentions.',
      })
      .input(fields.refine((value) => fitsKind({ ...value, kind: value.kind ?? 'event' }), KIND_RULE))
      .mutation(({ input, ctx }) =>
        store.add(input, ctx.client.kind === 'agent' ? `agent:${ctx.client.name}` : 'desk'),
      ),
    update: agentOrLoopbackProcedure
      .meta({
        label: 'Modifica evento',
        description: 'Change the title, day, times, kind and person of an event or shift by its id',
      })
      .input(fields.and(z.object({ id })))
      .mutation(({ input }) => store.update(input.id, input)),
    remove: agentOrLoopbackProcedure
      .meta({ label: 'Elimina evento', description: 'Remove an event by its id; restore brings it back' })
      .input(z.object({ id }))
      .mutation(({ input }) => store.setRemoved(input.id, true)),
    restore: agentOrLoopbackProcedure
      .meta({ label: 'Ripristina evento', description: 'Bring back an event that was removed, by its id' })
      .input(z.object({ id }))
      .mutation(({ input }) => store.setRemoved(input.id, false)),
  });
}
