import type { Run } from '../../core/exec.ts';

export async function playerArgs(run: Run): Promise<string[]> {
  const result = await run('playerctl', ['--player=mpv', 'status']);
  return result.code === 0 && ['Playing', 'Paused'].includes(result.stdout.trim()) ? ['--player=mpv'] : [];
}
