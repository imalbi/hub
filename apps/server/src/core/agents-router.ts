import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, gte, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { agentCalls, agents } from '../db/schema.ts';
import { hashToken, newToken } from './auth.ts';
import { loopbackProcedure, router } from './trpc.ts';

export const agentsRouter = router({
  // Calls over loopback MCP are stored with no agent id (core/mcp.ts): this is the "Su questo PC" row.
  localCalls: loopbackProcedure.query(({ ctx }) =>
    ctx.db.select().from(agentCalls).where(isNull(agentCalls.agentId)).orderBy(desc(agentCalls.id)).limit(20),
  ),
  // The local list stops at 20 rows, so the day's count is its own query (server-local midnight, the PC's day).
  localCallsToday: loopbackProcedure.query(async ({ ctx }) => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const [row] = await ctx.db
      .select({ value: count() })
      .from(agentCalls)
      .where(and(isNull(agentCalls.agentId), gte(agentCalls.createdAt, midnight)));
    return row?.value ?? 0;
  }),
  calls: loopbackProcedure
    .input(z.object({ id: z.number().int() }))
    .query(({ ctx, input }) =>
      ctx.db.select().from(agentCalls).where(eq(agentCalls.agentId, input.id)).orderBy(desc(agentCalls.id)).limit(20),
    ),
  list: loopbackProcedure.query(async ({ ctx }) =>
    (await ctx.db.select().from(agents).orderBy(agents.id)).map(({ id, name, createdAt }) => ({
      id,
      name,
      createdAt: createdAt.getTime(),
    })),
  ),
  create: loopbackProcedure
    .meta({ label: 'Crea agente', description: 'Create an agent token' })
    .input(z.object({ name: z.string().trim().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const token = newToken();
      const [agent] = await ctx.db
        .insert(agents)
        .values({ name: input.name, tokenHash: hashToken(token), createdAt: new Date() })
        .returning({ id: agents.id });
      return { id: agent.id, token };
    }),
  revoke: loopbackProcedure
    .meta({ label: 'Revoca agente', description: 'Revoke an agent token', danger: true })
    .input(z.object({ id: z.number().int(), confirmed: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const removed = await ctx.db.delete(agents).where(eq(agents.id, input.id)).returning({ id: agents.id });
      if (!removed.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such agent' });
      return { revoked: true };
    }),
});
