import { PlusIcon } from '@phosphor-icons/react';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { Panel } from '../components/panel.tsx';
import { HoldButton } from '../components/hold-button.tsx';
import { ButtonGroup } from '../components/ui/button-group.tsx';
import { Switch } from '../components/ui/switch.tsx';
import { useTRPC } from '../lib/trpc.ts';
import { m } from '../paraglide/messages.js';
import { builtInSeeds, deriveColors } from './derive.ts';
import { ThemeEditor, type Draft } from './theme-editor.tsx';
import { backdrops, radii, useTheme, type Backdrop, type Radius } from './theme.tsx';
import { builtInThemes, caelestiaId, customId, type ThemeValues } from './themes.ts';

// Long enough to tell resting on a row from passing over it, short enough to feel immediate.
const hoverIntentMs = 200;

type Row = {
  id: string;
  label: string;
  note?: string;
  /** Present for themes held as data (Caelestia, custom); built-in ones are derived from their seed when a new theme starts from them. */
  values?: ThemeValues;
  customId?: number;
  /** A note that explains why the row cannot be chosen. */
  disabled?: boolean;
};

const radiusLabels: Record<Radius, () => string> = {
  soft: m.theme_radius_soft,
  standard: m.theme_radius_standard,
  sharp: m.theme_radius_sharp,
};
const backdropLabels: Record<Backdrop, () => string> = {
  plain: m.theme_backdrop_plain,
  glow: m.theme_backdrop_glow,
  cover: m.theme_backdrop_cover,
};
const builtInNotes: Record<string, () => string> = {
  ink: m.theme_note_ink,
  paper: m.theme_note_paper,
  moss: m.theme_note_moss,
  stone: m.theme_note_stone,
  night: m.theme_note_night,
  ember: m.theme_note_ember,
  lagoon: m.theme_note_lagoon,
};

function startingValues(row: Row): ThemeValues | undefined {
  const preset = builtInSeeds[row.id];
  if (preset)
    return { mode: preset.mode, colors: deriveColors(preset.mode, preset.seed), seed: preset.seed, manual: [] };
  return row.values;
}

