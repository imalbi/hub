import { defineModule } from '../../core/module.ts';
import { createAudioRouter } from './router.ts';
import { createAudioLive } from './live.ts';
import { configSchema } from './config.ts';
export const audioModule = defineModule({
  name: 'audio',
  config: configSchema,
  create({ run, config }) {
    const live = createAudioLive(run, { audio: config });
    return { router: createAudioRouter(live, config) };
  },
});
