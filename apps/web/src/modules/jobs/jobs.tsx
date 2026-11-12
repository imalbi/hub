import { useMutation } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useCallback, useState } from 'react';
import { HoldButton } from '../../components/hold-button.tsx';
import { LogStream, type LogLine } from '../../components/ui/log-stream.tsx';
import { useTRPC, useTRPCClient } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';
import { useNow } from '../../lib/use-now.ts';

export function useJobs() {
  const trpc = useTRPC();
  return useSubscription(trpc.jobs.onUpdate.subscriptionOptions()).data ?? [];
}

const statusLabels: Record<string, () => string> = {
  queued: m.jobs_status_queued,
  running: m.jobs_status_running,
  completed: m.jobs_status_completed,
  failed: m.jobs_status_failed,
  timeout: m.jobs_status_timeout,
  cancelled: m.jobs_cancelled,
};

type Line = { id: number; at: number; stream: 'stdout' | 'stderr'; message: string };
function toLog(line: Line): LogLine {
  return { id: String(line.id), at: line.at, level: line.stream === 'stdout' ? 'info' : 'warn', message: line.message };
}

function JobOutput({ jobId }: { jobId: string }) {
  const client = useTRPCClient();
  // The socket subscription must survive unrelated parent renders.
  const subscribe = useCallback(
    (push: (lines: LogLine | LogLine[]) => void) => {
      let ready = false;
      let stopped = false;
      const pending: Line[] = [];
      const sub = client.jobs.onOutput.subscribe(
        { jobId },
        {
          onStarted() {
            if (ready || stopped) return;
            void client.jobs.output
              .query({ jobId })
              .then((lines) => {
                if (stopped) return;
                const merged = new Map([...lines, ...pending].map((line) => [line.id, line]));
                push([...merged.values()].toSorted((a, b) => a.id - b.id).map(toLog));
                ready = true;
              })
              .catch(() => {
                if (!stopped) {
                  push(pending.map(toLog));
                  ready = true;
                }
              });
          },
          onData(line) {
            if (ready) push(toLog(line));
            else pending.push(line);
          },
        },
      );
      return () => {
        stopped = true;
        sub.unsubscribe();
      };
    },
    [client, jobId],
  );
  return (
    <LogStream
      subscribe={subscribe}
      copy={{
        title: m.jobs_log_title(),
        live: m.jobs_live(),
        paused: m.jobs_paused(),
        waiting: m.jobs_waiting(),
        newLines: m.jobs_new(),
        search: m.jobs_search(),
        levels: m.jobs_levels(),
        errors: m.jobs_errors(),
        warnings: m.jobs_warnings(),
        info: m.jobs_info(),
        debug: m.jobs_debug(),
        copied: m.jobs_copied(),
        copy: m.jobs_copy(),
        bottom: m.jobs_bottom(),
        start: m.jobs_log_start(),
        loading: m.jobs_log_loading(),
        earlier: m.jobs_log_earlier(),
        noMatch: m.jobs_no_match(),
        firstLine: m.jobs_first_line(),
        resumed: (count) => m.jobs_resumed({ count }),
        held: m.jobs_held(),
      }}
    />
  );
}

export function JobsPage() {
  const jobs = useJobs();
  const trpc = useTRPC();
  const cancel = useMutation(trpc.jobs.cancel.mutationOptions());
  const [selected, setSelected] = useState<string | null>(null);
  const now = useNow(jobs.some((job) => job.status === 'running') ? 'clock' : null);
  const current = jobs.find((job) => job.id === selected) ?? jobs[0];
  return (
    <div className="flex min-h-0 flex-1 gap-lg pb-xl">
      <section aria-label={m.jobs_title()} className="flex w-1/3 min-w-0 flex-col gap-sm overflow-y-auto">
        {jobs.length === 0 && <p>{m.jobs_empty()}</p>}
        {jobs.map((job) => (
          <button
            type="button"
            key={job.id}
            onClick={() => setSelected(job.id)}
            aria-pressed={current?.id === job.id}
            className="rounded-lg border border-border p-md text-left"
          >
            <span className="block">{job.action}</span>
            <span className="text-muted-foreground">
              {statusLabels[job.status]?.()} · {new Date(job.startedAt).toLocaleString('it-IT')} ·{' '}
              {m.jobs_duration({ seconds: Math.max(0, Math.floor(((job.endedAt ?? now) - job.startedAt) / 1000)) })}
            </span>
          </button>
        ))}
      </section>
      <section aria-label={m.jobs_log_title()} className="flex min-h-0 min-w-0 flex-1 flex-col gap-md">
        {current && (
          <>
            {(current.status === 'queued' || current.status === 'running') && (
              <HoldButton
                className="self-start"
                label={m.jobs_cancel_hold()}
                idle={m.jobs_cancel()}
                done={m.jobs_cancelled()}
                onConfirm={() => cancel.mutateAsync({ jobId: current.id, confirmed: true })}
              />
            )}
            <JobOutput key={current.id} jobId={current.id} />
          </>
        )}
      </section>
    </div>
  );
}
