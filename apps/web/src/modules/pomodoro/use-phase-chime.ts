import { useSubscription } from '@trpc/tanstack-react-query';
import { useEffect, useRef } from 'react';
import { useTRPC } from '../../lib/trpc.ts';
// The same file the server plays on the PC with pw-play; Vite copies it into the build. An asset, not server code.
import chimeUrl from '../../../../server/src/modules/pomodoro/chime.wav?url';

/**
 * On the deck, plays the chime when a Pomodoro phase ends by itself (the PC plays it through the server). iOS plays
 * Web Audio only after a gesture, so the first tap anywhere unlocks it; before that, or if anything fails, it is silent.
 */
export function usePhaseChime() {
  const trpc = useTRPC();
  const audio = useRef<{ context: AudioContext; buffer?: AudioBuffer } | null>(null);
  // undefined until the first push, so a phase that ended before the page opened never chimes.
  const lastCompletedAt = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    async function unlock() {
      if (audio.current) return;
      const context = new AudioContext();
      const entry: { context: AudioContext; buffer?: AudioBuffer } = { context };
      audio.current = entry;
      try {
        await context.resume();
        entry.buffer = await context.decodeAudioData(await (await fetch(chimeUrl)).arrayBuffer());
      } catch {
        // No sound is fine: the timer on screen is the real signal.
      }
    }
    const onPointerDown = () => void unlock();
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      void audio.current?.context.close();
      audio.current = null;
    };
  }, []);

  useSubscription({
    ...trpc.pomodoro.onState.subscriptionOptions(),
    onData: (state) => {
      const previous = lastCompletedAt.current;
      lastCompletedAt.current = state.lastCompletedAt;
      if (previous === undefined || state.lastCompletedAt === previous || !state.settings.sound) return;
      const current = audio.current;
      if (!current?.buffer) return;
      const source = current.context.createBufferSource();
      source.buffer = current.buffer;
      source.connect(current.context.destination);
      source.start();
    },
  });
}
