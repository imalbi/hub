import { createFileRoute } from '@tanstack/react-router';
import { CoreSettings } from '../settings/core-page.tsx';

export const Route = createFileRoute('/desk/settings/core')({ component: CoreSettings });
