import { TRPCError } from '@trpc/server';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import type { Run } from '../../core/exec.ts';
import { createLiveHub } from '../../core/live.ts';
import type { ModuleDeps } from '../../core/module.ts';
import { protectedProcedure, router } from '../../core/trpc.ts';
import { createHueBluez, HueError, type HueErrorCode, type HueTransport } from './bluez.ts';
import { setBrightnessInput, setPowerInput } from './contracts.ts';

/** `modules.hue` in the owner's config, and all of it optional: with one paired Hue light nothing is needed. */
export const hueConfigSchema = z.object({ address: z.string().min(1).optional() }).default({});
export type HueConfig = z.output<typeof hueConfigSchema>;

const trpcCodes = {
  unavailable: 'SERVICE_UNAVAILABLE',
  unsupported: 'PRECONDITION_FAILED',
  timeout: 'GATEWAY_TIMEOUT',
  failed: 'INTERNAL_SERVER_ERROR',
} as const satisfies Record<HueErrorCode, string>;

// Only the code goes back to the client: BlueZ's own messages can name the light.
function fail(error: unknown): never {
  const code = error instanceof HueError ? error.code : 'failed';
  throw new TRPCError({ code: trpcCodes[code], message: code });
}

/** The router and lifecycle for one light behind any transport: BlueZ or a fake. */
export function createHueInstance(transport: HueTransport) {
  const live = createLiveHub(() => Promise.resolve(transport.readState()), null);
  const stop = transport.subscribe(() => void live.notify());
  const act = async (command: Parameters<HueTransport['execute']>[0]) => {
    await transport.execute(command).catch(fail);
    void live.notify();
  };

  function createRouter() {
    return router({
      state: protectedProcedure.query(() => transport.readState()),
      // The transport refreshes from the light (and retries a lost one) only while somebody watches.
      onState: protectedProcedure.subscription(async function* ({ signal }) {
        const release = transport.watch();
        try {
          yield* live.subscribe(signal);
        } finally {
          release();
        }
      }),
      setPower: protectedProcedure
        .meta({ label: 'Imposta luce', description: 'Switch the Hue light on or off' })
        .input(setPowerInput)
        .mutation(({ input }) => act({ type: 'setPower', on: input.on })),
      setBrightness: protectedProcedure
        .meta({
          label: 'Regola luminosità',
          description: 'Set the Hue light brightness as a whole percentage from 1 to 100',
        })
        .input(setBrightnessInput)
        .mutation(({ input }) => act({ type: 'setBrightness', percent: input.percent })),
    });
  }

  return {
    router: createRouter(),
    close: async () => {
      stop();
      await transport.close();
    },
  };
}

/** What a private module's `server.ts` calls with its validated config and the injected `run`. */
export function createConfiguredHue({ config, log, run }: { config: HueConfig; log: FastifyBaseLogger; run: Run }) {
  return createHueInstance(createHueBluez({ run, address: config.address, onWarn: (message) => log.warn(message) }));
}

/** What the web app's typed client infers procedures from: a type-only stand-in for the module's definition. */
export type HueModuleDefinition = {
  name: 'hue';
  create: (deps: ModuleDeps & { config: unknown }) => ReturnType<typeof createHueInstance>;
};
