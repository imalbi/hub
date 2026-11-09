import { defineModule } from '../../core/module.ts';
import { router } from '../../core/trpc.ts';
import { configSchema } from './config.ts';
import { createMailLive } from './live.ts';
import { createMailRouter } from './router.ts';

export const mailModule = defineModule({
  name: 'mail',
  config: configSchema,
  create({ run, config }) {
    // Absent means off: no accounts to read, so no procedure answers and no poller starts.
    if (!config) return { router: router({}) };
    return {
      router: createMailRouter({ run, accounts: config.accounts, live: createMailLive(run, config.accounts) }),
    };
  },
});
