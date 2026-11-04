import { useMutation } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useEffect, useState } from 'react';
import { m } from '../../paraglide/messages.js';
import { useConnectionLost, useTRPC } from '../../lib/trpc.ts';

export function usePomodoro() {
  const trpc = useTRPC();
  const connectionLost = useConnectionLost();
  const [now, setNow] = useState(() => Date.now());
  const subscription = useSubscription({
    ...trpc.pomodoro.onState.subscriptionOptions(),
    onData: () => setNow(Date.now()),
  });
  const start = useMutation(trpc.pomodoro.start.mutationOptions());
  const pause = useMutation(trpc.pomodoro.pause.mutationOptions());
  const resume = useMutation(trpc.pomodoro.resume.mutationOptions());
  const skip = useMutation(trpc.pomodoro.skip.mutationOptions());
  const stop = useMutation(trpc.pomodoro.stop.mutationOptions());
  const actions = { start, pause, resume, skip, stop };
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);
  const state = subscription.data;
  const remainingMs = Math.max(
    0,
    state?.pausedRemainingMs ?? (state?.endsAt === null || state?.endsAt === undefined ? 0 : state.endsAt - now),
  );
  const seconds = Math.ceil(remainingMs / 1000);
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const primaryAction: 'start' | 'pause' | 'resume' =
    state?.phase === 'idle' || !state ? 'start' : state.pausedRemainingMs !== null ? 'resume' : 'pause';
  const primaryLabel = { start: m.pomodoro_start, pause: m.pomodoro_pause, resume: m.pomodoro_resume }[primaryAction]();
  const phase =
    state?.phase === 'focus' ? m.pomodoro_focus() : state?.phase === 'break' ? m.pomodoro_break() : m.pomodoro_idle();
  const phaseLabel =
    state?.pausedRemainingMs !== null && state?.pausedRemainingMs !== undefined
      ? state.phase === 'break'
        ? m.pomodoro_break_paused()
        : m.pomodoro_paused({ phase })
      : phase;

  function act(action: keyof typeof actions) {
    if (!state || connectionLost) return;
    for (const mutation of Object.values(actions)) mutation.reset();
    actions[action].mutate();
  }

  async function actAsync(action: keyof typeof actions) {
    if (!state || connectionLost) throw new Error('Pomodoro unavailable');
    for (const mutation of Object.values(actions)) mutation.reset();
    await actions[action].mutateAsync();
  }

  return {
    state,
    time,
    phaseLabel,
    primaryAction,
    primaryLabel,
    act,
    actAsync,
    connectionLost,
    progress: state?.durationMs ? Math.min(1, Math.max(0, 1 - remainingMs / state.durationMs)) : 0,
    pending: Object.values(actions).some((action) => action.isPending),
    error: Object.values(actions).some((action) => action.isError),
  };
}
