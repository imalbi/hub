import { m } from '../paraglide/messages.js';
import { useTheme } from './theme.tsx';
import { builtInThemes, caelestiaId, customId } from './themes.ts';

/** The phone's theme choice in one line: a native select (the iOS picker), no editor (that is on the desk). */
export function DeckThemeList() {
  const { theme, setTheme, custom, caelestiaStatus } = useTheme();
  const options = [
    ...builtInThemes.map((item) => ({ id: item.id, label: item.label() })),
    ...(caelestiaStatus === 'ok' ? [{ id: caelestiaId, label: m.theme_caelestia() }] : []),
    ...(custom ?? []).map((item) => ({ id: customId(item.id), label: item.name })),
  ];
  return (
    <label className="flex min-h-touch items-center justify-between gap-md text-label">
      {m.theme_title()}
      <select
        value={theme}
        onChange={(event) => setTheme(event.target.value)}
        className="min-h-touch rounded-full border border-border bg-surface px-md text-label text-foreground"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
