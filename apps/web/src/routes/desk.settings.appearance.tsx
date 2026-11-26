import { createFileRoute } from '@tanstack/react-router';
import { ThemePanel } from '../theme/theme-panel.tsx';

export const Route = createFileRoute('/desk/settings/appearance')({ component: Appearance });

function Appearance() {
  return (
    <div className="flex flex-col gap-lg">
      <ThemePanel />
    </div>
  );
}
