import { useNavigate } from '@tanstack/react-router';
import { TimerIcon } from '@phosphor-icons/react';
import { Badge } from '../components/ui/badge.tsx';
import { LiveActivity } from '../components/ui/live-activity.tsx';
import { m } from '../paraglide/messages.js';
import { usePomodoro } from '../modules/pomodoro/use-pomodoro.ts';
import { useConnectionLost } from '../lib/trpc.ts';
import { useJobs } from '../modules/jobs/jobs.tsx';

export function HeaderActivity() {
  const timer = usePomodoro();
  const running = useJobs().filter((job) => job.status === 'running').length;
  const lost = useConnectionLost();
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-md">
      {running > 0 && (
        <button type="button" onClick={() => void navigate({ to: '/desk/system', search: { tab: 'jobs' } })}>
          <Badge>{m.jobs_running({ count: running })}</Badge>
        </button>
      )}
      <LiveActivity
        expanded={false}
        triggerLabel={m.zone_open({ zone: m.zone_study() })}
        announcement={timer.state && timer.state.phase !== 'idle' ? timer.phaseLabel : ''}
        onExpandedChange={(expanded) => {
          if (expanded) void navigate({ to: '/desk/studio' });
        }}
        activity={
          timer.state && timer.state.phase !== 'idle'
            ? {
                id: 'pomodoro',
                label: m.pomodoro_activity({ phase: timer.phaseLabel, time: timer.time }),
                progress: timer.progress,
                icon: <TimerIcon className="size-icon" aria-hidden />,
              }
            : null
        }
      />
      <output aria-label={m.server_connection()} className={`transition-opacity ${lost ? 'opacity-60' : ''}`}>
        <Badge dot={lost ? true : 'pulse'} outline>
          {lost ? m.connection_lost() : m.connection_ready()}
        </Badge>
      </output>
      <span className="text-label text-muted-foreground">{m.desk_title()}</span>
    </div>
  );
}
