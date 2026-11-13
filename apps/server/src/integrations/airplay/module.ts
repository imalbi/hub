import type { ModuleDeps } from '../../core/module.ts';
import { airplayConfigSchema, type AirPlayConfig } from './config.ts';
import { createAirPlayLive } from './live.ts';
import { createAirPlayRouter } from './router.ts';

export { airplayConfigSchema };

/** What a private module's `server.ts` calls with its validated config and the injected `run`. */
export function createConfiguredAirPlay({ config, run }: { config: AirPlayConfig; run: ModuleDeps['run'] }) {
  return { router: createAirPlayRouter(createAirPlayLive(run, config), config) };
}

/** What the web app's typed client infers procedures from: a type-only stand-in for the module's definition. */
export type AirPlayModuleDefinition = {
  name: 'airplay';
  create: (deps: ModuleDeps & { config: unknown }) => ReturnType<typeof createConfiguredAirPlay>;
};
