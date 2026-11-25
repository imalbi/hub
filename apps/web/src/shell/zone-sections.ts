import type { ModuleSection, ModuleUI, PageTab } from '../lib/module-ui.ts';

type ModuleZone = NonNullable<ModuleUI['zone']>;

/** A page's own tabs, then the sections modules aim at it, in module order. */
export function pageTabs(zone: string, own: readonly PageTab[], uis: readonly ModuleUI[]): PageTab[] {
  const sections = uis.flatMap((ui) => ui.sections ?? []).filter((section) => section.zone === zone);
  return [...own.filter((tab) => !tab.fallback || sections.length === 0), ...sections];
}

/** Sections aimed at a zone that does not exist: no page shows them. */
export function orphanSections(uis: readonly ModuleUI[], zoneIds: ReadonlySet<string>): ModuleSection[] {
  return uis.flatMap((ui) => ui.sections ?? []).filter((section) => !zoneIds.has(section.zone));
}

/** Module zones whose id, which is also their path, is not a built-in page's path: a static route would hide them. */
export function moduleZones(uis: readonly ModuleUI[], builtinPaths: ReadonlySet<string>): ModuleZone[] {
  return uis.flatMap(({ zone }) => (zone && !builtinPaths.has(zone.id) ? [zone] : []));
}
