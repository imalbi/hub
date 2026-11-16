import { createFileRoute, redirect } from '@tanstack/react-router';

// Replace, so the back button never lands on an empty Impostazioni.
export const Route = createFileRoute('/desk/settings/')({
  beforeLoad: () => {
    throw redirect({ to: '/desk/settings/appearance', replace: true });
  },
});
