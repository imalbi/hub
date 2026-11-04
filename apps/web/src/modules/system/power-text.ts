import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@hub/server';
import { m } from '../../paraglide/messages.js';

type PowerState = inferRouterOutputs<AppRouter>['system']['power'];

const watts = new Intl.NumberFormat('it', { maximumFractionDigits: 0 });
const kwh = new Intl.NumberFormat('it', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The figure and the line under it, shared by the desk widget and the deck tile. */
export function powerText(state: PowerState | undefined) {
  if (!state) return { figure: null, today: state === null ? m.power_off() : m.tile_loading() };
  return {
    figure: state.watts === null ? null : m.power_watts({ watts: watts.format(state.watts) }),
    today: m.power_today({ kwh: kwh.format(state.todayKwh) }),
  };
}
