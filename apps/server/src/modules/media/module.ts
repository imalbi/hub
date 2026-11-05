import { defineModule } from '../../core/module.ts';
import { createMediaRouter } from './router.ts';
import { createMediaLive } from './live.ts';
import { createMediaArt } from './art.ts';
export const mediaModule = defineModule({
  name: 'media',
  create({ run, fetch }) {
    return { router: createMediaRouter(createMediaLive(run), createMediaArt(run, { fetch })) };
  },
});
