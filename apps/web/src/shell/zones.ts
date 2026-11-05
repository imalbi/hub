import { moduleUIs } from '../lib/modules.ts';
import type { LinkProps } from '@tanstack/react-router';
import { BookOpen, Cpu, LayoutGrid, Music, Smartphone, type LucideIcon } from 'lucide-react';
import { m } from '../paraglide/messages.js';
type Zone = {
  params?: { module: string };
  id: string;
  path: NonNullable<LinkProps['to']>;
  icon: LucideIcon;
  label: () => string;
};
export const zones: Zone[] = [
  { id: 'overview', path: '/desk', icon: LayoutGrid, label: m.zone_overview },
  { id: 'study', path: '/desk/studio', icon: BookOpen, label: m.zone_study },
  { id: 'media', path: '/desk/media', icon: Music, label: m.zone_media },
  { id: 'system', path: '/desk/system', icon: Cpu, label: m.zone_system },
  { id: 'devices', path: '/desk/devices', icon: Smartphone, label: m.devices_title },
];

for (const module of moduleUIs)
  if (module.zone) zones.push({ ...module.zone, path: '/desk/$module', params: { module: module.zone.id } });
export function zonePath(zone: Zone) {
  return zone.params ? `/desk/${zone.params.module}` : zone.path;
}
