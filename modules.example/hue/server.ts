import { defineModule } from '../../apps/server/src/core/module.ts';
import { createHueInstance } from '../../apps/server/src/integrations/hue/module.ts';
import { createFakeHue } from '../../apps/server/src/testing/fake-hue.ts';

// A showcase light that never touches Bluetooth. The real module is a private
// wiring of the same `createConfiguredHue` with the owner's config.
export default defineModule({
  name: 'hue',
  create: () => createHueInstance(createFakeHue().transport),
});
