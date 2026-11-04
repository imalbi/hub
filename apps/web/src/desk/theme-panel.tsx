import { Panel } from '../components/panel.tsx';
import { m } from '../paraglide/messages.js';
import { useDeskTheme } from './theme.tsx';
import { ThemeToggle } from '../components/ui/theme-toggle.tsx';
export function ThemePanel({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useDeskTheme();
  return (
    <Panel title={m.theme_title()} className={className}>
      <ThemeToggle
        variant="segmented"
        className="self-start"
        reveal={false}
        value={theme === 'ink' ? 'dark' : 'light'}
        onValueChange={(value) => setTheme(value === 'dark' ? 'ink' : 'paper')}
        options={[
          { value: 'dark', label: m.theme_ink() },
          { value: 'light', label: m.theme_paper() },
        ]}
        aria-label={m.theme_title()}
      />
      <p className="text-caption text-muted-foreground">{theme === 'ink' ? m.theme_ink() : m.theme_paper()}</p>
    </Panel>
  );
}
