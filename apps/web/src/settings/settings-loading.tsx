import { CaretLeftIcon } from '@phosphor-icons/react';
import { Link } from '@tanstack/react-router';
import { Panel } from '../components/panel.tsx';
import { ActionButton } from '../components/ui/action-button.tsx';
import { m } from '../paraglide/messages.js';

export function SettingsLoading({ title, module = false }: { title: string; module?: boolean }) {
  const back = (
    <Link to="/desk/settings" className="inline-flex w-fit items-center gap-2xs text-label text-muted-foreground">
      <CaretLeftIcon aria-hidden className="size-icon-sm" />
      {m.settings_back()}
    </Link>
  );
  const actions = (
    <div className="ml-auto flex items-center gap-sm">
      <ActionButton variant="outline" disabled>
        {m.settings_cancel()}
      </ActionButton>
      <ActionButton disabled>{m.settings_save()}</ActionButton>
    </div>
  );
  return (
    <div className="flex flex-col gap-lg">
      {module ? (
        <header className="sticky top-0 z-10 -mb-sm flex flex-col gap-xs bg-surface pb-sm">
          {back}
          <div className="flex flex-wrap items-center gap-lg">
            <h2 className="text-heading">{title}</h2>
            <span aria-hidden className="h-md w-3xl rounded-sm bg-muted-foreground/20" />
            {actions}
          </div>
        </header>
      ) : (
        <>
          {back}
          <div className="sticky top-0 z-10 -my-xs flex flex-wrap items-center gap-lg bg-surface py-xs">
            <h2 className="text-heading">{title}</h2>
            {actions}
          </div>
        </>
      )}
      <div className="grid grid-cols-12 items-start gap-lg">
        <Panel title={m.settings_essential()} className="col-span-7">
          <output aria-label={m.settings_loading()} className="grid grid-cols-2 gap-lg">
            {[0, 1, 2, 3].map((item) => (
              <span key={item} aria-hidden className="flex flex-col gap-xs">
                <span className="h-md w-3xl rounded-sm bg-muted-foreground/20 motion-safe:animate-pulse" />
                <span className="h-touch rounded-md bg-muted-foreground/20 motion-safe:animate-pulse" />
              </span>
            ))}
          </output>
        </Panel>
      </div>
    </div>
  );
}
