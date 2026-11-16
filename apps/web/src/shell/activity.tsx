import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react';
import { useRouter } from '@tanstack/react-router';
import { MusicNoteIcon, SkipForwardIcon, TerminalIcon, TimerIcon } from '@phosphor-icons/react';
import { RegistryButton } from '../components/registry-button.tsx';
import { Popover } from '../components/ui/popover.tsx';
import { useLiveModuleUIs } from '../lib/enabled-modules.ts';
import type { ModuleActivity, ModuleActivityHook } from '../lib/module-ui.ts';
import { useNow } from '../lib/use-now.ts';
import { useJobs } from '../modules/jobs/jobs.tsx';
import { Cover, PlaybackIcon } from '../modules/media/controls.tsx';
import { useMedia } from '../modules/media/media-provider.tsx';
import { time } from '../modules/media/player-bar.tsx';
import { usePomodoro } from '../modules/pomodoro/use-pomodoro.ts';
import { m } from '../paraglide/messages.js';

type Spot = { x: number; y: number };
const spotKey = 'hub.ball';

function readSpot(): Spot {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(spotKey) ?? 'null');
    if (value && typeof value === 'object' && 'x' in value && 'y' in value) {
      const { x, y } = value;
      if (typeof x === 'number' && typeof y === 'number') return { x, y };
    }
  } catch {
    /* No stored spot: the default corner. */
  }
  return { x: 0, y: 0 };
}

function saveSpot(spot: Spot) {
  try {
    if (spot.x === 0 && spot.y === 0) localStorage.removeItem(spotKey);
    else localStorage.setItem(spotKey, JSON.stringify(spot));
  } catch {
    /* Not kept: it still moves for this visit. */
  }
}

/**
 * The ball goes where the owner drags it (owner 2026-11-14), with Motion's drag inside the window: top left by
 * default, the offset kept per device, a double click glides it back. The click that ends a drag does not open the
 * panel (Motion does not swallow it).
 */
function useDraggableBall() {
  const [initial] = useState(readSpot);
  const x = useMotionValue(initial.x);
  const y = useMotionValue(initial.y);
  const bounds = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const reduced = useReducedMotion();
  return {
    bounds,
    props: {
      drag: true,
      dragMomentum: false,
      dragElastic: 0,
      style: { x, y },
      onDragStart() {
        dragged.current = true;
      },
      onDragEnd() {
        saveSpot({ x: x.get(), y: y.get() });
      },
      onClickCapture(event: MouseEvent<HTMLDivElement>) {
        if (!dragged.current) return;
        dragged.current = false;
        event.stopPropagation();
        event.preventDefault();
      },
      onDoubleClick() {
        const transition = reduced ? { duration: 0 } : { type: 'spring' as const, bounce: 0.2, duration: 0.4 };
        void animate(x, 0, transition);
        void animate(y, 0, transition);
        saveSpot({ x: 0, y: 0 });
      },
    },
  };
}

/** One thing in progress: what the ball counts and what the panel lists. */
type Item = {
  id: string;
  title: string;
  /** In the ball's accessible name. */
  summary: string;
  detail: string;
  progress?: number;
  /** Written in the middle of the ball instead of the icon (Pomodoro's countdown). */
  clock?: string;
  /** The row's leading mark when it is not a ring around an icon. */
  lead?: ReactNode;
  icon: ReactNode;
  href: string;
  /** Buttons that act without leaving the page; they sit above the row's link, at its end or `below` its text. */
  controls?: ReactNode;
  below?: ReactNode;
};

const iconClass = 'size-icon';

/**
 * A thin progress line on the outer edge: a round-capped arc from 12 o'clock over a track, drawn in the viewBox so it
 * scales with the rem size of the ball and the rows. The ball's own glass border is its track, so it passes none.
 */
function Arc({ progress, track = false }: { progress?: number; track?: boolean }) {
  // Viewbox units, not sizes: a 3-unit line centred at 48.5 lies on the edge, over the ball's 1px border.
  const circle = { cx: 50, cy: 50, r: 48.5, fill: 'none', strokeWidth: 3 };
  return (
    <svg aria-hidden viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full -rotate-90">
      {track && <circle {...circle} stroke="var(--border)" />}
      {progress !== undefined && progress > 0 && (
        <circle
          {...circle}
          stroke="var(--foreground)"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray={`${Math.min(progress, 1) * 100} 100`}
        />
      )}
    </svg>
  );
}

