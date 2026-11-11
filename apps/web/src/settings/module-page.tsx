import { CaretLeftIcon } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, notFound } from '@tanstack/react-router';
import { useState } from 'react';
import { HoldButton } from '../components/hold-button.tsx';
import { Panel } from '../components/panel.tsx';
import { ActionButton } from '../components/ui/action-button.tsx';
import { Switch } from '../components/ui/switch.tsx';
import { Tabs } from '../components/ui/tabs.tsx';
import { useTRPC } from '../lib/trpc.ts';
import { m } from '../paraglide/messages.js';
import { FieldControl } from './field-control.tsx';
import { JsonBlock } from './json-block.tsx';
import { moduleLabel } from './module-label.ts';
import { getAt, setAt, startsWith } from './path.ts';
import { beginRestart } from './restart.ts';
import { buildForm, type Field, type Path } from './schema-fields.ts';

type Issue = { path: Path; message: string };
const key = (path: Path) => path.join('\u0000');

/** One module's page: its switch, then its config as a form (Essenziale) and JSON blocks (Avanzate), saved together. */
export function ModulePage({ name }: { name: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const modules = useQuery(trpc.settings.modules.queryOptions());
  const config = useQuery(trpc.settings.config.queryOptions({ module: name }));
  const save = useMutation(trpc.settings.save.mutationOptions());
  const restore = useMutation(trpc.settings.restore.mutationOptions());
  // The draft: `null` means untouched, so the page shows what the server holds without copying it into state.
  const [edit, setEdit] = useState<{ value: unknown } | null>(null);
  const [enabledEdit, setEnabledEdit] = useState<boolean | null>(null);
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<Issue[]>([]);
  const [tab, setTab] = useState<string | null>(null);
  // Remounts the JSON blocks, which keep their own text, when the draft is dropped.
  const [resetCount, setResetCount] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  const info = modules.data?.find((entry) => entry.name === name);
  if (modules.data && !info) throw notFound();
  if (!info || !config.data) return <p className="text-body text-muted-foreground">{m.settings_loading()}</p>;

  const { schema, value: stored, hasBackup } = config.data;
  const form = buildForm(schema);
  const value = edit ? edit.value : stored;
  const serverEnabled = info.status !== 'off';
  const enabled = enabledEdit ?? serverEnabled;
  // Compared with the server's value, so the draft stops counting once a save has gone through and been read back.
  const dirty =
    (edit !== null && JSON.stringify(edit.value) !== JSON.stringify(stored)) ||
    (enabledEdit !== null && enabledEdit !== serverEnabled);
  const invalidJson = Object.keys(jsonErrors).length > 0;
  const label = moduleLabel(name);

  const grouped = new Map<string, Field[]>();
  for (const field of form.fields) {
    const section = field.path.slice(0, -1).join(' › ');
    grouped.set(section, [...(grouped.get(section) ?? []), field]);
  }
  const matched = (path: Path) =>
    form.fields.some((field) => startsWith(path, field.path)) ||
    form.blocks.some((block) => startsWith(path, block.path));
  const unmatched = issues.filter((issue) => !matched(issue.path));
  const issueText = (path: Path) =>
    issues
      .filter((issue) => startsWith(issue.path, path))
      .map((issue) => issue.message)
      .join(' ') || undefined;

  const reset = () => {
    setEdit(null);
    setEnabledEdit(null);
    setJsonErrors({});
    setIssues([]);
    setResetCount((count) => count + 1);
  };
  const edited = (path: Path, next: unknown) => setEdit({ value: setAt(value, path, next) });

  async function submit() {
    const result = await save.mutateAsync({ module: name, enabled, value: schema ? value : undefined });
    if (!result.ok) {
      setIssues(result.issues);
      throw new Error('invalid');
    }
    if (result.restarting) return beginRestart(queryClient);
    // Nothing restarts from a terminal: the file is written and the page shows what it holds now.
    reset();
    setNote(m.settings_saved_norestart());
    await queryClient.invalidateQueries();
  }

  async function restoreBackup() {
    const result = await restore.mutateAsync({ confirmed: true });
    if (result.restarting) return beginRestart(queryClient);
    reset();
    setNote(m.settings_saved_norestart());
    await queryClient.invalidateQueries();
  }

  const blocks = form.blocks;
  const current = blocks.find((block) => key(block.path) === tab) ?? blocks[0];
  const tabsId = `settings-blocks-${name}`;

  return (
    <div className="flex flex-col gap-lg">
      <header className="flex flex-col gap-xs">
        <Link to="/desk/settings" className="inline-flex w-fit items-center gap-2xs text-label text-muted-foreground">
          <CaretLeftIcon aria-hidden className="size-icon-sm" />
          {m.settings_back()}
        </Link>
        <div className="flex flex-wrap items-center gap-lg">
          <h2 className="text-heading">{label}</h2>
          <span className="text-label text-muted-foreground">
            {info.kind === 'private' ? m.settings_kind_private() : m.settings_kind_public()}
          </span>
          <Switch
            aria-label={m.settings_module_switch()}
            label={m.settings_module_switch()}
            checked={enabled}
            onCheckedChange={(next) => setEnabledEdit(next)}
          />
          <div className="ml-auto flex items-center gap-sm">
            <ActionButton variant="outline" disabled={!dirty} onClick={reset}>
              {m.settings_cancel()}
            </ActionButton>
            <ActionButton
              action={submit}
              onError={() => {}}
              disabled={!dirty || invalidJson}
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
        {info.status === 'off' && enabledEdit === null && (
          <p className="text-label text-muted-foreground">{m.settings_off_note()}</p>
        )}
        {info.status === 'failed' && <p className="text-label text-danger">{m.settings_failed_note()}</p>}
        {note && <output className="text-label text-muted-foreground">{note}</output>}
        {unmatched.length > 0 && (
          <ul className="flex flex-col gap-2xs text-label text-danger">
            {unmatched.map(({ path, message }) => (
              <li key={`${key(path)}${message}`}>
                {path.length > 0
                  ? m.settings_issue({ path: path.join('.'), message })
                  : m.settings_issue_root({ message })}
              </li>
            ))}
          </ul>
        )}
      </header>

      {!schema && <p className="text-body text-muted-foreground">{m.settings_no_form()}</p>}
      {schema && (
        <div className="grid grid-cols-12 items-start gap-lg">
          <Panel title={m.settings_essential()} className="col-span-5">
            {form.fields.length === 0 && <p className="text-body text-muted-foreground">{m.settings_no_essential()}</p>}
            {[...grouped].map(([section, fields]) => (
              <fieldset key={section} className="flex flex-col gap-md">
                {section && <legend className="mb-sm text-label text-muted-foreground">{section}</legend>}
                {fields.map((field) => (
                  <div key={key(field.path)}>
                    <FieldControl
                      field={field}
                      value={getAt(value, field.path)}
                      saved={getAt(stored, field.path)}
                      error={issueText(field.path)}
                      onChange={(next) => edited(field.path, next)}
                    />
                    {field.description && <p className="text-caption text-muted-foreground">{field.description}</p>}
                  </div>
                ))}
              </fieldset>
            ))}
          </Panel>
          <Panel title={m.settings_advanced()} className="col-span-7">
            {!current && <p className="text-body text-muted-foreground">{m.settings_no_advanced()}</p>}
            {current && (
              <>
                {blocks.length > 1 && (
                  <Tabs
                    id={tabsId}
                    label={m.settings_advanced_label()}
                    value={key(current.path)}
                    onValueChange={setTab}
                    items={blocks.map((block) => ({ value: key(block.path), label: block.label }))}
                  />
                )}
                <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-tab-${key(current.path)}`}>
                  <JsonBlock
                    key={`${key(current.path)}-${resetCount}`}
                    label={current.label}
                    value={getAt(value, current.path)}
                    issues={issues
                      .filter((issue) => startsWith(issue.path, current.path))
                      .map((issue) => ({ path: issue.path.slice(current.path.length), message: issue.message }))}
                    onChange={(next, error) => {
                      setJsonErrors((previous) => {
                        const { [key(current.path)]: _dropped, ...rest } = previous;
                        return error === null ? rest : { ...rest, [key(current.path)]: error };
                      });
                      if (error === null) edited(current.path, next);
                    }}
                  />
                </div>
              </>
            )}
          </Panel>
        </div>
      )}

      {hasBackup && (
        <div className="flex items-center justify-between gap-md">
          <HoldButton
            outline
            label={m.settings_restore_hold()}
            idle={m.settings_restore()}
            done={m.settings_restore_done()}
            onConfirm={restoreBackup}
          />
        </div>
      )}
    </div>
  );
}
