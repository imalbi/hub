import { healthModule } from './modules/health/module.ts';
import { audioModule } from './modules/audio/module.ts';
import { mediaModule } from './modules/media/module.ts';
import { newsModule } from './modules/news/module.ts';
import { layoutModule } from './modules/layout/module.ts';
import { devicesModule } from './modules/devices/module.ts';
import { pairingModule } from './modules/devices/module.ts';
import { pomodoroModule } from './modules/pomodoro/module.ts';
import { systemModule } from './modules/system/module.ts';
import { themeModule } from './modules/theme/module.ts';
import { airplayModule } from './modules/airplay/module.ts';
import { musicModule } from './modules/music/server.ts';
import { mailModule } from './modules/mail/module.ts';

import { weatherModule } from './modules/weather/module.ts';

export const publicModules = [
  healthModule,
  audioModule,
  mediaModule,
  newsModule,
  layoutModule,
  devicesModule,
  pairingModule,
  pomodoroModule,
  systemModule,
  themeModule,
  airplayModule,
  mailModule,
  musicModule,
  weatherModule,
] as const;
