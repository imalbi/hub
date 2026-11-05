import type { PairingCodes } from './codes.ts';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { hashToken, newToken } from '../../core/auth.ts';
import { devices } from '../../db/schema.ts';
import { loopbackProcedure, publicProcedure, router } from '../../core/trpc.ts';

export function createPairingRouter(pairing: PairingCodes) {
  return router({
    createCode: loopbackProcedure
      .meta({
        label: 'Genera codice di abbinamento',
        description: 'Create a one-time six-digit code, valid for two minutes, that pairs one new device',
      })
      .mutation(() => pairing.create()),

    redeem: publicProcedure
      .meta({
        label: 'Abbina dispositivo',
        description: 'Exchange a valid pairing code for the token of a new paired device',
      })
      .input(z.object({ code: z.string().regex(/^\d{6}$/), deviceName: z.string().trim().min(1).max(40) }))
      .mutation(async ({ ctx, input }) => {
        const result = pairing.redeem(ctx.remoteAddress, input.code);
        if (result === 'limited')
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many wrong codes, try again in a minute' });
        if (result === 'wrong') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid or expired code' });

        const token = newToken();
        const now = new Date();
        await ctx.db
          .insert(devices)
          .values({ name: input.deviceName, tokenHash: hashToken(token), createdAt: now, lastSeenAt: now });
        // The only time the token exists in the clear: the database keeps its hash.
        return { token };
      }),
  });
}
