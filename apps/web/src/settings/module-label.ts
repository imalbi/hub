import { moduleUIs } from '../lib/modules.ts';
import { m } from '../paraglide/messages.js';

const publicNames: Record<string, () => string> = {
  health: m.module_health,
  audio: m.module_audio,
  media: m.module_media,
  news: m.module_news,
  layout: m.module_layout,
  devices: m.module_devices,
  pairing: m.module_pairing,
  pomodoro: m.module_pomodoro,
  system: m.module_system,
  theme: m.module_theme,
  mail: m.module_mail,
  music: m.module_music,
  weather: m.weather_title,
  sites: m.sites_title,
  study: m.zone_study,
};

/** What the list calls a module: Italian copy for the public ones, the zone's own label for a private one, else its name. */
export function moduleLabel(name: string) {
  const known = publicNames[name];
  if (known) return known();
  const zone = moduleUIs.find((ui) => ui.name === name)?.zone;
  if (zone) return zone.label();
  return name.charAt(0).toUpperCase() + name.slice(1).replaceAll('-', ' ');
}
