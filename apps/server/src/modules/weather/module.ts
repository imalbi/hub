import { z } from 'zod';
import { defineModule } from '../../core/module.ts';
import { loopbackProcedure, protectedProcedure, router } from '../../core/trpc.ts';
import { createWeather, locationSchema, searchLocations } from './weather.ts';

export const weatherModule = defineModule({
  name: 'weather',
  config: locationSchema.optional(),
  create({ config, fetch }) {
    const weather = createWeather(fetch, config);
    return {
      router: router({
        state: protectedProcedure.query(() => weather.read()),
        search: loopbackProcedure
          .input(z.string().trim().min(2).max(100))
          .query(({ input }) => searchLocations(fetch, input)),
      }),
      close: weather.close,
    };
  },
});
