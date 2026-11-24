import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@hub/server';
import { Panel } from '../components/panel.tsx';
import { HoldButton } from '../components/hold-button.tsx';
import { ActionButton } from '../components/ui/action-button.tsx';
import { m } from '../paraglide/messages.js';

type CatalogState = inferRouterOutputs<AppRouter>['catalog']['state'];
type Source = CatalogState['sources'][number];
type Module = Source['modules'][number];

export function CatalogSource({
  source,
  busy,
  installed,
  sync,
  removeSource,
  install,
  update,
  remove,
}: {
  source: Source;
  busy: boolean;
  installed: CatalogState['installed'];
  sync: () => Promise<unknown>;
  removeSource: () => Promise<unknown>;
  install: (name: string) => Promise<unknown>;
  update: (name: string) => Promise<unknown>;
  remove: (name: string) => Promise<unknown>;
}) {
  const sourceInstalled = installed.filter((module) => module.sourceId === source.id);
  const hasInstalled = sourceInstalled.length > 0;
  // Keep removal available when a later manifest drops an installed entry or fails validation.
  const modules = source.modules.concat(
    sourceInstalled
      .filter((module) => !source.modules.some((entry) => entry.name === module.name))
      .map((module) => ({
        name: module.name,
        title: module.title,
        description: module.description,
        version: module.version,
        path: module.modulePath,
        installed: true,
        installedFromOtherSource: false,
        installedVersion: module.version,
        installedCommit: module.installedCommit,
        updateAvailable: false,
        localConflict: module.localConflict,
      })),
  );
  return (
    <Panel title={source.name} subtitle={source.description}>
      <div className="flex flex-wrap items-start gap-md">
        <div className="min-w-0 grow text-label text-muted-foreground">
          <p className="break-all">{source.url}</p>
          <p>
            {source.commitSha.slice(0, 8)} ·{' '}
            {m.catalog_synced({ time: new Date(source.lastSyncedAt).toLocaleString('it-IT') })}
          </p>
        </div>
        <fieldset disabled={busy} className="flex flex-wrap items-center gap-sm disabled:opacity-45">
          <ActionButton
            variant="outline"
            action={sync}
            labels={{ pending: m.action_pending(), success: m.action_done(), error: m.catalog_retry() }}
          >
            {m.catalog_sync()}
          </ActionButton>
          <fieldset
            disabled={hasInstalled}
            aria-label={hasInstalled ? m.catalog_remove_source_hint() : undefined}
            className="disabled:opacity-45"
          >
            <HoldButton
              outline
              label={m.catalog_remove_source_hold({ name: source.name })}
              idle={m.catalog_remove_source()}
              done={m.action_done()}
              onConfirm={removeSource}
            />
          </fieldset>
        </fieldset>
      </div>
      {hasInstalled && <p className="text-label text-muted-foreground">{m.catalog_remove_source_hint()}</p>}
      {source.syncError && (
        <p role="alert" className="text-body text-danger">
          {m.catalog_sync_error()}
        </p>
      )}
      {source.manifestError && (
        <p role="alert" className="text-body text-danger">
          {m.catalog_manifest_error()}
        </p>
      )}
      <ul className="flex flex-col divide-y divide-dashed divide-border">
        {modules.map((module) => (
          <li key={module.name} className="flex flex-wrap items-center gap-md py-md first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-sm">
                <h3 className="text-title">{module.title}</h3>
                <span className="rounded-full border border-border px-sm py-3xs text-label text-muted-foreground">
                  {moduleState(module)}
                </span>
              </div>
              <p className="mt-xs text-body text-muted-foreground">{module.description}</p>
              <p className="mt-xs text-label text-muted-foreground">
                {m.catalog_version({ version: module.version })}
                {module.installedVersion && ` · ${m.catalog_installed_version({ version: module.installedVersion })}`}
              </p>
              {!source.modules.some((entry) => entry.name === module.name) && (
                <p className="mt-xs text-label text-muted-foreground">{m.catalog_unlisted()}</p>
              )}
              {module.localConflict && (
                <p className="mt-xs text-label text-muted-foreground">{m.catalog_local_hint()}</p>
              )}
              {module.installed && <p className="mt-xs text-label text-muted-foreground">{m.catalog_keep_data()}</p>}
            </div>
            <fieldset disabled={busy} className="flex flex-wrap items-center gap-sm disabled:opacity-45">
              {module.installed ? (
                <>
                  {module.updateAvailable && (
                    <fieldset disabled={module.localConflict} className="disabled:opacity-45">
                      <HoldButton
                        label={m.catalog_update_hold({ name: module.title })}
                        idle={m.catalog_update()}
                        done={m.action_done()}
                        onConfirm={() => update(module.name)}
                      />
                    </fieldset>
                  )}
                  <HoldButton
                    outline
                    label={m.catalog_remove_hold({ name: module.title })}
                    idle={m.catalog_remove()}
                    done={m.action_done()}
                    onConfirm={() => remove(module.name)}
                  />
                </>
              ) : (
                <fieldset
                  disabled={module.localConflict || module.installedFromOtherSource}
                  className="disabled:opacity-45"
                >
                  <HoldButton
                    label={m.catalog_install_hold({ name: module.title })}
                    idle={m.catalog_install()}
                    done={m.action_done()}
                    onConfirm={() => install(module.name)}
                  />
                </fieldset>
              )}
            </fieldset>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function moduleState(module: Module) {
  if (module.localConflict) return m.catalog_local();
  if (module.installedFromOtherSource) return m.catalog_other_source();
  if (module.updateAvailable) return m.catalog_update_available();
  return module.installed ? m.catalog_installed() : m.catalog_available();
}
