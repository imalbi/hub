import { useNavigate } from '@tanstack/react-router';
import { TimerIcon } from '@phosphor-icons/react';
import { Badge } from '../components/ui/badge.tsx';
import { LiveActivity } from '../components/ui/live-activity.tsx';
import { m } from '../paraglide/messages.js';
import { usePomodoro } from '../modules/pomodoro/use-pomodoro.ts';
import { useJobs } from '../modules/jobs/jobs.tsx';

export function HeaderActivity() {
  const timer = usePomodoro();
  const running = useJobs().filter((job) => job.status === 'running').length;
  const navigate = useNavigate();
  const timing = Boolean(timer.state && timer.state.phase !== 'idle');
  // Only while something runs; the idle desk has nothing floating.
  if (running === 0 && !timing) return null;
  return (
    <section aria-label={m.activity_running()} className="desk-glass flex items-center gap-xs rounded-full border p-xs">
      {running > 0 && (
        <button
          type="button"
          className="rounded-full"
          onClick={() => void navigate({ to: '/desk/system', search: { tab: 'jobs' } })}
        >
          <Badge>{m.jobs_running({ count: running })}</Badge>
        </button>
      )}
      <LiveActivity
        bare
        expanded={false}
        triggerLabel={m.zone_open({ zone: m.zone_study() })}
        announcement={timing ? timer.phaseLabel : ''}
        onExpandedChange={(expanded) => {
          if (expanded) void navigate({ to: '/desk/studio' });
        }}
        activity={
          timing
            ? {
                id: 'pomodoro',
                label: m.pomodoro_activity({ phase: timer.phaseLabel, time: timer.time }),
                progress: timer.progress,
                icon: <TimerIcon className="size-icon" aria-hidden />,
              }
            : null
        }
      />
    </section>
  );
}
