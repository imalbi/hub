import { defineModule } from '../../core/module.ts';
import { createSystemRouter } from './router.ts';
import { createMonitorLive } from './monitor.ts';
import { createPowerLive } from './power.ts';
import { configSchema } from './config.ts';
export const systemModule = defineModule({
  name: 'system',
  config: configSchema,
  create({ config, run }) {
    const monitors = { entries: config.monitors, live: createMonitorLive(run, config.monitors) };
    return { router: createSystemRouter(createPowerLive(config.powerstatDir), monitors) };
  },
});
