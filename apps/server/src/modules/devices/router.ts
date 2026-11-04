import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { devices } from '../../db/schema.ts';
import { loopbackProcedure, router } from '../../core/trpc.ts';

export const devicesRouter = router({
  list: loopbackProcedure.query(async ({ ctx }) =>
    (await ctx.db.select().from(devices).orderBy(devices.id)).map(({ id, name, createdAt, lastSeenAt }) => ({
      id,
      name,
      createdAt: createdAt.getTime(),
      lastSeenAt: lastSeenAt.getTime(),
    })),
  ),

  revoke: loopbackProcedure
    .meta({
      description: 'Revoke a paired device: its token stops working and its open connections are closed',
      danger: true,
    })
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const removed = await ctx.db.delete(devices).where(eq(devices.id, input.id)).returning({ id: devices.id });
      if (removed.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such device' });
      ctx.sockets.closeAll(input.id);
    }),
});
