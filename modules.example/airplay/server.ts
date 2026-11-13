import { defineModule } from '../../apps/server/src/core/module.ts';
import { createConfiguredAirPlay } from '../../apps/server/src/integrations/airplay/module.ts';

// A showcase receiver driven by the fake desktop's `airplay` command. The real module is a private
// wiring of the same `createConfiguredAirPlay` with the owner's `modules.airplay.command`.
export default defineModule({
  name: 'airplay',
  create: ({ run }) => createConfiguredAirPlay({ config: { command: 'airplay' }, run }),
});
