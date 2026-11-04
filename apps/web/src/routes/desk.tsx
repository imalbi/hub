import { createFileRoute } from '@tanstack/react-router';
import { DevicesPanel } from '../desk/devices-panel.tsx';
import { m } from '../paraglide/messages.js';
import { ServerStatus } from '../server-status.tsx';
import { useLayout } from '../use-layout.ts';

export const Route = createFileRoute('/desk')({ component: Desk });

function Desk() {
  useLayout('desk');

  return (
    <main className="flex min-h-dvh flex-wrap items-center justify-center gap-lg p-2xl">
      <section className="flex flex-col gap-xs rounded-xl border border-border bg-surface p-lg">
        <p className="text-caption text-muted-foreground uppercase">{m.desk_title()}</p>
        <p className="text-title">
          <ServerStatus />
        </p>
      </section>
      <DevicesPanel />
    </main>
  );
}
