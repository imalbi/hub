import { createFileRoute } from '@tanstack/react-router';
import { DeskShell } from '../shell/desk.tsx';

export const Route = createFileRoute('/desk')({ component: DeskShell });
