import { createFileRoute } from '@tanstack/react-router';
import { m } from '../paraglide/messages.js';
import { DeskShell } from '../shell/desk.tsx';

export const Route = createFileRoute('/desk')({
  component: DeskShell,
  notFoundComponent: () => <p className="col-span-12 text-body text-muted-foreground">{m.page_not_found()}</p>,
});
