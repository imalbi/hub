import { defineModule } from '../../core/module.ts';
import { configSchema } from './config.ts';
import { createAirPlayLive } from './live.ts';
import { createAirPlayRouter } from './router.ts';

export const airplayModule = defineModule({
  name: 'airplay',
  config: configSchema,
  create({ run, config }) {
    const live = createAirPlayLive(run, config);
    return { router: createAirPlayRouter(live, config) };
  },
});
