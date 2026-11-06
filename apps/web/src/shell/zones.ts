import { moduleUIs } from '../lib/modules.ts';
import type { LinkProps } from '@tanstack/react-router';
import {
  BookOpenIcon,
  BriefcaseIcon,
  ChatsIcon,
  CpuIcon,
  GearIcon,
  SquaresFourIcon,
  MusicNotesIcon,
  DeviceMobileIcon,
  type Icon,
} from '@phosphor-icons/react';
import { m } from '../paraglide/messages.js';
import { moduleZones, orphanSections } from './zone-sections.ts';

type Zone = {
  params?: { module: string };
  id: string;
  path: NonNullable<LinkProps['to']>;
  icon: Icon;
  label: () => string;
};

const overview: Zone = { id: 'overview', path: '/desk', icon: SquaresFourIcon, label: m.zone_overview };
const pages: Zone[] = [
  { id: 'study', path: '/desk/studio', icon: BookOpenIcon, label: m.zone_study },
  { id: 'media', path: '/desk/media', icon: MusicNotesIcon, label: m.zone_media },
  { id: 'system', path: '/desk/system', icon: CpuIcon, label: m.zone_system },
  { id: 'devices', path: '/desk/devices', icon: DeviceMobileIcon, label: m.devices_title },
];
// Zones with no content of their own, made only of the sections modules add: with none, no rail entry and no page.
const sectionsOnly: Zone[] = [
  { id: 'work', path: '/desk/lavoro', icon: BriefcaseIcon, label: m.zone_work },
  { id: 'messages', path: '/desk/messaggi', icon: ChatsIcon, label: m.zone_messages },
];
const settings: Zone = { id: 'settings', path: '/desk/settings', icon: GearIcon, label: m.zone_settings };
const builtinPaths = new Set([...pages, ...sectionsOnly, settings].map((zone) => zone.path.replace('/desk/', '')));
for (const { zone } of moduleUIs)
  if (zone && builtinPaths.has(zone.id)) console.warn(`Zone "${zone.id}" skipped: it is the path of a built-in page`);
const declared: Zone[] = moduleZones(moduleUIs, builtinPaths).map((zone) => ({
  ...zone,
  path: '/desk/$module',
  params: { module: zone.id },
}));

const known = new Set([overview, ...pages, ...sectionsOnly, settings, ...declared].map((zone) => zone.id));
for (const section of orphanSections(moduleUIs, known))
  console.warn(`Section "${section.id}" skipped: there is no zone "${section.zone}"`);

const hasSections = (id: string) => moduleUIs.some((ui) => ui.sections?.some((section) => section.zone === id));

/** The rail, in order: Panoramica, the built-in pages, the zones that have sections, module zones, Impostazioni. */
export const zones: Zone[] = [
  overview,
  ...pages,
  ...sectionsOnly.filter((zone) => hasSections(zone.id)),
  ...declared,
  settings,
];

export function zonePath(zone: Zone) {
  return zone.params ? `/desk/${zone.params.module}` : zone.path;
}
