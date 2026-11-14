import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Badge } from '../components/ui/badge.tsx';
import { ButtonGroup } from '../components/ui/button-group.tsx';
import { Slider } from '../components/ui/slider.tsx';
import { useTRPC } from '../lib/trpc.ts';
import { m } from '../paraglide/messages.js';
import { contrastFailures, type Colors } from './contrast.ts';
import { accentPresets, basePresets, oklchHex, rate, textRatio, type Rating } from './derive.ts';
import { colorsOf, editorStateOf, roles, valuesOf, type EditorState } from './editor-state.ts';
import { useTheme } from './theme.tsx';
import type { ThemeValues } from './themes.ts';

export type Draft = { id?: number; name: string; base: string; values: ThemeValues };

const roleLabel: Record<keyof Colors, () => string> = {
  background: m.theme_role_background,
  foreground: m.theme_role_foreground,
  surface: m.theme_role_surface,
  surfaceRaised: m.theme_role_surfaceRaised,
  muted: m.theme_role_muted,
  mutedForeground: m.theme_role_mutedForeground,
  border: m.theme_role_border,
  primary: m.theme_role_primary,
  primaryForeground: m.theme_role_primaryForeground,
  accent: m.theme_role_accent,
  success: m.theme_role_success,
  danger: m.theme_role_danger,
};
const baseLabel: Record<(typeof basePresets)[number]['id'], () => string> = {
  neutral: m.theme_base_neutral,
  stone: m.theme_base_stone,
  moss: m.theme_base_moss,
  sand: m.theme_base_sand,
  night: m.theme_base_night,
  plum: m.theme_base_plum,
  sea: m.theme_base_sea,
};
const accentLabel: Record<(typeof accentPresets)[number]['id'], () => string> = {
  cyan: m.theme_accent_cyan,
  green: m.theme_accent_green,
  coral: m.theme_accent_coral,
  amber: m.theme_accent_amber,
  indigo: m.theme_accent_indigo,
  rose: m.theme_accent_rose,
  lime: m.theme_accent_lime,
};
const ratingLabel: Record<Rating, () => string> = {
  aaa: m.theme_rating_aaa,
  aa: m.theme_rating_aa,
  low: m.theme_rating_low,
};

const sectionClass = 'flex flex-col gap-sm border-t border-dashed border-border pt-md';

