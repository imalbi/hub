import { defineModule } from '../../core/module.ts';
import { protectedProcedure } from '../../core/trpc.ts';
export const healthModule = defineModule({
  name: 'health',
  create: () => ({ router: protectedProcedure.query(() => ({ ok: true, uptime: Math.round(process.uptime()) })) }),
});
