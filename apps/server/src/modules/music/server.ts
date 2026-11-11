import { join } from 'node:path';
import { createLiveHub } from '../../core/live.ts';
import { emptyQueue, queueReducer } from './queue.ts';
import { defineModule, TRPCError, z } from '../../core/module.ts';
import { protectedProcedure, router } from '../../core/trpc.ts';
import { createMpvIpc } from './mpv-ipc.ts';
import { createYouTube, type Song } from './youtube.ts';

type YouTube = ReturnType<typeof createYouTube>;
type Ipc = Pick<ReturnType<typeof createMpvIpc>, 'request' | 'close' | 'events'>;

export function createMusicModule(options: { youtube?: YouTube; ipc?: Ipc } = {}) {
  return defineModule({
    name: 'music',
    create({ run, fetch, log }) {
      const youtube = options.youtube ?? createYouTube();
      const ipc =
        options.ipc ??
        createMpvIpc(join(process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 0}`, 'hub-music.sock'));
      const songs = new Map<string, Song>();
      const covers = new Map<string, string | null>();
      async function cover(source?: string) {
        if (!source) return null;
        if (covers.has(source)) return covers.get(source) ?? null;
        let result: string | null = null;
        try {
          const url = new URL(source);
          if (url.protocol !== 'https:' || !/(^|\.)(ytimg\.com|googleusercontent\.com)$/.test(url.hostname))
            return null;
          const response = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: 'error' });
          if (!response.ok || Number(response.headers.get('content-length')) > 2 * 1024 * 1024 || !response.body)
            return null;
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let size = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 2 * 1024 * 1024) {
              await reader.cancel();
              return null;
            }
            chunks.push(value);
          }
          const bytes = Buffer.concat(chunks);
          const format = bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
            ? 'png'
            : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
              ? 'jpeg'
              : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
                ? 'webp'
                : null;
          // Search thumbnails are already small (60x60), so the checked bytes pass through unchanged.
          if (format && bytes.length <= 256 * 1024) result = `data:image/${format};base64,${bytes.toString('base64')}`;
        } catch {
          /* An unavailable cover does not prevent playback. */
        }
        // A cover is about 10 KB as a data URL; keep the cache bounded on a server that runs for weeks.
        if (covers.size >= 500) covers.delete(covers.keys().next().value!);
        covers.set(source, result);
        return result;
      }
      async function publicSong(song: Song) {
        return { ...song, cover: await cover(song.cover) };
      }
      let queue = emptyQueue;
      let generation = 0;
      let operations = Promise.resolve();
      async function publicQueue() {
        const snapshot = queue;
        const upcoming: Awaited<ReturnType<typeof publicSong>>[] = [];
        for (let i = 0; i < snapshot.upcoming.length; i += 4)
          upcoming.push(...(await Promise.all(snapshot.upcoming.slice(i, i + 4).map(publicSong))));
        return {
          current: snapshot.current ? await publicSong(snapshot.current) : null,
          upcoming,
          errors: snapshot.errors,
        };
      }
      const live = createLiveHub(publicQueue, null);
      async function refill() {
        if (!queue.current || queue.upcoming.length >= 3) return;
        const version = generation;
        const seed = queue.upcoming.at(-1)?.id ?? queue.current.id;
        try {
          const next = await youtube.upNext(seed);
          if (version !== generation) return;
          queue = queueReducer(queue, {
            type: 'refill',
            songs: next.filter((song) => /^[A-Za-z0-9_-]{11}$/.test(song.id)),
          });
          await live.notify();
        } catch {
          log.warn('Music radio unavailable');
        }
      }
      async function advance(error: boolean) {
        if (!queue.current) return;
        const version = generation;
        try {
          if (queue.upcoming.length === 0) await refill();
          if (version !== generation) return;
          queue = queueReducer(queue, { type: 'advance', error });
          await live.notify();
          if (queue.current) {
            await ipc.request(['loadfile', `https://music.youtube.com/watch?v=${queue.current.id}`, 'replace']);
            await ipc.request(['set_property', 'pause', false]);
            void refill();
          }
        } catch {
          throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Music player unavailable' });
        }
      }
      function schedule(operation: () => Promise<void>) {
        const result = operations.then(operation);
        operations = result.catch(() => {});
        return result;
      }
      function onEvent(event: unknown) {
        if (
          event &&
          typeof event === 'object' &&
          'event' in event &&
          event.event === 'end-file' &&
          'reason' in event &&
          (event.reason === 'eof' || event.reason === 'error')
        )
          void schedule(() => advance(event.reason === 'error')).catch(() =>
            log.warn('Music player unavailable while advancing'),
          );
      }
      ipc.events.on('event', onEvent);
      return {
        router: router({
          queue: protectedProcedure.query(publicQueue),
          onQueue: protectedProcedure.subscription(({ signal }) => live.subscribe(signal)),
          skip: protectedProcedure
            .meta({ label: 'Salta brano', description: 'Skip to the next radio track' })
            .mutation(async () => {
              await schedule(() => advance(false));
            }),
          search: protectedProcedure.input(z.object({ query: z.string().min(1).max(200) })).query(async ({ input }) => {
            try {
              const result = await youtube.search(input.query);
              if (result.dropped) log.warn({ dropped: result.dropped }, 'Music search dropped incomplete songs');
              for (const song of result.songs) songs.set(song.id, song);
              const output: Awaited<ReturnType<typeof publicSong>>[] = [];
              for (let i = 0; i < result.songs.length; i += 4) {
                output.push(...(await Promise.all(result.songs.slice(i, i + 4).map(publicSong))));
              }
              return output;
            } catch {
              throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Music search unavailable' });
            }
          }),
          play: protectedProcedure
            .meta({ label: 'Riproduci brano', description: 'Play a YouTube Music track by video id' })
            .input(z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{11}$/) }))
            .mutation(async ({ input }) =>
              schedule(async () => {
                const command = ['loadfile', `https://music.youtube.com/watch?v=${input.id}`, 'replace'];
                try {
                  await ipc.request(['get_property', 'idle-active']);
                } catch {
                  const started = await run('systemctl', ['--user', 'start', 'hub-music']);
                  if (started.code !== 0)
                    throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Music player unavailable' });
                  let ready = false;
                  for (let attempt = 0; attempt < 10; attempt++) {
                    try {
                      await ipc.request(['get_property', 'idle-active']);
                      ready = true;
                      break;
                    } catch {
                      await new Promise((resolve) => setTimeout(resolve, 100));
                    }
                  }
                  if (!ready) throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Music player unavailable' });
                }
                try {
                  await ipc.request(command);
                  // mpv keeps `pause` across loadfile: a song loaded while paused would wait silently.
                  await ipc.request(['set_property', 'pause', false]);
                  generation++;
                  queue = queueReducer(queue, {
                    type: 'play',
                    song: songs.get(input.id) ?? { id: input.id, title: input.id, artists: [] },
                  });
                  await live.notify();
                  void refill();
                } catch {
                  throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Music player unavailable' });
                }
              }),
            ),
          state: protectedProcedure.query(async () => {
            try {
              const idle = await ipc.request(['get_property', 'idle-active']);
              if (idle === true) return { available: true, playing: null };
              const path = await ipc.request(['get_property', 'path']);
              let id: string | null = null;
              try {
                const url = typeof path === 'string' ? new URL(path) : null;
                if (url?.hostname === 'music.youtube.com') id = url.searchParams.get('v');
              } catch {
                return { available: true, playing: null };
              }
              const song = id ? songs.get(id) : undefined;
              if (song) return { available: true, playing: await publicSong(song) };
              if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return { available: true, playing: null };
              const title = await ipc.request(['get_property', 'media-title']);
              const metadata = await ipc.request(['get_property', 'metadata']).catch(() => null);
              if (typeof title !== 'string' || !title) return { available: true, playing: null };
              const artist = metadata && typeof metadata === 'object' && 'artist' in metadata ? metadata.artist : null;
              return {
                available: true,
                playing: { id, title, artists: typeof artist === 'string' ? [{ name: artist }] : [], cover: null },
              };
            } catch {
              return { available: false, playing: null };
            }
          }),
        }),
        close: () => {
          ipc.events.off('event', onEvent);
          ipc.close();
        },
      };
    },
  });
}
export const musicModule = createMusicModule();