/** The seed editor of a custom theme, drawn inside the side sheet; every change shows on the whole desk behind it. */
export function ThemeEditor({
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
  const [state, setState] = useState(() => editorStateOf(draft.values));
  const colors = colorsOf(state);
  const failures = contrastFailures(colors);
  const ratio = textRatio(colors);
  const rating = rate(ratio);
  const formId = useId();
  const { seed } = state;

  function change(patch: Partial<EditorState>) {
    const next = { ...state, ...patch };
    setState(next);
    setDraft(valuesOf(next));
  }
  const changeSeed = (patch: Partial<EditorState['seed']>) => change({ seed: { ...seed, ...patch } });
  const baseLightness = state.mode === 'dark' ? 0.3 : 0.88;

  return (
    <form
      aria-labelledby={formId}
      className="flex h-full flex-col rounded-xl border border-border bg-surface shadow-lg"
      onSubmit={(event) => {
        event.preventDefault();
        if (failures.length > 0) return;
        save.mutate(
          { id: draft.id, name, base: draft.base, values: valuesOf(state) },
          { onSuccess: ({ id }) => onSaved(id) },
        );
      }}
    >
      <header className="flex items-center gap-md px-xl pt-xl pb-md">
        <h3 id={formId} className="flex-1 text-title">
          {draft.id === undefined ? m.theme_editor_new() : m.theme_editor_edit()}
        </h3>
        <span className="text-label text-muted-foreground">{m.theme_editor_live()}</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-md overflow-y-auto px-xl pb-md">
        <label className="flex items-center gap-md text-label">
          <span className="w-label-col text-body font-semibold">{m.theme_name()}</span>
          <input
            value={name}
            required
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            className="min-h-touch min-w-0 flex-1 rounded-md border border-border bg-background px-sm text-body text-foreground"
          />
        </label>
        <div className="flex items-center gap-md">
          <span className="w-label-col text-body font-semibold">{m.theme_mode()}</span>
          <ButtonGroup
            label={m.theme_mode()}
            collapseLabels={false}
            items={(['dark', 'light'] as const).map((mode) => ({
              id: mode,
              label: mode === 'dark' ? m.theme_mode_dark() : m.theme_mode_light(),
              active: state.mode === mode,
              onClick: () => change({ mode }),
            }))}
          />
        </div>

        <section aria-label={m.theme_base()} className={sectionClass}>
          <div className="flex items-baseline gap-sm">
            <h4 className="text-body font-semibold">{m.theme_base()}</h4>
            <span className="text-label text-muted-foreground">{m.theme_base_note()}</span>
          </div>
          <div role="radiogroup" aria-label={m.theme_base()} className="flex flex-wrap gap-xs">
            {basePresets.map(({ id, hue, chroma }) => (
              <Swatch
                key={id}
                name="base"
                label={baseLabel[id]()}
                color={oklchHex(baseLightness, chroma * 3, hue)}
                checked={seed.baseHue === hue && seed.baseChroma === chroma}
                onChoose={() => changeSeed({ baseHue: hue, baseChroma: chroma })}
              />
            ))}
          </div>
          <label className="flex items-center gap-md text-label text-muted-foreground">
            <span className="w-label-col">{m.theme_hue()}</span>
            <Slider
              label={m.theme_hue_base()}
              min={0}
              max={360}
              value={seed.baseHue}
              format={(value) => `${value}°`}
              // A neutral base has no tint to turn, so moving the hue gives it the lightest one.
              onValueChange={([hue = 0]) => changeSeed({ baseHue: hue, baseChroma: seed.baseChroma || 0.016 })}
            />
          </label>
        </section>

        <section aria-label={m.theme_accent()} className={sectionClass}>
          <div className="flex items-baseline gap-sm">
            <h4 className="text-body font-semibold">{m.theme_accent()}</h4>
            <span className="text-label text-muted-foreground">{m.theme_accent_note()}</span>
          </div>
          <div role="radiogroup" aria-label={m.theme_accent()} className="flex flex-wrap gap-xs">
            {accentPresets.map(({ id, hue }) => (
              <Swatch
                key={id}
                name="accent"
                label={accentLabel[id]()}
                color={oklchHex(state.mode === 'dark' ? 0.78 : 0.52, 0.13, hue)}
                checked={seed.accentHue === hue}
                onChoose={() => changeSeed({ accentHue: hue })}
              />
            ))}
          </div>
          <label className="flex items-center gap-md text-label text-muted-foreground">
            <span className="w-label-col">{m.theme_hue()}</span>
            <Slider
              label={m.theme_hue_accent()}
              min={0}
              max={360}
              value={seed.accentHue}
              format={(value) => `${value}°`}
              onValueChange={([hue = 0]) => changeSeed({ accentHue: hue })}
            />
          </label>
        </section>

        <section aria-label={m.theme_contrast()} className={sectionClass}>
          <div className="flex items-center gap-sm">
            <h4 className="flex-1 text-body font-semibold">{m.theme_contrast()}</h4>
            <span className="text-body tabular-nums">{`${ratio.toLocaleString('it', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}:1`}</span>
            <Badge tone={rating === 'low' ? 'danger' : 'success'}>{ratingLabel[rating]()}</Badge>
          </div>
          <Slider
            label={m.theme_contrast()}
            min={0}
            max={100}
            value={seed.contrast}
            onValueChange={([contrast = 0]) => changeSeed({ contrast })}
          />
          <div className="flex justify-between text-caption text-muted-foreground">
            <span>{m.theme_contrast_soft()}</span>
            <span>{m.theme_contrast_sharp()}</span>
          </div>
          <div aria-live="polite" className="flex flex-col gap-2xs text-caption">
            {failures.length === 0 ? (
              <p className="text-muted-foreground">{m.theme_contrast_ok()}</p>
            ) : (
              failures.map(({ text, on, ratio: failed, min }) => (
                <p key={`${text}-${on}`} className="text-danger">
                  {m.theme_contrast_failure({
                    text: roleLabel[text](),
                    on: roleLabel[on](),
                    ratio: failed.toLocaleString('it'),
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
        </section>

        <DerivedRoles state={state} colors={colors} legacy={draft.values.seed === undefined} onChange={change} />
      </div>
      <footer className="flex justify-end gap-sm border-t border-border px-xl py-md">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-touch rounded-full border border-border px-lg text-label hover:bg-muted focus-visible:outline focus-visible:outline-accent"
        >
          {m.theme_cancel()}
        </button>
        <button
          type="submit"
          disabled={failures.length > 0 || save.isPending || !name.trim()}
          className="min-h-touch rounded-full bg-primary px-lg text-label text-primary-foreground hover:opacity-80 focus-visible:outline focus-visible:outline-accent disabled:opacity-60"
        >
          {m.theme_save()}
        </button>
      </footer>
    </form>
  );
}

/** A color to pick: a real radio, so the arrow keys move between the choices. */
function Swatch({
  name,
  label,
  color,
  checked,
  onChoose,
}: {
  name: string;
  label: string;
  color: string;
  checked: boolean;
  onChoose: () => void;
}) {
  return (
    <label
      className={`flex size-xl cursor-pointer rounded-full border-2 has-focus-visible:outline has-focus-visible:outline-accent ${
        checked ? 'border-foreground' : 'border-border'
      }`}
      style={{ background: color }}
    >
      <input type="radio" name={name} aria-label={label} checked={checked} onChange={onChoose} className="sr-only" />
    </label>
  );
}

/** The 12 roles. Touching one sets it by hand ("manuale"); its reset returns to what the seed derives. */
function DerivedRoles({
  state,
  colors,
  legacy,
  onChange,
}: {
  state: EditorState;
  colors: Colors;
  legacy: boolean;
  onChange: (patch: Partial<EditorState>) => void;
}) {
  function setRole(role: keyof Colors, hex: string) {
    // The hairline keeps its alpha: the color input only holds #rrggbb.
    const value = role === 'border' ? `${hex}${colors.border.slice(7) || '1a'}` : hex;
    onChange({ manual: { ...state.manual, [role]: value } });
  }
  function resetRole(role: keyof Colors) {
    const rest = { ...state.manual };
    delete rest[role];
    onChange({ manual: rest });
  }
  return (
    <details open={legacy} className="border-t border-dashed border-border pt-md">
      <summary className="flex min-h-touch cursor-pointer items-center gap-sm text-body font-semibold">
        {m.theme_derived()} ({roles.length})
      </summary>
      <p className="pb-sm text-label text-muted-foreground">
        {legacy ? m.theme_derived_legacy() : m.theme_derived_note()}
      </p>
      <ul>
        {roles.map((role) => {
          const manual = state.manual[role] !== undefined;
          return (
            <li key={role} className="flex min-h-touch items-center gap-sm border-t border-dashed border-border">
              <label className="flex flex-1 items-center gap-sm text-body">
                <input
                  type="color"
                  value={colors[role].slice(0, 7)}
                  onChange={(event) => setRole(role, event.target.value)}
                  className="size-lg shrink-0 cursor-pointer rounded-md border border-border bg-transparent"
                />
                {roleLabel[role]()}
              </label>
              {manual && (
                <>
                  <span className="rounded-md bg-muted px-xs text-caption">{m.theme_manual()}</span>
                  <button
                    type="button"
                    aria-label={m.theme_reset_role_named({ role: roleLabel[role]() })}
                    onClick={() => resetRole(role)}
                    className="min-h-touch rounded-full px-md text-label text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-accent"
                  >
                    {m.theme_reset_role()}
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
