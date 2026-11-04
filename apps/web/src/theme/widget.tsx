import { ThemePanel } from './theme-panel.tsx';

// The same picker at both sizes; the editor opens in a side sheet, so the cell never has to grow.
export function ThemeWidget() {
  return <ThemePanel className="min-h-full" />;
}
