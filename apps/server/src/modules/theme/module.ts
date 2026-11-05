import { defineModule } from '../../core/module.ts';
import { createThemeRouter } from './router.ts';
import { createCaelestiaTheme } from './caelestia.ts';
import { createCustomThemesLive } from './router.ts';
import { configSchema } from './config.ts';
export const themeModule = defineModule({
  name: 'theme',
  coreDb: true,
  config: configSchema,
  create({ db, config }) {
    return { router: createThemeRouter(createCaelestiaTheme(config.caelestiaScheme), createCustomThemesLive(db)) };
  },
});
