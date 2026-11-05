import { defineModule } from '../../core/module.ts';
import { createLayoutRouter, builtinZones } from './router.ts';

export const layoutModule = defineModule({
  name: 'layout',
  zones: builtinZones,
  create({ zones }) {
    return { router: createLayoutRouter(zones) };
  },
});
