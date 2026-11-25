import type { MonitorConfig } from './config.ts';
import { readMonitors, type MonitorLive } from './monitor.ts';
import type { PowerLive } from './power.ts';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router, type Context } from '../../core/trpc.ts';

async function command(ctx: Context, bin: string, args: string[]) {
  const { code } = await ctx.run(bin, args);
  if (code !== 0) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `${bin} failed` });
}

const confirmed = z.object({ confirmed: z.literal(true) });

// A zod enum of the configured outputs refuses anything else (and shows the choices to agents); an empty list has no
// enum to build, so the toggle takes any string and answers 412 itself.
function monitorInput(entries: readonly MonitorConfig[]) {
  const [first, ...rest] = entries.map(({ output }) => output);
  return z.object({ output: first === undefined ? z.string() : z.enum([first, ...rest]) });
}

export function createSystemRouter(
  power: PowerLive,
  monitors: { entries: readonly MonitorConfig[]; live: MonitorLive },
) {
  return router({
    power: protectedProcedure.query(() => power.read()),
    onPower: protectedProcedure.subscription(({ signal }) => power.subscribe(signal)),

    monitors: protectedProcedure.query(({ ctx }) => readMonitors(ctx.run, monitors.entries)),
    onMonitors: protectedProcedure.subscription(({ signal }) => monitors.live.subscribe(signal)),
    monitor: router({
      setOrientation: protectedProcedure
        .meta({
          label: 'Orienta monitor',
          description: 'Turn on a configured extra monitor in horizontal or vertical orientation',
        })
        .input(z.object({ output: z.string(), orientation: z.enum(['horizontal', 'vertical']) }))
        .mutation(async ({ ctx, input }) => {
          const entry = monitors.entries.find(({ output }) => output === input.output);
          const target = input.orientation === 'horizontal' ? entry?.horizontalCommand : entry?.verticalCommand;
          if (!target)
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Monitor orientation is not configured' });
          await command(ctx, target, []);
          void monitors.live.notify();
        }),
      // The entry's own command flips the monitor: re-enabling needs its geometry, which stays in the owner's script.
      toggle: protectedProcedure
        .meta({
          label: 'Accendi o spegni monitor',
          description: 'Turn one of the configured extra monitors on or off, whichever it is not now',
        })
        .input(monitorInput(monitors.entries))
        .mutation(async ({ ctx, input }) => {
          const entry = monitors.entries.find(({ output }) => output === input.output);
          if (!entry) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No monitor is configured' });
          await command(ctx, entry.command, []);
          void monitors.live.notify();
        }),
    }),

    // Caelestia's own lock screen, the one Super+L opens. `loginctl lock-session` needs a login session, which a user
    // service does not have.
    lock: protectedProcedure
      .meta({ label: 'Blocca schermo', description: 'Lock the screen of the PC' })
      .mutation(({ ctx }) => command(ctx, 'caelestia', ['shell', 'lock', 'lock'])),
    suspend: protectedProcedure
      .meta({ label: 'Sospendi PC', description: 'Suspend the PC to RAM', danger: true })
      .input(confirmed)
      .mutation(({ ctx }) => command(ctx, 'systemctl', ['suspend'])),
    reboot: protectedProcedure
      .meta({ label: 'Riavvia PC', description: 'Reboot the PC', danger: true })
      .input(confirmed)
      .mutation(({ ctx }) => command(ctx, 'systemctl', ['reboot'])),
    powerOff: protectedProcedure
      .meta({ label: 'Spegni PC', description: 'Shut down and power off the PC', danger: true })
      .input(confirmed)
      .mutation(({ ctx }) => command(ctx, 'systemctl', ['poweroff'])),
    toggleWorkspace: protectedProcedure
      .meta({
        label: 'Apri spazio di lavoro',
        description:
          'Show or hide a special workspace on the PC: communication (chat apps), music (the music player), or hub (Hub dashboard)',
      })
      .input(z.object({ name: z.enum(['communication', 'music', 'hub']) }))
      .mutation(({ ctx, input }) => command(ctx, 'caelestia', ['toggle', input.name])),
  });
}
