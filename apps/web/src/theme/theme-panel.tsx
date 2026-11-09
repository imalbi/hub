import { useMutation } from '@tanstack/react-query';
import { CopyIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState } from 'react';
import { Panel } from '../components/panel.tsx';
import { HoldButton } from '../components/hold-button.tsx';
import { Select } from '../components/ui/select.tsx';
import { useTRPC } from '../lib/trpc.ts';
import { m } from '../paraglide/messages.js';
import { contrastFailures, type Colors } from './contrast.ts';
import { useTheme } from './theme.tsx';
import { builtInThemes, caelestiaId, customId, readThemeValues, type ThemeValues } from './themes.ts';

// Long enough to tell resting on a card from passing over it, short enough to feel immediate.
const hoverIntentMs = 200;

type Draft = { id?: number; name: string; base: string; values: ThemeValues };

type Card = {
  id: string;
  label: string;
  mode: ThemeValues['mode'];
  /** Present for themes held as data; built-in ones are read from their rendered preview when duplicated. */
  values?: ThemeValues;
  customId?: number;
  note?: string;
  disabled?: boolean;
};

export function ThemePanel({ className = '' }: { className?: string }) {
  const { theme, setTheme, setPreview, setDraft, custom, caelestia, caelestiaStatus } = useTheme();
  const [editing, setEditing] = useState<Draft | null>(null);
  // Try a theme only when the pointer rests on its card, so sweeping across the cards does not flash the page.
  const intent = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Leaving the zone with the editor open or a preview pending must not leave the whole desk in that theme.
  useEffect(
    () => () => {
      clearTimeout(intent.current);
      setDraft(null);
      setPreview(null);
    },
    [setDraft, setPreview],
  );
  function tryTheme(id: string) {
    clearTimeout(intent.current);
    intent.current = setTimeout(() => setPreview(id), hoverIntentMs);
  }
  function endTry() {
    clearTimeout(intent.current);
    setPreview(editing ? 'draft' : null);
  }
  // Opening and closing the editor drive the page preview from the same event, not from an effect watching state.
  function openEditor(next: Draft) {
    setEditing(next);
    setDraft(next.values);
    setPreview('draft');
  }
  function closeEditor() {
    setEditing(null);
    setDraft(null);
    setPreview(null);
  }
  const fallbackName = caelestia?.mode === 'light' ? m.theme_paper() : m.theme_ink();
  const cards: Card[] = [
    ...builtInThemes.map(({ id, label, mode }) => ({ id, label: label(), mode })),
    {
      id: caelestiaId,
      label: m.theme_caelestia(),
      mode: caelestia?.mode ?? 'dark',
      values: caelestia ?? undefined,
      disabled: caelestiaStatus === 'missing',
      note:
        caelestiaStatus === 'missing'
          ? m.theme_caelestia_missing()
          : caelestiaStatus === 'low-contrast'
            ? m.theme_caelestia_low_contrast({ fallback: fallbackName })
            : undefined,
    },
    ...(custom ?? []).map((item) => ({
      id: customId(item.id),
      label: item.name,
      mode: item.values.mode,
      values: item.values,
      customId: item.id,
    })),
  ];

  return (
    <Panel title={m.theme_title()} className={className}>
      <fieldset>
        <legend className="sr-only">{m.theme_title()}</legend>
        {/* Leaving the cards ends the try-on: back to the chosen theme, or to the draft while editing. */}
        <div className="grid grid-cols-3 gap-md" onMouseLeave={endTry}>
          {cards.map((card) => {
            const { customId: editId, values } = card;
            return (
              <ThemeCard
                key={card.id}
                card={card}
                checked={theme === card.id}
                onChoose={() => setTheme(card.id)}
                onTry={() => tryTheme(card.id)}
                onDuplicate={(copied) =>
                  openEditor({ name: m.theme_copy_name({ name: card.label }), base: card.id, values: copied })
                }
                onEdit={
                  editId !== undefined && values
                    ? () => openEditor({ id: editId, name: card.label, base: card.id, values })
                    : undefined
                }
                onDeleted={() => theme === card.id && setTheme('ink')}
              />
            );
          })}
        </div>
      </fieldset>
      <p className="text-caption text-muted-foreground">{m.theme_help()}</p>
      {editing && (
        // A modal side sheet: the editor never grows the widget's cell and the page stays visible as the live preview.
        <dialog
          ref={(element) => {
            if (element && !element.open) element.showModal();
          }}
          onCancel={(event) => {
            event.preventDefault();
            closeEditor();
          }}
          aria-label={editing.id === undefined ? m.theme_editor_new() : m.theme_editor_edit()}
          className="theme-sheet m-0 ml-auto h-dvh max-h-dvh border-l border-border bg-surface p-lg text-foreground backdrop:bg-transparent"
        >
          <ThemeEditor
            key={`${editing.id ?? 'new'}-${editing.base}`}
            draft={editing}
            onSaved={(id) => {
              setTheme(customId(id));
              closeEditor();
            }}
            onCancel={closeEditor}
          />
        </dialog>
      )}
    </Panel>
  );
}

