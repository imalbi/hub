import { createFileRoute } from '@tanstack/react-router';
import { zoneSearch } from '../lib/zone-search.ts';
import { ZonePage } from '../shell/zone-page.tsx';

export const Route = createFileRoute('/desk/lavoro')({ validateSearch: zoneSearch, component: Work });

// No content of its own: only the sections modules add, and without them the page is not found.
function Work() {
  return <ZonePage zone="work" own={[]} />;
}
