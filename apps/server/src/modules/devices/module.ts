import { defineModule } from '../../core/module.ts';
import { createPairingCodes } from './codes.ts';
import { createPairingRouter } from './pairing-router.ts';
import { devicesRouter } from './router.ts';
export const devicesModule = defineModule({ name: 'devices', create: () => ({ router: devicesRouter }) });
export const pairingModule = defineModule({
  name: 'pairing',
  create: () => ({ router: createPairingRouter(createPairingCodes()) }),
});