export function ThemePanel({ className = '' }: { className?: string }) {
  const { theme, setTheme, setPreview, setDraft, custom, caelestia, caelestiaStatus } = useTheme();
  const [editing, setEditing] = useState<Draft | null>(null);
  // Try a theme only when the pointer rests on its row, so sweeping across the rows does not flash the page.
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
  const rows: Row[] = [
    ...builtInThemes.map(({ id, label }) => ({ id, label: label(), note: builtInNotes[id]?.() })),
    {
      id: caelestiaId,
      label: m.theme_caelestia(),
      values: caelestia ?? undefined,
      disabled: caelestiaStatus === 'missing',
      note:
        caelestiaStatus === 'missing'
          ? m.theme_caelestia_missing()
          : caelestiaStatus === 'low-contrast'
            ? m.theme_caelestia_low_contrast({ fallback: fallbackName })
            : m.theme_note_caelestia(),
    },
    ...(custom ?? []).map((item) => ({
      id: customId(item.id),
      label: item.name,
      note: item.values.mode === 'dark' ? m.theme_note_custom_dark() : m.theme_note_custom_light(),
      values: item.values,
      customId: item.id,
    })),
  ];

  // A new theme starts from the chosen one; a chosen Caelestia that is missing falls back to Scuro.
  function createTheme() {
    const chosen = rows.find((row) => row.id === theme && !row.disabled) ?? rows[0];
    const values = chosen && startingValues(chosen);
    if (chosen && values) openEditor({ name: m.theme_copy_name({ name: chosen.label }), base: chosen.id, values });
  }

  return (
    <Panel
      title={m.theme_title()}
      className={className}
      action={<span className="text-label text-muted-foreground">{m.theme_this_device()}</span>}
    >
      <fieldset>
        <legend className="pb-xs text-label text-muted-foreground">{m.theme_section_theme()}</legend>
        {/* Leaving the rows ends the try-on: back to the chosen theme, or to the draft while editing. */}
        <div onMouseLeave={endTry}>
          <ul>
            {rows.map((row) => {
              const { customId: editId, values } = row;
              return (
                <ThemeRow
                  key={row.id}
                  row={row}
                  checked={theme === row.id}
                  onChoose={() => setTheme(row.id)}
                  onTry={() => tryTheme(row.id)}
                  onEdit={
                    editId !== undefined && values
                      ? () => openEditor({ id: editId, name: row.label, base: row.id, values })
                      : undefined
                  }
                  onDeleted={() => theme === row.id && setTheme('ink')}
                />
              );
            })}
            <li className="border-t border-dashed border-border py-xs">
              <button
                type="button"
                onClick={createTheme}
                className="flex min-h-touch w-full cursor-pointer items-center gap-md rounded-lg px-md text-left hover:bg-surface focus-visible:outline focus-visible:outline-accent"
              >
                <PlusIcon aria-hidden className="size-icon shrink-0" />
                <span className="shrink-0 text-body font-medium">{m.theme_create()}</span>
                <span className="min-w-0 flex-1 truncate text-label text-muted-foreground">
                  {m.theme_create_note()}
                </span>
              </button>
            </li>
          </ul>
        </div>
      </fieldset>
      <Shape />
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
          className="theme-sheet m-0 ml-auto h-dvh max-h-dvh bg-transparent py-xl pr-xl text-foreground backdrop:bg-transparent"
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

/** Angoli, Vetro and Sfondo: per device, like the theme. */
function Shape() {
  const { radius, setRadius, glass, setGlass, backdrop, setBackdrop } = useTheme();
  const rowClass = 'flex flex-wrap items-center gap-x-lg gap-y-sm border-t border-dashed border-border pt-md';
  return (
    <section className="flex flex-col gap-md">
      <h3 className="text-label text-muted-foreground">{m.theme_section_shape()}</h3>
      <div className={rowClass}>
        <span className="w-label-col text-body">{m.theme_radius()}</span>
        <ButtonGroup
          label={m.theme_radius()}
          collapseLabels={false}
          items={radii.map((id) => ({
            id,
            label: radiusLabels[id](),
            active: radius === id,
            onClick: () => setRadius(id),
          }))}
        />
        <span className="text-body">{m.theme_glass()}</span>
        <Switch checked={glass} onCheckedChange={setGlass} aria-label={m.theme_glass()} />
        <span className="text-label text-muted-foreground">{m.theme_glass_note()}</span>
      </div>
      <div className={rowClass}>
        <span className="w-label-col text-body">{m.theme_backdrop()}</span>
        <ButtonGroup
          label={m.theme_backdrop()}
          collapseLabels={false}
          items={backdrops.map((id) => ({
            id,
            label: backdropLabels[id](),
            active: backdrop === id,
            onClick: () => setBackdrop(id),
          }))}
        />
        {backdrop === 'cover' && (
          <span className="text-label text-muted-foreground">{m.theme_backdrop_cover_note()}</span>
        )}
      </div>
    </section>
  );
}

const swatches = ['bg-background', 'bg-surface', 'bg-muted', 'bg-foreground', 'bg-accent'];

/** The five colors a row shows, drawn with the theme's own variables: ground, panel, inner panel, text, accent. */
function Swatches({ id }: { id: string }) {
  return (
    <span data-theme={id} aria-hidden className="flex shrink-0 overflow-hidden rounded-md border border-border">
      {swatches.map((color) => (
        <span key={color} className={`size-lg ${color}`} />
      ))}
    </span>
  );
}

function ThemeRow({
  row,
  checked,
  onChoose,
  onTry,
  onEdit,
  onDeleted,
}: {
  row: Row;
  checked: boolean;
  onChoose: () => void;
  onTry: () => void;
  onEdit?: () => void;
  onDeleted: () => void;
}) {
  const trpc = useTRPC();
  const remove = useMutation(trpc.theme.delete.mutationOptions());
  const noteId = useId();
  const pill =
    'min-h-touch shrink-0 rounded-full border border-border px-lg text-label hover:bg-surface focus-visible:outline focus-visible:outline-accent disabled:opacity-60';
  return (
    <li className="border-t border-dashed border-border py-xs first:border-t-0">
      <div onMouseEnter={row.disabled ? undefined : onTry} className="flex items-center gap-md">
        <label className="flex min-h-touch min-w-0 flex-1 cursor-pointer items-center gap-md rounded-lg px-md hover:bg-surface has-checked:bg-surface has-focus-visible:outline has-focus-visible:outline-accent has-disabled:cursor-not-allowed has-disabled:opacity-60">
          <input
            type="radio"
            name="theme"
            value={row.id}
            checked={checked}
            disabled={row.disabled}
            onChange={onChoose}
            aria-label={row.label}
            aria-describedby={row.note ? noteId : undefined}
            className="sr-only"
          />
          <span
            aria-hidden
            className="flex size-icon shrink-0 items-center justify-center rounded-full border-2 border-foreground"
          >
            {checked && <span className="size-2xs rounded-full bg-foreground" />}
          </span>
          <span className="w-label-col shrink-0 truncate text-body font-medium">{row.label}</span>
          <span id={noteId} className="min-w-0 flex-1 truncate text-label text-muted-foreground">
            {row.note}
          </span>
          <Swatches id={row.disabled ? 'ink' : row.id} />
        </label>
        {onEdit && (
          <>
            <button type="button" aria-label={m.theme_edit({ name: row.label })} onClick={onEdit} className={pill}>
              {m.theme_edit_short()}
            </button>
            <HoldButton
              label={m.theme_delete({ name: row.label })}
              idle={m.theme_delete_idle()}
              done={m.theme_deleted()}
              onConfirm={async () => {
                if (row.customId === undefined) return;
                await remove.mutateAsync({ id: row.customId, confirmed: true });
                onDeleted();
              }}
            />
          </>
        )}
      </div>
    </li>
  );
}
