import { defineModule } from '../../core/module.ts';
import { createNewsRouter } from './router.ts';
import { createNewsLive } from './page.ts';
import { configSchema } from './config.ts';
export const newsModule = defineModule({
  name: 'news',
  config: configSchema,
  create({ config }) {
    return { router: createNewsRouter(createNewsLive(config), config) };
  },
});
