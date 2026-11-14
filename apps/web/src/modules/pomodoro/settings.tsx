import { useMutation } from '@tanstack/react-query';
import { SlidersHorizontalIcon } from '@phosphor-icons/react';
import { useRef } from 'react';
import type { inferRouterInputs } from '@trpc/server';
import type { AppRouter } from '@hub/server';
import { RegistryButton } from '../../components/registry-button.tsx';
import { Popover } from '../../components/ui/popover.tsx';
import { useTRPC } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';

type Settings = inferRouterInputs<AppRouter>['pomodoro']['configure'];

// The owner's usual first. Matching a preset compares durations only; sound is its own switch.
const presets = [
  { focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 15, longBreakEvery: 0 },
  { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 },
];

function describe(preset: (typeof presets)[number]) {
  const values = { focus: preset.focusMinutes, pause: preset.shortBreakMinutes };
  return preset.longBreakEvery === 0
    ? m.pomodoro_preset_no_long(values)
    : m.pomodoro_preset_long({ ...values, long: preset.longBreakMinutes, every: preset.longBreakEvery });
}

/** A gear in the Pomodoro panel opening a popover anchored to it: presets, custom durations and the sound switch. */
export function PomodoroSettings({ settings }: { settings: Settings | undefined }) {
  const trpc = useTRPC();
  const configure = useMutation(trpc.pomodoro.configure.mutationOptions());
  const form = useRef<HTMLFormElement>(null);
  const current = presets.find(
    (preset) =>
      settings &&
      preset.focusMinutes === settings.focusMinutes &&
      preset.shortBreakMinutes === settings.shortBreakMinutes &&
      preset.longBreakMinutes === settings.longBreakMinutes &&
      preset.longBreakEvery === settings.longBreakEvery,
  );

  function save(next: Partial<Settings>) {
    if (!settings) return Promise.resolve();
    return configure.mutateAsync({ ...settings, ...next });
  }

  function saveCustom(fields: HTMLFormElement) {
    const value = (name: string) => Number(new FormData(fields).get(name));
    return save({
      focusMinutes: value('focusMinutes'),
      shortBreakMinutes: value('shortBreakMinutes'),
      longBreakMinutes: value('longBreakMinutes'),
      longBreakEvery: value('longBreakEvery'),
    });
  }

  const fields = [
    { name: 'focusMinutes', label: m.pomodoro_focus_minutes(), min: 1 },
    { name: 'shortBreakMinutes', label: m.pomodoro_short_minutes(), min: 1 },
    { name: 'longBreakMinutes', label: m.pomodoro_long_minutes(), min: 1 },
    { name: 'longBreakEvery', label: m.pomodoro_long_every(), min: 0 },
  ] as const;

  return (
    <Popover
      label={m.pomodoro_settings()}
      align="end"
      trigger={
        <button
          type="button"
          aria-label={m.pomodoro_settings()}
          title={m.pomodoro_settings()}
          disabled={!settings}
          className="flex size-touch items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-accent disabled:opacity-40"
        >
          <SlidersHorizontalIcon className="size-icon" aria-hidden />
        </button>
      }
    >
      {settings && (
        <div className="flex flex-col gap-lg">
          <h2 className="text-title">{m.pomodoro_settings()}</h2>
          <fieldset className="flex flex-col gap-sm">
            <legend className="mb-sm text-label">{m.pomodoro_durations()}</legend>
            <div className="flex gap-xs">
              {presets.map((preset) => (
                <label
                  key={preset.focusMinutes}
                  title={describe(preset)}
                  className="flex min-h-touch cursor-pointer items-center rounded-full border border-border px-lg text-label tabular-nums hover:bg-muted has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:outline has-focus-visible:outline-accent"
                >
                  <input
                    type="radio"
                    name="preset"
                    checked={current === preset}
                    onChange={() => void save(preset).catch(() => {})}
                    aria-label={describe(preset)}
                    className="sr-only"
                  />
                  {m.pomodoro_preset({ focus: preset.focusMinutes, pause: preset.shortBreakMinutes })}
                </label>
              ))}
            </div>
          </fieldset>
          {/* Keyed on the saved values, so the fields show them again after a save or a preset. */}
          <form
            ref={form}
            key={JSON.stringify(settings)}
            onSubmit={(event) => event.preventDefault()}
            className="flex flex-col gap-sm"
          >
            <p className="text-label">{m.pomodoro_custom()}</p>
            <div className="grid grid-cols-2 gap-sm">
              {fields.map((field) => (
                <label key={field.name} className="flex flex-col gap-2xs text-caption text-muted-foreground">
                  {field.label}
                  <input
                    type="number"
                    name={field.name}
                    required
                    min={field.min}
                    max={field.name === 'longBreakEvery' ? 100 : 1440}
                    step={1}
                    defaultValue={settings[field.name]}
                    className="min-h-touch rounded-md border border-border bg-surface px-sm text-body text-foreground tabular-nums"
                  />
                </label>
              ))}
            </div>
            <RegistryButton
              secondary
              label={m.pomodoro_save()}
              className="self-start"
              action={async () => {
                if (!form.current?.reportValidity()) throw new Error('Invalid durations');
                await saveCustom(form.current);
              }}
            />
          </form>
          <label className="flex min-h-touch cursor-pointer items-center justify-between gap-md text-label">
            {m.pomodoro_sound()}
            <input
              type="checkbox"
              role="switch"
              aria-checked={settings.sound}
              checked={settings.sound}
              onChange={(event) => void save({ sound: event.target.checked }).catch(() => {})}
              className="switch"
            />
          </label>
          <p className="text-caption text-muted-foreground">{m.pomodoro_settings_note()}</p>
        </div>
      )}
    </Popover>
  );
}
