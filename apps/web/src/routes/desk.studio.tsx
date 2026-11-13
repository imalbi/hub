import { createFileRoute } from '@tanstack/react-router';
import { PageGrid } from '../components/page-grid.tsx';
import { zoneSearch } from '../lib/zone-search.ts';
import { StudyToday } from '../modules/study/today.tsx';
import { m } from '../paraglide/messages.js';
import { ZonePage } from '../shell/zone-page.tsx';

export const Route = createFileRoute('/desk/studio')({ validateSearch: zoneSearch, component: Studio });

function StudioTab() {
  return (
    <PageGrid>
      <StudyToday />
    </PageGrid>
  );
}

const own = [{ id: 'study', label: m.zone_study, component: StudioTab }];

function Studio() {
  return <ZonePage zone="study" own={own} />;
}
