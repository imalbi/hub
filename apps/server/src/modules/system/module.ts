import { defineModule } from '../../core/module.ts';
import { createSystemRouter } from './router.ts';
import { createPowerLive } from './power.ts';
import { configSchema } from './config.ts';
export const systemModule = defineModule({
  name: 'system',
  config: configSchema,
  create({ config }) {
    return { router: createSystemRouter(createPowerLive(config.powerstatDir)) };
  },
});
