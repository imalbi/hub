import { z } from 'zod';
import { agentOrLoopbackProcedure, protectedProcedure, router } from '../../core/trpc.ts';
import {
  daysBetween,
  fitsKind,
  isDay,
  KIND_RULE,
  MAX_RANGE_DAYS,
  validateSeries,
  type CalendarStore,
} from './calendar.ts';

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
const range = z
  .object({ from: day, to: day })
  .refine((value) => value.from <= value.to, 'from is after to')
  .refine((value) => daysBetween(value.from, value.to) <= MAX_RANGE_DAYS, 'Range cannot exceed 400 days');

const seriesFields = z.object({
  title: z.string().trim().min(1).max(120),
  kind: z.enum(['event', 'shift']),
  person: z.string().trim().min(1).max(60).nullable(),
  days: z
    .array(z.object({ weekday: z.number().int().min(1).max(7), start: time.nullable(), end: time.nullable() }))
    .min(1)
    .max(7),
  fromDay: day,
  untilDay: day.nullable(),
});
const occurrence = z.object({ seriesId: id, day });

export function createCalendarRouter(store: CalendarStore) {
  // Reading is open to a paired phone; writing is for the PC and for agents, like the other modules' actions.
  return router({
    range: protectedProcedure.input(range).query(({ input }) => store.range(input.from, input.to)),
    addSeries: agentOrLoopbackProcedure
      .meta({
        label: 'Aggiungi serie',
        description: 'Add a weekly series of events or shifts with times for each weekday, instead of a single event',
      })
      .input(seriesFields)
      .mutation(({ input, ctx }) => {
        validateSeries(input);
        return store.addSeries(input, ctx.client.kind === 'agent' ? `agent:${ctx.client.name}` : 'desk');
      }),
    updateSeries: agentOrLoopbackProcedure
      .meta({
        label: 'Modifica serie',
        description: 'Change any fields of a weekly series, affecting its occurrences rather than one event',
      })
      .input(seriesFields.partial().extend({ id }))
      .mutation(({ input: { id: seriesId, ...input } }) => store.updateSeries(seriesId, input)),
    removeSeries: agentOrLoopbackProcedure
      .meta({
        label: 'Elimina serie',
        description: 'Remove a weekly series while retaining separately edited occurrences as events',
      })
      .input(z.object({ id }))
      .mutation(({ input }) => store.setSeriesRemoved(input.id, true)),
    restoreSeries: agentOrLoopbackProcedure
      .meta({ label: 'Ripristina serie', description: 'Restore a removed weekly series and its generated occurrences' })
      .input(z.object({ id }))
      .mutation(({ input }) => store.setSeriesRemoved(input.id, false)),
    editOccurrence: agentOrLoopbackProcedure
      .meta({
        label: 'Modifica ricorrenza',
        description:
          'Edit or remove one occurrence of a weekly series without changing the other days; null fields remove that occurrence',
      })
      .input(occurrence.extend({ fields: fields.nullable() }))
      .mutation(({ input }) => store.editOccurrence(input.seriesId, input.day, input.fields)),
    restoreOccurrence: agentOrLoopbackProcedure
      .meta({
        label: 'Ripristina ricorrenza',
        description: 'Restore the rule version of one occurrence of a weekly series, removing its exception',
      })
      .input(occurrence)
      .mutation(({ input }) => store.restoreOccurrence(input.seriesId, input.day)),
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
