import { createFileRoute } from '@tanstack/react-router';
import { zoneSearch } from '../lib/zone-search.ts';
import { JobsPage } from '../modules/jobs/jobs.tsx';
import { SystemTab } from '../modules/system/page.tsx';
import { m } from '../paraglide/messages.js';
import { ZonePage } from '../shell/zone-page.tsx';

export const Route = createFileRoute('/desk/system')({ validateSearch: zoneSearch, component: System });

const own = [
  { id: 'system', label: m.zone_system, component: SystemTab },
  { id: 'jobs', label: m.jobs_title, component: JobsPage, fill: true },
];

function System() {
  return <ZonePage zone="system" own={own} />;
}
