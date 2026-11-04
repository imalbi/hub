import { Link } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { Check } from 'lucide-react';
import { Panel } from '../components/panel.tsx';
import { m } from '../paraglide/messages.js';
import { useConnectionLost, useTRPC } from '../trpc.ts';
export function AudioPanel({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const trpc = useTRPC();
  const audio = useSubscription(trpc.audio.onState.subscriptionOptions());
  const cycle = useMutation(trpc.audio.cycleOutput.mutationOptions());
  const stale = useConnectionLost();
  return (
    <Panel
      title={m.tile_audio_output()}
      className={`${className} ${stale ? 'opacity-60' : ''}`}
      action={
        compact ? (
          <Link to="/desk/media" className="text-caption text-muted-foreground hover:text-foreground">
            {m.zone_open({ zone: m.zone_media() })}
          </Link>
        ) : undefined
      }
    >
      <p className="text-title">
        {audio.data
          ? (audio.data.current?.label ?? m.audio_output_none())
          : stale
            ? m.tile_unavailable()
            : m.tile_loading()}
      </p>
      {!compact && (
        <>
          <ul className="flex flex-col gap-sm" aria-label={m.audio_outputs()}>
            {audio.data?.outputs.map((output) => (
              <li key={output.label} className="flex items-center justify-between gap-md text-label">
                <span>{output.label}</span>
                {audio.data?.current?.label === output.label ? (
                  <span className="flex items-center gap-xs text-caption">
                    <Check className="size-icon-sm" aria-hidden />
                    {m.audio_output_active()}
                  </span>
                ) : !output.available ? (
                  <span className="text-caption text-muted-foreground">{m.tile_unavailable()}</span>
                ) : undefined}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={cycle.isPending || stale || !audio.data?.outputs.some((output) => output.available)}
            aria-busy={cycle.isPending}
            onClick={() => cycle.mutate()}
            className="min-h-touch self-start rounded-full border border-border px-md py-xs text-label hover:bg-muted focus-visible:outline focus-visible:outline-accent disabled:opacity-60"
          >
            {m.audio_change()}
          </button>
          {cycle.isError && (
            <p role="alert" className="text-caption text-danger">
              {m.tile_error()}
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