/** A disc with its content, and the progress line around it. */
function Ring({ progress, className, children }: { progress?: number; className: string; children: ReactNode }) {
  return (
    <span aria-hidden className={`relative grid shrink-0 place-items-center rounded-full p-2xs ${className}`}>
      <Arc progress={progress} track />
      <span className="grid size-full place-items-center rounded-full bg-background">{children}</span>
    </span>
  );
}

/** Runs a module's activity hook in a component of its own and reports the result up; null when it unmounts. */
function Probe({
  id,
  useActivity,
  report,
}: {
  id: string;
  useActivity: ModuleActivityHook;
  report: (id: string, activity: ModuleActivity | null) => void;
}) {
  // Not named `use`: the React Compiler treats that name as React's `use` and may skip the call, which breaks hook order.
  const activity = useActivity();
  const key = JSON.stringify(activity);
  useEffect(() => {
    report(id, activity);
    // The serialised value is the dependency: a hook may return a fresh object on every render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key, report]);
  useEffect(() => () => report(id, null), [id, report]);
  return null;
}

function useItems(reported: Record<string, ModuleActivity | null>) {
  const timer = usePomodoro();
  const jobs = useJobs().filter((job) => job.status === 'running');
  const media = useMedia();
  const now = useNow(jobs.length > 0 ? 'clock' : null);
  const items: Item[] = [];
  if (timer.state && timer.phase !== 'idle') {
    items.push({
      id: 'pomodoro',
      title: m.pomodoro_title(),
      summary: `${timer.phaseLabel.toLowerCase()}, ${timer.time}`,
      detail: m.pomodoro_activity({ phase: timer.phaseLabel, time: timer.time }),
      progress: timer.progress,
      clock: timer.time,
      icon: <TimerIcon className={iconClass} aria-hidden />,
      href: '/desk/studio',
      below: (
        <div className="flex gap-xs pt-xs">
          <RegistryButton label={timer.primaryLabel} action={() => timer.act(timer.primaryAction)} />
          <RegistryButton secondary label={m.pomodoro_skip()} action={() => timer.skip()} />
          <RegistryButton secondary label={m.pomodoro_stop()} action={() => timer.stop()} />
        </div>
      ),
    });
  }
  for (const [index, job] of jobs.entries()) {
    items.push({
      id: `job-${job.id}`,
      title: job.action,
      // The ball's name counts the jobs once ("2 job"), not once per job.
      summary: index === 0 ? m.activity_jobs_count({ count: jobs.length }) : '',
      detail: m.activity_job_elapsed({ time: time(Math.max(0, Math.floor((now - job.startedAt) / 1000))) }),
      icon: <TerminalIcon className={iconClass} aria-hidden />,
      href: '/desk/system?tab=jobs',
    });
  }
  const track = media.state;
  if (track && (track.status === 'Playing' || track.status === 'Paused')) {
    const length = track.lengthMs ? Math.floor(track.lengthMs / 1000) : 0;
    const position = Math.floor((track.positionMs ?? 0) / 1000);
    items.push({
      id: 'music',
      title: track.title || m.media_nothing_playing(),
      summary: track.title,
      detail: length
        ? m.activity_track({ artist: track.artist, position: time(position), length: time(length) })
        : track.artist,
      progress: length ? Math.min(1, position / length) : undefined,
      lead: <Cover className="size-touch shrink-0 rounded-lg" />,
      icon: <MusicNoteIcon className={iconClass} aria-hidden />,
      href: '/desk/media',
      controls: (
        <div className="flex gap-xs">
          <RegistryButton
            iconOnly
            label={media.playing ? m.media_action_pause() : m.media_action_play()}
            action={() => media.playPause.mutateAsync()}
            disabled={media.disabled}
            icon={<PlaybackIcon />}
          />
          <RegistryButton
            iconOnly
            secondary
            label={m.media_next()}
            action={() => media.next.mutateAsync()}
            disabled={media.disabled}
            icon={<SkipForwardIcon className={iconClass} aria-hidden />}
          />
        </div>
      ),
    });
  }
  for (const [id, activity] of Object.entries(reported)) {
    if (!activity) continue;
    items.push({
      id,
      title: activity.label,
      summary: activity.label,
      detail: activity.detail,
      progress: activity.progress,
      icon: <TerminalIcon className={iconClass} aria-hidden />,
      href: activity.href,
    });
  }
  return items;
}

function ActivityRow({ item, onOpen }: { item: Item; onOpen: (href: string) => void }) {
  return (
    <li className="relative flex flex-col gap-sm border-t border-dashed border-border py-md first:border-t-0 first:pt-0 last:pb-0">
      <div className={`flex gap-md ${item.below ? 'items-start' : 'items-center'}`}>
        {item.lead ?? (
          <Ring progress={item.progress} className="size-touch">
            {item.icon}
          </Ring>
        )}
        <div className="min-w-0 flex-1">
          {/* The title stretches over the whole row (`after:inset-0`), so the row is one link; the controls sit above it (`z-10`). */}
          <button
            type="button"
            aria-label={m.activity_open({ title: item.title })}
            className="block max-w-full truncate text-left text-body font-semibold after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => onOpen(item.href)}
          >
            {item.title}
          </button>
          <p className="truncate text-label text-muted-foreground">{item.detail}</p>
          {item.below && <div className="relative z-10 w-fit">{item.below}</div>}
        </div>
        {item.controls && <div className="relative z-10">{item.controls}</div>}
      </div>
    </li>
  );
}

/**
 * The "Attività in corso" ball (step 47c), floating over everything where the owner dragged it (top left by default) and present only while something is in
 * progress: Pomodoro, running jobs, a playing or paused track, and what modules report through `ModuleUI.activities`.
 * The ring follows the first item with progress (Pomodoro first), a count badge shows when more than one runs, and a
 * click opens the panel of what is running. Each row is a link to its page; its own buttons act without navigating.
 */
export function ActivityBall() {
  const router = useRouter();
  const uis = useLiveModuleUIs();
  const hooks = uis.flatMap((ui) =>
    [ui.activities ?? []].flat().map((hook, index) => ({ hook, id: `${ui.name}-${index}` })),
  );
  const [reported, setReported] = useState<Record<string, ModuleActivity | null>>({});
  const report = useCallback((id: string, activity: ModuleActivity | null) => {
    setReported((previous) =>
      JSON.stringify(previous[id] ?? null) === JSON.stringify(activity) ? previous : { ...previous, [id]: activity },
    );
  }, []);
  const items = useItems(reported);
  const first = items.find((item) => item.progress !== undefined) ?? items[0];
  const pomodoro = items.find((item) => item.id === 'pomodoro');
  const { bounds, props: dragProps } = useDraggableBall();
  return (
    <>
      {hooks.map(({ hook, id }) => (
        <Probe key={id} id={id} useActivity={hook} report={report} />
      ))}
      {first && (
        <>
          {/* The window is the drag area: the ball never leaves the screen. */}
          <div ref={bounds} aria-hidden className="pointer-events-none fixed inset-0" />
          <motion.div
            data-activity-ball
            className="fixed top-md left-md z-30 touch-none"
            dragConstraints={bounds}
            {...dragProps}
          >
            <Popover
              align="start"
              size="md"
              className="desk-glass rounded-xl p-lg"
              label={m.activity_running()}
              trigger={
                <button
                  type="button"
                  aria-label={m.activity_ball({
                    items: items
                      .map((item) => item.summary)
                      .filter(Boolean)
                      .join(', '),
                  })}
                  className="desk-glass relative grid size-ball place-items-center rounded-full border p-2xs"
                >
                  {first.progress !== undefined && <Arc progress={first.progress} />}
                  <span className="grid size-full place-items-center rounded-full bg-background text-label font-semibold tabular-nums">
                    {pomodoro?.clock ?? first.icon}
                  </span>
                  {items.length > 1 && (
                    <span
                      aria-hidden
                      className="absolute -bottom-3xs -left-2xs grid h-lg min-w-lg place-items-center rounded-full bg-foreground px-xs text-caption font-semibold text-background"
                    >
                      {items.length}
                    </span>
                  )}
                </button>
              }
            >
              {({ close }) => (
                <>
                  <p className="pb-md text-label text-muted-foreground">{m.activity_heading()}</p>
                  <ul className="flex flex-col">
                    {items.map((item) => (
                      <ActivityRow
                        key={item.id}
                        item={item}
                        onOpen={(href) => {
                          close();
                          router.history.push(href);
                        }}
                      />
                    ))}
                  </ul>
                </>
              )}
            </Popover>
          </motion.div>
        </>
      )}
    </>
  );
}
