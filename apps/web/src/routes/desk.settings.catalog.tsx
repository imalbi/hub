import { createFileRoute } from '@tanstack/react-router';
import { CatalogPage } from '../settings/catalog-page.tsx';

export const Route = createFileRoute('/desk/settings/catalog')({ component: CatalogPage });
