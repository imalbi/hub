import { useMutation } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useState } from 'react';
import { m } from '../../paraglide/messages.js';
import { useConnectionLost, useTRPC } from '../../lib/trpc.ts';
import { useNow } from '../../lib/use-now.ts';

type Action = 'start' | 'pause' | 'resume' | 'skip' | 'stop';

export function usePomodoro(tag?: string) {
  const trpc = useTRPC();
  const connectionLost = useConnectionLost();
  // The server's clock minus ours, from the latest push: the countdown runs on the server's time.
  const [offset, setOffset] = useState(0);
  const subscription = useSubscription({
    ...trpc.pomodoro.onState.subscriptionOptions(),
    onData: (data) => setOffset(data.serverNow - Date.now()),
  });
  const mutations = {
    start: useMutation(trpc.pomodoro.start.mutationOptions()),
    pause: useMutation(trpc.pomodoro.pause.mutationOptions()),
    resume: useMutation(trpc.pomodoro.resume.mutationOptions()),
    skip: useMutation(trpc.pomodoro.skip.mutationOptions()),
    stop: useMutation(trpc.pomodoro.stop.mutationOptions()),
    startTagged: useMutation(trpc.pomodoro.startTagged.mutationOptions()),
  };
  const state = subscription.data;
  const endsAt = state?.endsAt ?? null;
  const now = useNow(endsAt, offset);
  const paused = state?.pausedRemainingMs !== null && state?.pausedRemainingMs !== undefined;
  const remainingMs = Math.max(0, state?.pausedRemainingMs ?? (endsAt === null ? 0 : endsAt - now));
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const primaryAction: 'start' | 'pause' | 'resume' =
    state?.phase === 'idle' || !state ? 'start' : paused ? 'resume' : 'pause';
  const primaryLabel = { start: m.pomodoro_start, pause: m.pomodoro_pause, resume: m.pomodoro_resume }[primaryAction]();
  const phase =
    state?.phase === 'focus' ? m.pomodoro_focus() : state?.phase === 'break' ? m.pomodoro_break() : m.pomodoro_idle();
  const phaseLabel = paused
    ? state?.phase === 'break'
      ? m.pomodoro_break_paused()
      : m.pomodoro_paused({ phase })
    : phase;

  /** Runs an action; the promise is the request, for buttons that show its outcome. Callers that do not need it `void` it. */
  async function act(action: Action) {
    if (!state || connectionLost) throw new Error('Pomodoro unavailable');
    for (const mutation of Object.values(mutations)) mutation.reset();
    if (action === 'start' && tag) await mutations.startTagged.mutateAsync({ tag });
    else await mutations[action].mutateAsync();
  }

  return {
    state,
    phase: state?.phase,
    paused,
    minutes,
    seconds,
    time: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    phaseLabel,
    // The durations in use, as the owner names them: "50/10".
    preset: state
      ? m.pomodoro_preset({ focus: state.settings.focusMinutes, pause: state.settings.shortBreakMinutes })
      : '',
    primaryAction,
    primaryLabel,
    act,
    start: () => act('start'),
    pause: () => act('pause'),
    resume: () => act('resume'),
    skip: () => act('skip'),
    stop: () => act('stop'),
    connectionLost,
    progress: state?.durationMs ? Math.min(1, Math.max(0, 1 - remainingMs / state.durationMs)) : 0,
    pending: Object.values(mutations).some((mutation) => mutation.isPending),
    error: Object.values(mutations).some((mutation) => mutation.isError),
  };
}
