import { defineModule } from '../../core/module.ts';
import { createPomodoroRouter } from './router.ts';
import { createPomodoro } from './live.ts';
import { configSchema } from './config.ts';
export const pomodoroModule = defineModule({
  name: 'pomodoro',
  coreDb: true,
  config: configSchema,
  create({ db, run, config, log, focusHistory }) {
    const live = createPomodoro(
      db,
      run,
      config,
      (err) => log.error({ err }, 'Pomodoro deadline failed'),
      (tag) => focusHistory.changed(tag),
    );
    return { router: createPomodoroRouter(live), close: () => live.close() };
  },
});
