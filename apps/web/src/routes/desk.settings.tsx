import { createFileRoute } from '@tanstack/react-router';
import { SettingsLayout } from '../settings/settings-layout.tsx';

export const Route = createFileRoute('/desk/settings')({ component: SettingsLayout });
