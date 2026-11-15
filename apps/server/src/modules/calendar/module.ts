import { defineModule } from '../../core/module.ts';
import { createCalendar } from './calendar.ts';
import { createCalendarRouter } from './router.ts';

export const calendarModule = defineModule({
  name: 'calendar',
  coreDb: true,
  create({ db }) {
    return { router: createCalendarRouter(createCalendar(db)) };
  },
});
