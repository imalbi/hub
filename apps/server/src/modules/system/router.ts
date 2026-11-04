import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router, type Context } from '../../core/trpc.ts';

async function command(ctx: Context, bin: string, args: string[]) {
  const { code } = await ctx.run(bin, args);
  if (code !== 0) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `${bin} failed` });
}

const confirmed = z.object({ confirmed: z.literal(true) });

export const systemRouter = router({
  power: protectedProcedure.query(({ ctx }) => ctx.live.power.read()),
  onPower: protectedProcedure.subscription(({ ctx, signal }) => ctx.live.power.subscribe(signal)),

  // Caelestia's own lock screen, the one Super+L opens. `loginctl lock-session` needs a login session, which a user
  // service does not have.
  lock: protectedProcedure
    .meta({ description: 'Lock the screen of the PC' })
    .mutation(({ ctx }) => command(ctx, 'caelestia', ['shell', 'lock', 'lock'])),
  suspend: protectedProcedure
    .meta({ description: 'Suspend the PC to RAM', danger: true })
    .input(confirmed)
    .mutation(({ ctx }) => command(ctx, 'systemctl', ['suspend'])),
  reboot: protectedProcedure
    .meta({ description: 'Reboot the PC', danger: true })
    .input(confirmed)
    .mutation(({ ctx }) => command(ctx, 'systemctl', ['reboot'])),
  powerOff: protectedProcedure
    .meta({ description: 'Shut down and power off the PC', danger: true })
    .input(confirmed)
    .mutation(({ ctx }) => command(ctx, 'systemctl', ['poweroff'])),
  toggleWorkspace: protectedProcedure
    .meta({
      description: 'Show or hide a special workspace on the PC: communication (chat apps) or music (the music player)',
    })
    .input(z.object({ name: z.enum(['communication', 'music']) }))
    .mutation(({ ctx, input }) => command(ctx, 'caelestia', ['toggle', input.name])),
});
