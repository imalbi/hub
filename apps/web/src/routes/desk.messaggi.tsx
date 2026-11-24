import { createFileRoute } from '@tanstack/react-router';
import { zoneSearch } from '../lib/zone-search.ts';
import { ZonePage } from '../shell/zone-page.tsx';

export const Route = createFileRoute('/desk/messaggi')({ validateSearch: zoneSearch.loose(), component: Messages });

// Same shape as Lavoro: the channels (mail, later chat apps) arrive as module sections.
function Messages() {
  return <ZonePage zone="messages" own={[]} />;
}
