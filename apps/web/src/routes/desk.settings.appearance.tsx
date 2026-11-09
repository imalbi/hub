import { createFileRoute, Link } from '@tanstack/react-router';
import { CaretLeftIcon } from '@phosphor-icons/react';
import { m } from '../paraglide/messages.js';
import { ThemePanel } from '../theme/theme-panel.tsx';

export const Route = createFileRoute('/desk/settings/appearance')({ component: Appearance });

function Appearance() {
  return (
    <div className="flex flex-col gap-lg">
      <Link to="/desk/settings" className="inline-flex w-fit items-center gap-2xs text-label text-muted-foreground">
        <CaretLeftIcon aria-hidden className="size-icon-sm" />
        {m.settings_back()}
      </Link>
      <ThemePanel />
    </div>
  );
}
