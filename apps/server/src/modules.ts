import { healthModule } from './modules/health/module.ts';
import { audioModule } from './modules/audio/module.ts';
import { mediaModule } from './modules/media/module.ts';
import { layoutModule } from './modules/layout/module.ts';
import { devicesModule } from './modules/devices/module.ts';
import { pairingModule } from './modules/devices/module.ts';
import { pomodoroModule } from './modules/pomodoro/module.ts';
import { systemModule } from './modules/system/module.ts';
import { themeModule } from './modules/theme/module.ts';
import { musicModule } from './modules/music/server.ts';

import { studyModule } from './modules/study/server.ts';
import { notesModule } from './modules/notes/module.ts';
import { calendarModule } from './modules/calendar/module.ts';

export const publicModules = [
  healthModule,
  audioModule,
  mediaModule,
  layoutModule,
  devicesModule,
  pairingModule,
  pomodoroModule,
  systemModule,
  themeModule,
  musicModule,
  studyModule,
  notesModule,
  calendarModule,
] as const;
