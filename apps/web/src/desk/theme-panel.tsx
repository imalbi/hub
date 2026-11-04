import { Panel } from '../components/panel.tsx';
import { m } from '../paraglide/messages.js';
import { useDeskTheme } from './theme.tsx';
export function ThemePanel({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useDeskTheme();
  return (
    <Panel title={m.theme_title()} className={className}>
      <div className="flex flex-wrap gap-xs">
        <button
          type="button"
          aria-pressed={theme === 'ink'}
          onClick={() => setTheme('ink')}
          className={`min-h-touch rounded-full border border-border px-md text-label focus-visible:outline focus-visible:outline-accent ${theme === 'ink' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
        >
          {m.theme_ink()}
        </button>
        <button
          type="button"
          aria-pressed={theme === 'paper'}
          onClick={() => setTheme('paper')}
          className={`min-h-touch rounded-full border border-border px-md text-label focus-visible:outline focus-visible:outline-accent ${theme === 'paper' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
        >
          {m.theme_paper()}
        </button>
      </div>
    </Panel>
  );
}
