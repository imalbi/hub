import { TimerIcon } from '@phosphor-icons/react';
import { Tile } from '../../components/tile.tsx';
import { m } from '../../paraglide/messages.js';
import { usePomodoro } from './use-pomodoro.ts';

export function PomodoroTile() {
  const timer = usePomodoro();
  const focus = timer.paused ? m.pomodoro_paused({ phase: m.pomodoro_tile_focus() }) : m.pomodoro_tile_focus();
  const phase = timer.phase === 'focus' ? focus : timer.phaseLabel;
  const state = timer.state
    ? timer.phase === 'idle'
      ? m.pomodoro_tile_idle({ preset: timer.preset })
      : m.pomodoro_tile_state({ phase, time: timer.time })
    : timer.connectionLost
      ? m.tile_unavailable()
      : m.tile_loading();
  return (
    <Tile
      icon={TimerIcon}
      label={m.pomodoro_title()}
      state={state}
      status={timer.state ? timer.primaryLabel : undefined}
      pending={timer.pending}
      error={timer.error}
      stale={timer.connectionLost}
      // A failure shows on the tile through `timer.error`.
      onPress={() => void timer.act(timer.primaryAction).catch(() => {})}
    />
  );
}
