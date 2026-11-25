import { EventEmitter, on } from 'node:events';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from './trpc.ts';
import type { createConfirmations } from './confirmations.ts';

const notices = z.array(
  z.object({ id: z.string(), name: z.string(), action: z.string(), input: z.unknown(), expiresAt: z.number() }),
);

export function createConfirmationsRouter(confirmations: ReturnType<typeof createConfirmations>) {
  const humanProcedure = protectedProcedure.use(({ ctx, next }) => {
    if (ctx.client.kind !== 'loopback' && ctx.client.kind !== 'device')
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Only a human client can confirm' });
    return next();
  });
  return router({
    status: protectedProcedure
      .meta({ label: 'Stato conferma', description: 'Read the status of a requested confirmation' })
      .input(z.object({ id: z.string().uuid() }))
      .query(({ ctx, input }) => {
        if (ctx.client.kind !== 'agent') throw new TRPCError({ code: 'FORBIDDEN' });
        return confirmations.status(input.id, ctx.client.agentId);
      }),
    onPending: humanProcedure.subscription(async function* ({ signal }) {
      const events = new EventEmitter();
      const changes = on(events, 'update', { signal });
      const unsubscribe = confirmations.subscribe((items) => events.emit('update', items));
      try {
        for await (const [items] of changes) yield notices.parse(items);
      } finally {
        unsubscribe();
      }
    }),
    confirm: humanProcedure
      .meta({ label: 'Conferma richiesta', description: 'Confirm a pending request on a human client' })
      .input(z.object({ id: z.string().uuid(), confirmed: z.literal(true) }))
      .mutation(async ({ ctx, input }) => {
        await confirmations.confirm(input.id, ctx.client);
        return { ok: true };
      }),
    deny: humanProcedure
      .meta({ label: 'Rifiuta richiesta', description: 'Deny a pending request on a human client' })
      .input(z.object({ id: z.string().uuid() }))
      .mutation(({ input }) => {
        confirmations.deny(input.id);
        return { ok: true };
      }),
  });
}
