import { moduleUIs } from '../lib/modules.ts';
import type { LinkProps } from '@tanstack/react-router';
import {
  BookOpenIcon,
  CpuIcon,
  SquaresFourIcon,
  MusicNotesIcon,
  DeviceMobileIcon,
  type Icon,
} from '@phosphor-icons/react';
import { m } from '../paraglide/messages.js';
type Zone = {
  params?: { module: string };
  id: string;
  path: NonNullable<LinkProps['to']>;
  icon: Icon;
  label: () => string;
};
export const zones: Zone[] = [
  { id: 'overview', path: '/desk', icon: SquaresFourIcon, label: m.zone_overview },
  { id: 'study', path: '/desk/studio', icon: BookOpenIcon, label: m.zone_study },
  { id: 'media', path: '/desk/media', icon: MusicNotesIcon, label: m.zone_media },
  { id: 'system', path: '/desk/system', icon: CpuIcon, label: m.zone_system },
  { id: 'devices', path: '/desk/devices', icon: DeviceMobileIcon, label: m.devices_title },
];

for (const module of moduleUIs)
  if (module.zone) zones.push({ ...module.zone, path: '/desk/$module', params: { module: module.zone.id } });
export function zonePath(zone: Zone) {
  return zone.params ? `/desk/${zone.params.module}` : zone.path;
}
