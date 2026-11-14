import { CaretLeftIcon } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { ActionButton } from '../components/ui/action-button.tsx';
import { useTRPC } from '../lib/trpc.ts';
import { m } from '../paraglide/messages.js';
import { ChangesPanel } from './changes-panel.tsx';
import { ModuleForm } from './module-form.tsx';
import { setAt, startsWith } from './path.ts';
import { beginRestart } from './restart.ts';
import { buildForm, type Path } from './schema-fields.ts';

/** Impostazioni > Sistema e agenti: the editable core config sections (`mcp`, `jobs`), never `server`. */
export function CoreSettings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const config = useQuery(trpc.settings.core.queryOptions());
  const save = useMutation(trpc.settings.saveCore.mutationOptions());
  const [draft, setDraft] = useState<{ value: unknown } | null>(null);
  const [issues, setIssues] = useState<{ path: string[]; message: string }[]>([]);
  const [note, setNote] = useState(false);
  if (!config.data) return <p className="text-body text-muted-foreground">{m.settings_loading()}</p>;
  const stored = config.data.value;
  const value = draft ? draft.value : stored;
  const dirty = JSON.stringify(value) !== JSON.stringify(stored);
  const form = buildForm(config.data.schema);
  const issueText = (path: Path) =>
    issues
      .filter((issue) => startsWith(issue.path, path))
      .map((issue) => issue.message)
      .join(' ') || undefined;
  async function submit() {
    const result = await save.mutateAsync(editable(value));
    if (!result.ok) {
      setIssues(result.issues);
      throw new Error('invalid');
    }
    if (result.restarting) return beginRestart(queryClient);
    setDraft(null);
    setNote(true);
    await queryClient.invalidateQueries();
  }
  return (
    <div className="flex flex-col gap-lg">
      <Link to="/desk/settings" className="inline-flex w-fit items-center gap-2xs text-label text-muted-foreground">
        <CaretLeftIcon aria-hidden className="size-icon-sm" />
        {m.settings_back()}
      </Link>
      <div className="sticky top-0 z-10 -my-xs flex flex-wrap items-center gap-lg bg-surface py-xs">
        <h2 className="text-heading">{m.settings_core()}</h2>
        <div className="ml-auto flex items-center gap-sm">
          <ActionButton
            variant="outline"
            disabled={!dirty}
            onClick={() => {
              setDraft(null);
              setIssues([]);
            }}
          >
            {m.settings_cancel()}
          </ActionButton>
          <ActionButton
            action={submit}
            onError={() => {}}
            disabled={!dirty}
            labels={{
              idle: m.settings_save(),
              pending: m.settings_saving(),
              success: m.settings_saved(),
              error: m.settings_save_failed(),
            }}
          >
            {m.settings_save()}
          </ActionButton>
        </div>
      </div>
      {note && <output className="text-label text-muted-foreground">{m.settings_saved_norestart()}</output>}
      <div className="grid grid-cols-12 items-start gap-lg">
        <ModuleForm
          form={form}
          value={value}
          stored={stored}
          resetCount={0}
          issueText={issueText}
          onEdit={(path, next) => setDraft({ value: setAt(value, path, next) })}
          onBlock={() => {}}
        />
        {dirty && (
          <aside className="sticky top-3xl col-span-5">
            <ChangesPanel draft={value} saved={stored} enabledChange={null} />
          </aside>
        )}
      </div>
    </div>
  );
}

function editable(value: unknown): { mcp: { enabled: boolean }; jobs: { maxConcurrent: number } } {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('mcp' in value) ||
    !('jobs' in value) ||
    typeof value.mcp !== 'object' ||
    value.mcp === null ||
    !('enabled' in value.mcp) ||
    typeof value.mcp.enabled !== 'boolean' ||
    typeof value.jobs !== 'object' ||
    value.jobs === null ||
    !('maxConcurrent' in value.jobs) ||
    typeof value.jobs.maxConcurrent !== 'number'
  )
    throw new Error('Invalid core settings');
  return { mcp: { enabled: value.mcp.enabled }, jobs: { maxConcurrent: value.jobs.maxConcurrent } };
}
