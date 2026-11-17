import { usePomodoro } from '../pomodoro/use-pomodoro.ts';

export function StudyStatusItem() {
  const timer = usePomodoro();
  if (timer.phase !== 'focus' || timer.paused) return null;
  return (
    <span>
      {timer.phaseLabel} · {timer.time}
    </span>
  );
}