function ThemeCard({
  card,
  checked,
  onChoose,
  onTry,
  onDuplicate,
  onEdit,
  onDeleted,
}: {
  card: Card;
  checked: boolean;
  onChoose: () => void;
  onTry: () => void;
  onDuplicate: (values: ThemeValues) => void;
  onEdit?: () => void;
  onDeleted: () => void;
}) {
  const trpc = useTRPC();
  const remove = useMutation(trpc.theme.delete.mutationOptions());
  const preview = useRef<HTMLDivElement>(null);
  const noteId = useId();
  const radioId = useId();
  return (
    <div
      onMouseEnter={card.disabled ? undefined : onTry}
      className="relative flex min-w-0 flex-col gap-xs rounded-lg border border-border p-xs has-checked:border-accent has-focus-visible:outline has-focus-visible:outline-accent has-disabled:opacity-60"
    >
      <label htmlFor={radioId} className="cursor-pointer has-disabled:cursor-not-allowed">
        <input
          id={radioId}
          type="radio"
          name="theme"
          value={card.id}
          checked={checked}
          disabled={card.disabled}
          onChange={onChoose}
          aria-describedby={card.note ? noteId : undefined}
          className="sr-only"
        />
        <ThemePreview id={card.disabled ? 'ink' : card.id} ref={preview} />
      </label>
      <div className="flex items-center justify-between gap-2xs">
        <label htmlFor={radioId} className="min-w-0 flex-1 cursor-pointer truncate text-label">
          {card.label}
        </label>
        <button
          type="button"
          disabled={card.disabled}
          aria-label={m.theme_duplicate({ name: card.label })}
          title={m.theme_duplicate({ name: card.label })}
          onClick={() => {
            const values = card.values ?? (preview.current && readThemeValues(preview.current, card.mode));
            if (values) onDuplicate(values);
          }}
          className="flex size-touch shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-accent disabled:opacity-60"
        >
          <CopyIcon className="size-icon-sm" aria-hidden />
        </button>
        {onEdit && (
          <button
            type="button"
            aria-label={m.theme_edit({ name: card.label })}
            title={m.theme_edit({ name: card.label })}
            onClick={onEdit}
            className="flex size-touch shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-accent"
          >
            <PencilSimpleIcon className="size-icon-sm" aria-hidden />
          </button>
        )}
      </div>
      {card.note && (
        <span id={noteId} className="text-caption text-muted-foreground">
          {card.note}
        </span>
      )}
      {card.customId !== undefined && (
        <HoldButton
          label={m.theme_delete({ name: card.label })}
          idle={m.theme_delete_idle()}
          done={m.theme_deleted()}
          className="self-start"
          onConfirm={async () => {
            if (card.customId === undefined) return;
            await remove.mutateAsync({ id: card.customId, confirmed: true });
            onDeleted();
          }}
        />
      )}
    </div>
  );
}

/** A miniature desk drawn with the theme's own variables: rail pill, a panel with a big light number, a pill button. */
function ThemePreview({ id, ref }: { id: string; ref: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} data-theme={id} aria-hidden className="flex gap-xs rounded-md bg-background p-xs text-foreground">
      <div className="desk-glass flex flex-col items-center gap-3xs rounded-full border p-3xs">
        <span className="size-xs rounded-full bg-primary" />
        <span className="size-xs rounded-full bg-muted" />
        <span className="size-xs rounded-full bg-muted" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3xs rounded-md border border-border bg-surface p-xs">
        <span className="text-caption text-muted-foreground">{m.pomodoro_focus()}</span>
        <span className="text-title tabular-nums">25:00</span>
        <span className="flex items-center gap-2xs">
          <span className="rounded-full bg-primary px-xs text-caption text-primary-foreground">
            {m.pomodoro_start()}
          </span>
          <span className="size-2xs rounded-full bg-accent" />
        </span>
      </div>
    </div>
  );
}

