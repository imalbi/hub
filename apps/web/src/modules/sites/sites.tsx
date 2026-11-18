import { LoadingSkeleton } from '../../components/ui/loading-skeleton.tsx';
import { EmptyState } from '../../components/ui/empty-state.tsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, useSubscription, type ofFeatureFlags } from '@trpc/tanstack-react-query';
import type { sitesModule } from '../../../../server/src/modules/sites/server.ts';
import type { AnyRouter } from '@trpc/server';
import { createModuleClient } from '../../lib/module-client.ts';
import { StatusBars, type DayStatus, type StatusBarsCopy } from '../../components/ui/status-bars.tsx';
import { Panel } from '../../components/panel.tsx';
import { m } from '../../paraglide/messages.js';

type SitesRouter = Extract<ReturnType<typeof sitesModule.create>['router'], AnyRouter>;
const client = createModuleClient<typeof sitesModule>('sites');
function useSitesTRPC() {
  const queryClient = useQueryClient();
  return createTRPCOptionsProxy<SitesRouter, ofFeatureFlags<{ keyPrefix: true }>>({
    client,
    queryClient,
    keyPrefix: 'sites',
  });
}
export function useSites() {
  const trpc = useSitesTRPC();
  return useSubscription(trpc.onState.subscriptionOptions());
}
export function useSitesConfigured(enabled: boolean) {
  const trpc = useSitesTRPC();
  return useQuery(trpc.configured.queryOptions(undefined, { enabled, retry: false, staleTime: Infinity }));
}
function statusLabel(status: DayStatus) {
  return { operational: m.sites_operational, degraded: m.sites_degraded, major: m.sites_major, none: m.sites_none }[
    status
  ]();
}
function overall(status: DayStatus) {
  return { operational: m.sites_all, degraded: m.sites_some_degraded, major: m.sites_some_down, none: m.sites_unknown }[
    status
  ]();
}
const copy: StatusBarsCopy = {
  overall,
  status: statusLabel,
  day: (date, status, minutes) => m.sites_day({ date, status: statusLabel(status), minutes }),
  help: m.sites_help(),
  latency: (ms) => m.sites_latency({ ms }),
  uptime: m.sites_uptime(),
  daysAgo: (days) => m.sites_ago({ days }),
  today: m.sites_today(),
  services: m.sites_title(),
};
export function SitesSection() {
  const sites = useSites();
  if (sites.error) return <p>{m.sites_error()}</p>;
  if (!sites.data) return <LoadingSkeleton label={m.tile_loading()} rows={4} />;
  if (!sites.data.length) return <EmptyState title={m.sites_empty()} />;
  const services = sites.data.map((site) => {
    const status: DayStatus = !site.latest
      ? 'none'
      : site.latest.status === null || site.latest.status >= 400
        ? 'major'
        : 'operational';
    return {
      id: site.url,
      name: site.name,
      status,
      latency: site.latest?.latency ?? null,
      uptime: site.uptime,
      days: site.days.map((day, index) => ({ ...day, status: index === site.days.length - 1 ? status : day.status })),
    };
  });
  return <StatusBars services={services} copy={copy} />;
}
export function SitesWidget() {
  const sites = useSites();
  const down = sites.data?.filter((site) => site.latest && (site.latest.status === null || site.latest.status >= 400));
  return (
    <Panel title={m.sites_title()} className="h-full">
      {sites.error ? (
        m.sites_error()
      ) : !down ? (
        <LoadingSkeleton label={m.tile_loading()} rows={2} />
      ) : down.length ? (
        <ul>
          {down.map((site) => (
            <li key={site.url}>{site.name}</li>
          ))}
        </ul>
      ) : (
        m.sites_no_down()
      )}
    </Panel>
  );
}
