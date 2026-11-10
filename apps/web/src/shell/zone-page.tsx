import { notFound } from '@tanstack/react-router';
import { ZoneTabs } from '../components/zone-tabs.tsx';
import { useLiveModuleUIs } from '../lib/enabled-modules.ts';
import type { PageTab } from '../lib/module-ui.ts';
import { pageTabs } from './zone-sections.ts';

/** The frame of a zone page: its own tabs, then the sections modules aim at it, behind a bar when there are two or more. */
export function ZonePage({ zone, own }: { zone: string; own: PageTab[] }) {
  const tabs = pageTabs(zone, own, useLiveModuleUIs());
  // A zone made only of module sections has no page without them.
  if (tabs.length === 0) throw notFound();
  return (
    <div className="col-span-12 flex flex-col gap-lg">
      <ZoneTabs
        always={zone === 'messages'}
        tabs={tabs.map(({ id, label, component: Content }) => ({ id, label: label(), content: <Content /> }))}
      />
    </div>
  );
}