const roles: Array<keyof Colors> = [
  'background',
  'surface',
  'surfaceRaised',
  'muted',
  'foreground',
  'mutedForeground',
  'primary',
  'primaryForeground',
  'accent',
  'success',
  'danger',
];

const roleLabel: Record<keyof Colors, () => string> = {
  background: m.theme_role_background,
  foreground: m.theme_role_foreground,
  surface: m.theme_role_surface,
  surfaceRaised: m.theme_role_surfaceRaised,
  muted: m.theme_role_muted,
  mutedForeground: m.theme_role_mutedForeground,
  border: m.theme_role_foreground,
  primary: m.theme_role_primary,
  primaryForeground: m.theme_role_primaryForeground,
  accent: m.theme_role_accent,
  success: m.theme_role_success,
  danger: m.theme_role_danger,
};

function ThemeEditor({
  draft,
  onSaved,
  onCancel,
}: {
  draft: Draft;
  onSaved: (id: number) => void;
  onCancel: () => void;
}) {
  const trpc = useTRPC();
  const { setDraft } = useTheme();
  const save = useMutation(trpc.theme.save.mutationOptions());
  const [name, setName] = useState(draft.name);
  const [values, setValues] = useState(draft.values);
  const failures = contrastFailures(values.colors);
  const formId = useId();

  function change(next: ThemeValues) {
    setValues(next);
    setDraft(next);
  }

  function setColor(role: keyof Colors, hex: string) {
    const colors = { ...values.colors, [role]: hex };
    // The hairline follows the text color at low opacity, as in the built-in themes.
    if (role === 'foreground') colors.border = `${hex}1a`;
    change({ ...values, colors });
  }

  return (
    <form
      aria-labelledby={formId}
      className="flex flex-col gap-md"
      onSubmit={(event) => {
        event.preventDefault();
        if (failures.length > 0) return;
        save.mutate({ id: draft.id, name, base: draft.base, values }, { onSuccess: ({ id }) => onSaved(id) });
      }}
    >
      <h3 id={formId} className="text-label">
        {draft.id === undefined ? m.theme_editor_new() : m.theme_editor_edit()}
      </h3>
      <div className="flex flex-col gap-md">
        <label className="flex flex-col gap-2xs text-caption text-muted-foreground">
          {m.theme_name()}
          <input
            value={name}
            required
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            className="min-h-touch rounded-md border border-border bg-background px-sm text-body text-foreground"
          />
        </label>
        <Select
          label={m.theme_mode()}
          value={values.mode}
          onValueChange={(mode) => change({ ...values, mode: mode === 'light' ? 'light' : 'dark' })}
          options={[
            { value: 'dark', label: m.theme_mode_dark() },
            { value: 'light', label: m.theme_mode_light() },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-sm">
        {roles.map((role) => (
          <label key={role} className="flex items-center gap-xs text-caption">
            <input
              type="color"
              value={values.colors[role].slice(0, 7)}
              onChange={(event) => setColor(role, event.target.value)}
              className="size-touch shrink-0 cursor-pointer rounded-md border border-border bg-transparent"
            />
            {roleLabel[role]()}
          </label>
        ))}
      </div>
      <div aria-live="polite" className="flex flex-col gap-2xs text-caption">
        {failures.length === 0 ? (
          <p className="text-muted-foreground">{m.theme_contrast_ok()}</p>
        ) : (
          failures.map(({ text, on, ratio, min }) => (
            <p key={`${text}-${on}`} className="text-danger">
              {m.theme_contrast_failure({
                text: roleLabel[text](),
                on: roleLabel[on](),
                ratio: ratio.toLocaleString('it'),
                min: min.toLocaleString('it'),
              })}
            </p>
          ))
        )}
        {save.isError && (
          <p role="alert" className="text-danger">
            {m.theme_save_failed()}
          </p>
        )}
      </div>
      <div className="flex gap-xs">
        <button
          type="submit"
          disabled={failures.length > 0 || save.isPending || !name.trim()}
          className="min-h-touch rounded-full bg-primary px-lg text-label text-primary-foreground hover:opacity-80 focus-visible:outline focus-visible:outline-accent disabled:opacity-60"
        >
          {m.theme_save()}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-touch rounded-full border border-border px-lg text-label hover:bg-muted focus-visible:outline focus-visible:outline-accent"
        >
          {m.theme_cancel()}
        </button>
      </div>
    </form>
  );
}
