import { Timer } from 'lucide-react';
import { Tile } from '../components/tile.tsx';
import { m } from '../paraglide/messages.js';
import { usePomodoro } from '../pomodoro.ts';

export function PomodoroTile() {
  const timer = usePomodoro();
  const focus =
    timer.state?.pausedRemainingMs !== null
      ? m.pomodoro_paused({ phase: m.pomodoro_tile_focus() })
      : m.pomodoro_tile_focus();
  const phase = timer.state?.phase === 'focus' ? focus : timer.phaseLabel;
  const state = timer.state
    ? m.pomodoro_tile_state({ phase, time: timer.time })
    : timer.connectionLost
      ? m.tile_unavailable()
      : m.tile_loading();
  return (
    <Tile
      icon={Timer}
      label={m.pomodoro_title()}
      state={state}
      status={timer.state ? timer.primaryLabel : undefined}
      pending={timer.pending}
      error={timer.error}
      stale={timer.connectionLost}
      onPress={() => timer.act(timer.primaryAction)}
    />
  );
}
