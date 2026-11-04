import { m } from '../paraglide/messages.js';
import { useTheme } from './theme.tsx';
import { builtInThemes, caelestiaId, customId } from './themes.ts';

/** The phone's theme choice: a compact radio group of every theme, no editor (that is on the desk). */
export function DeckThemeList() {
  const { theme, setTheme, custom, caelestiaStatus } = useTheme();
  const options = [
    ...builtInThemes.map((item) => ({ id: item.id, label: item.label() })),
    ...(caelestiaStatus === 'ok' ? [{ id: caelestiaId, label: m.theme_caelestia() }] : []),
    ...(custom ?? []).map((item) => ({ id: customId(item.id), label: item.name })),
  ];
  return (
    <fieldset className="flex flex-col gap-sm">
      <legend className="mb-sm text-label">{m.theme_title()}</legend>
      <div className="flex flex-wrap gap-xs">
        {options.map((option) => (
          <label
            key={option.id}
            className="flex min-h-touch cursor-pointer items-center rounded-full border border-border px-md text-label has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:outline has-focus-visible:outline-accent"
          >
            <input
              type="radio"
              name="deck-theme"
              checked={theme === option.id}
              onChange={() => setTheme(option.id)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
