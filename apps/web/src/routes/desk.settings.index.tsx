import { createFileRoute } from '@tanstack/react-router';
import { m } from '../paraglide/messages.js';

export const Route = createFileRoute('/desk/settings/')({
  component: () => <p className="text-body text-muted-foreground">{m.settings_choose()}</p>,
});
