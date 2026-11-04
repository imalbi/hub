import { createFileRoute } from '@tanstack/react-router';
import { m } from '../paraglide/messages.js';
import { ServerStatus } from '../server-status.tsx';
import { useLayout } from '../use-layout.ts';

export const Route = createFileRoute('/desk')({ component: Desk });

function Desk() {
  useLayout('desk');

  return (
    <main className="grid min-h-dvh place-items-center p-2xl">
      <section className="flex flex-col gap-xs rounded-xl border border-border bg-surface p-lg">
        <p className="text-caption text-muted-foreground uppercase">{m.desk_title()}</p>
        <p className="text-title">
          <ServerStatus />
        </p>
      </section>
    </main>
  );
}
