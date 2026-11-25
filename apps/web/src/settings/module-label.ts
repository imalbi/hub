import { moduleUIs } from '../lib/modules.ts';
import { m } from '../paraglide/messages.js';

const publicNames: Record<string, () => string> = {
  health: m.module_health,
  audio: m.module_audio,
  media: m.module_media,
  layout: m.module_layout,
  devices: m.module_devices,
  pairing: m.module_pairing,
  pomodoro: m.module_pomodoro,
  system: m.module_system,
  theme: m.module_theme,
  notes: m.notes_title,
};

/** What the list calls a module: Italian copy for the public ones, the zone's label or its own copy title for a private one, else its name. */
export function moduleLabel(name: string) {
  const known = publicNames[name];
  if (known) return known();
  const ui = moduleUIs.find((candidate) => candidate.name === name);
  if (ui?.zone) return ui.zone.label();
  // A module outside the tracked messages names itself in its own copy (AirPlay, Luci).
  if (ui?.copy['title']) return ui.copy['title'];
  return name.charAt(0).toUpperCase() + name.slice(1).replaceAll('-', ' ');
}
