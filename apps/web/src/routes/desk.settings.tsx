import { createFileRoute } from '@tanstack/react-router';
import { PageGrid } from '../components/page-grid.tsx';
import { zoneSearch } from '../lib/zone-search.ts';
import { m } from '../paraglide/messages.js';
import { ZonePage } from '../shell/zone-page.tsx';
import { ThemePanel } from '../theme/theme-panel.tsx';

export const Route = createFileRoute('/desk/settings')({ validateSearch: zoneSearch, component: Settings });

function AppearanceTab() {
  return (
    <PageGrid>
      <ThemePanel className="col-span-12" />
    </PageGrid>
  );
}

const own = [{ id: 'appearance', label: m.theme_title, component: AppearanceTab }];

function Settings() {
  return <ZonePage zone="settings" own={own} />;
}
