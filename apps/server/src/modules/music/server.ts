import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asc, count, desc, eq } from 'drizzle-orm';
import { favorites, history, playlists, playlistSongs, settings } from './schema.ts';
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
    migrations: fileURLToPath(new URL('./drizzle', import.meta.url)),
    create({ db, run, fetch, log }) {
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
          seed: snapshot.seed ? { id: snapshot.seed.id, title: snapshot.seed.title } : null,
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
      let historyTimer: ReturnType<typeof setTimeout> | undefined;
      let historyGeneration = 0;
      function cancelHistory() {
        historyGeneration++;
        clearTimeout(historyTimer);
      }
      function armHistory() {
        cancelHistory();
        const song = queue.current;
        if (!song) return;
        const track = song;
        const version = historyGeneration;
        function check(delay: number) {
          historyTimer = setTimeout(() => {
            void ipc
              .request(['get_property', 'playback-time'])
              .then((time) => {
                if (version !== historyGeneration || queue.current !== track) return;
                if (typeof time === 'number' && time >= 30) {
                  db.insert(history)
                    .values({
                      id: track.id,
                      title: track.title,
                      artist: track.artists.map((artist) => artist.name).join(', '),
                      cover: track.cover ?? null,
                      playedAt: Date.now(),
                    })
                    .run();
                } else check(typeof time === 'number' ? Math.max(1000, (30 - time) * 1000) : 30000);
                return undefined;
              })
              .catch(() => {
                if (version === historyGeneration) check(30000);
              });
          }, delay);
        }
        check(30000);
      }
      let pendingError = false;
      let appended: string | null = null;
      // mpv's playlist index of the current song: its own start-file must never advance the queue, even when the
      // next song has the same URL (a playlist can hold one song twice in a row).
      let currentPos = -1;
      async function appendNext() {
        if (!queue.current) return;
        if (queue.upcoming.length < 3) await refill();
        const next = queue.upcoming[0];
        if (next && appended !== next.id) {
          await ipc.request(['loadfile', `https://music.youtube.com/watch?v=${next.id}`, 'append']);
          appended = next.id;
        }
      }
      function schedule(operation: () => Promise<void>) {
        const result = operations.then(operation);
        operations = result.catch(() => {});
        return result;
      }
      async function followStart() {
        if (!queue.current) return;
        const position = await ipc.request(['get_property', 'playlist-pos']);
        if (typeof position !== 'number' || position < 0 || position === currentPos) return;
        let path = await ipc.request(['get_property', 'path']).catch(() => null);
        if (path !== `https://music.youtube.com/watch?v=${queue.upcoming[0]?.id}`)
          path = await ipc.request(['get_property', `playlist/${position}/filename`]);
        if (path === `https://music.youtube.com/watch?v=${queue.upcoming[0]?.id}`) {
          queue = queueReducer(queue, { type: 'advance', error: pendingError });
          currentPos = position;
          pendingError = false;
          appended = null;
          armHistory();
          await live.notify();
          await appendNext();
        }
      }
      async function followEnd(reason: unknown) {
        if ((reason === 'eof' || reason === 'error') && queue.current && !appended && !queue.upcoming.length) {
          queue = queueReducer(queue, { type: 'advance', error: reason === 'error' });
          pendingError = false;
          await live.notify();
          return;
        }
        if (reason === 'error') {
          pendingError = true;
          if (queue.current && queue.errors >= 2) {
            queue = queueReducer(queue, { type: 'advance', error: true });
            appended = null;
            currentPos = -1;
            await ipc.request(['stop']);
            await ipc.request(['playlist-clear']);
            await live.notify();
          }
        } else if (reason === 'eof' || reason === 'stop') pendingError = false;
      }
      function savedVolume() {
        return db.select().from(settings).where(eq(settings.key, 'volume')).get()?.value;
      }
      function onEvent(event: unknown) {
        if (!event || typeof event !== 'object' || !('event' in event)) return;
        if (event.event === 'hub-connected') {
          // A fresh or restarted mpv comes up at its own 100: put the remembered volume back.
          const volume = savedVolume();
          if (volume !== undefined)
            void ipc.request(['set_property', 'volume', volume]).catch(() => log.warn('Music volume not restored'));
        } else if (event.event === 'start-file')
          void schedule(followStart).catch(() => log.warn('Music player unavailable while advancing'));
        else if (event.event === 'end-file' && 'reason' in event) {
          cancelHistory();
          void schedule(() => followEnd(event.reason)).catch(() =>
            log.warn('Music player unavailable while advancing'),
          );
        }
      }
      ipc.events.on('event', onEvent);
      const playlistId = z.number().int().positive();
      const publicPlaylistId = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
      const position = z.number().int().nonnegative();
      const songInput = z.object({
        id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
        title: z.string().min(1).max(500),
        artist: z.string().max(500),
      });
      function getPlaylist(id: number) {
        const playlist = db.select().from(playlists).where(eq(playlists.id, id)).get();
        if (!playlist) throw new TRPCError({ code: 'NOT_FOUND', message: 'Playlist not found' });
        return {
          ...playlist,
          songs: db
            .select()
            .from(playlistSongs)
            .where(eq(playlistSongs.playlistId, id))
            .orderBy(playlistSongs.position)
            .all(),
        };
      }
      function replacePlaylistSongs(id: number, rows: ReturnType<typeof getPlaylist>['songs']) {
        db.transaction((tx) => {
          tx.delete(playlistSongs).where(eq(playlistSongs.playlistId, id)).run();
          if (rows.length)
            tx.insert(playlistSongs)
              .values(rows.map((row, index) => ({ ...row, position: index })))
              .run();
        });
      }
      /** YouTube failures reach the client as one short message, never the library's own text. */
      async function publicList(id: string) {
        try {
          return await youtube.playlist(id);
        } catch {
          throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Playlist unavailable' });
        }
      }
      async function playSongs(tracks: Song[]) {
        const first = tracks[0];
        if (!first) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Playlist is empty' });
        await schedule(async () => {
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
            currentPos = 0;
            await ipc.request(['loadfile', `https://music.youtube.com/watch?v=${first.id}`, 'replace']);
            await ipc.request(['set_property', 'pause', false]);
            generation++;
            appended = null;
            pendingError = false;
            queue = queueReducer(queue, { type: 'load', songs: tracks });
            for (const song of tracks) songs.set(song.id, song);
            armHistory();
            await live.notify();
            await appendNext();
          } catch {
            throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Music player unavailable' });
          }
        });
      }
      return {
        router: router({
          playlists: protectedProcedure.query(async () => {
            const rows = db.select().from(playlists).orderBy(desc(playlists.createdAt)).all();
            return Promise.all(
              rows.map(async (row) => {
                const total = db
                  .select({ n: count() })
                  .from(playlistSongs)
                  .where(eq(playlistSongs.playlistId, row.id))
                  .get()?.n;
                const first = db
                  .select({ id: playlistSongs.id })
                  .from(playlistSongs)
                  .where(eq(playlistSongs.playlistId, row.id))
                  .orderBy(asc(playlistSongs.position))
                  .limit(4)
                  .all();
                // Saved songs keep no artwork: the cover is the video's own thumbnail, through the same proxy.
                const covers = await Promise.all(
                  first.map((song) => cover(`https://i.ytimg.com/vi/${song.id}/mqdefault.jpg`)),
                );
                return { ...row, count: total ?? 0, covers: covers.filter((item) => item !== null) };
              }),
            );
          }),
          searchPlaylists: protectedProcedure
            .input(z.object({ query: z.string().min(1).max(200) }))
            .query(async ({ input }) => {
              try {
                return (await youtube.searchPlaylists(input.query)).filter(
                  (item) => publicPlaylistId.safeParse(item.id).success,
                );
              } catch {
                throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Playlist search unavailable' });
              }
            }),
          publicPlaylist: protectedProcedure.input(z.object({ id: publicPlaylistId })).query(async ({ input }) => {
            try {
              const list = await youtube.playlist(input.id);
              const valid = list.songs.filter((song) => songInput.shape.id.safeParse(song.id).success);
              return { title: list.title, songs: await Promise.all(valid.map(publicSong)) };
            } catch {
              throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Playlist unavailable' });
            }
          }),
          playPublicPlaylist: protectedProcedure
            .meta({ label: 'Riproduci playlist pubblica', description: 'Play a public playlist' })
            .input(z.object({ id: publicPlaylistId }))
            .mutation(async ({ input }) => {
              const list = await publicList(input.id);
              return playSongs(list.songs.filter((song) => songInput.shape.id.safeParse(song.id).success));
            }),
          savePublicPlaylist: protectedProcedure
            .meta({ label: 'Salva playlist', description: 'Save a public playlist' })
            .input(z.object({ id: publicPlaylistId }))
            .mutation(async ({ input }) => {
              const list = await publicList(input.id);
              const name = z.string().trim().min(1).max(200).catch('Playlist').parse(list.title);
              const valid = list.songs.filter(
                (song) =>
                  songInput.safeParse({
                    id: song.id,
                    title: song.title,
                    artist: song.artists.map((artist) => artist.name).join(', '),
                  }).success,
              );
              return db.transaction((tx) => {
                const created = tx.insert(playlists).values({ name, createdAt: Date.now() }).returning().get();
                if (valid.length)
                  tx.insert(playlistSongs)
                    .values(
                      valid.map((song, index) => ({
                        playlistId: created.id,
                        position: index,
                        id: song.id,
                        title: song.title,
                        artist: song.artists.map((artist) => artist.name).join(', '),
                        addedAt: Date.now(),
                      })),
                    )
                    .run();
                return created;
              });
            }),
          playlist: protectedProcedure.input(z.object({ id: playlistId })).query(({ input }) => getPlaylist(input.id)),
          playPlaylist: protectedProcedure
            .meta({ label: 'Riproduci playlist', description: 'Play a playlist' })
            .input(z.object({ id: playlistId }))
            .mutation(({ input }) =>
              playSongs(
                getPlaylist(input.id).songs.map((song) => ({
                  id: song.id,
                  title: song.title,
                  artists: song.artist ? [{ name: song.artist }] : [],
                })),
              ),
            ),
          createPlaylist: protectedProcedure
            .meta({ label: 'Crea playlist', description: 'Create a playlist' })
            .input(z.object({ name: z.string().trim().min(1).max(200) }))
            .mutation(({ input }) =>
              db.insert(playlists).values({ name: input.name, createdAt: Date.now() }).returning().get(),
            ),
          renamePlaylist: protectedProcedure
            .meta({ label: 'Rinomina playlist', description: 'Rename a playlist' })
            .input(z.object({ id: playlistId, name: z.string().trim().min(1).max(200) }))
            .mutation(({ input }) => {
              getPlaylist(input.id);
              db.update(playlists).set({ name: input.name }).where(eq(playlists.id, input.id)).run();
            }),
          deletePlaylist: protectedProcedure
            .meta({ label: 'Elimina playlist', description: 'Delete a playlist', danger: true })
            .input(z.object({ id: playlistId, confirmed: z.literal(true) }))
            .mutation(({ input }) => {
              getPlaylist(input.id);
              db.delete(playlists).where(eq(playlists.id, input.id)).run();
            }),
          addToPlaylist: protectedProcedure
            .meta({ label: 'Aggiungi a playlist', description: 'Add a track to a playlist' })
            .input(songInput.extend({ playlistId }))
            .mutation(({ input }) => {
              const list = getPlaylist(input.playlistId);
              db.insert(playlistSongs)
                .values({ ...input, position: list.songs.length, addedAt: Date.now() })
                .run();
            }),
          removePlaylistSong: protectedProcedure
            .meta({ label: 'Rimuovi brano', description: 'Remove a playlist track' })
            .input(z.object({ playlistId, position }))
            .mutation(({ input }) => {
              const rows = getPlaylist(input.playlistId).songs;
              if (input.position >= rows.length) throw new TRPCError({ code: 'NOT_FOUND' });
              rows.splice(input.position, 1);
              replacePlaylistSongs(input.playlistId, rows);
            }),
          movePlaylistSong: protectedProcedure
            .meta({ label: 'Sposta brano', description: 'Reorder a playlist track' })
            .input(z.object({ playlistId, from: position, to: position }))
            .mutation(({ input }) => {
              const rows = getPlaylist(input.playlistId).songs;
              if (input.from >= rows.length || input.to >= rows.length) throw new TRPCError({ code: 'NOT_FOUND' });
              const [row] = rows.splice(input.from, 1);
              if (row) rows.splice(input.to, 0, row);
              replacePlaylistSongs(input.playlistId, rows);
            }),
          favorites: protectedProcedure.query(() => db.select().from(favorites).orderBy(desc(favorites.addedAt)).all()),
          history: protectedProcedure.query(() => db.select().from(history).orderBy(desc(history.playedAt)).all()),
          /** The last five distinct songs with their covers, for the Ascolta tiles. */
          recent: protectedProcedure.query(async () => {
            const seen = new Map<string, typeof history.$inferSelect>();
            for (const row of db.select().from(history).orderBy(desc(history.playedAt)).limit(200).all()) {
              if (!seen.has(row.id)) seen.set(row.id, row);
              if (seen.size === 5) break;
            }
            return Promise.all(
              [...seen.values()].map(async ({ id, title, artist, cover: source }) => ({
                id,
                title,
                artist,
                // The tile is large: ask Google's artwork at 544 px instead of the 60 px search size. Rows from
                // before the cover column fall back to the video thumbnail, as playlists do.
                cover: await cover(
                  source?.replace(/=w\d+-h\d+/, '=w544-h544') ?? `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
                ),
              })),
            );
          }),
          toggleFavorite: protectedProcedure
            .meta({ label: 'Preferito', description: 'Toggle a favorite track' })
            .input(
              z.object({
                id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
                title: z.string().min(1).max(500),
                artist: z.string().max(500),
              }),
            )
            .mutation(({ input }) => {
              const existing = db.select().from(favorites).where(eq(favorites.id, input.id)).get();
              if (existing) db.delete(favorites).where(eq(favorites.id, input.id)).run();
              else
                db.insert(favorites)
                  .values({ ...input, addedAt: Date.now() })
                  .run();
            }),
          queue: protectedProcedure.query(publicQueue),
          onQueue: protectedProcedure.subscription(({ signal }) => live.subscribe(signal)),
          artist: protectedProcedure
            .input(z.object({ id: z.string().regex(/^UC[A-Za-z0-9_-]{22}$/) }))
            .query(async ({ input }) => {
              try {
                const artist = await youtube.artist(input.id);
                for (const song of artist.songs) songs.set(song.id, song);
                return {
                  ...artist,
                  banner: await cover(artist.banner),
                  songs: await Promise.all(artist.songs.map(publicSong)),
                  albums: await Promise.all(
                    artist.albums.map(async (album) => ({ ...album, cover: await cover(album.cover) })),
                  ),
                };
              } catch {
                throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Music artist unavailable' });
              }
            }),
          skip: protectedProcedure
            .meta({ label: 'Salta brano', description: 'Skip to the next radio track' })
            .mutation(async () => {
              await schedule(async () => {
                try {
                  cancelHistory();
                  await ipc.request(['playlist-next']);
                  await ipc.request(['set_property', 'pause', false]);
                } catch {
                  throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Music player unavailable' });
                }
              });
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
            .mutation(({ input }) => {
              const saved =
                db.select().from(favorites).where(eq(favorites.id, input.id)).get() ??
                db.select().from(history).where(eq(history.id, input.id)).orderBy(desc(history.playedAt)).get();
              const song =
                songs.get(input.id) ??
                (saved
                  ? { id: saved.id, title: saved.title, artists: saved.artist ? [{ name: saved.artist }] : [] }
                  : { id: input.id, title: input.id, artists: [] });
              return playSongs([song]);
            }),
          setVolume: protectedProcedure
            .meta({
              label: 'Volume musica',
              description: 'Set the music volume (0 to 100), not the system volume',
            })
            .input(z.object({ volume: z.number().int().min(0).max(100) }))
            .mutation(async ({ input }) => {
              await schedule(async () => {
                try {
                  await ipc.request(['set_property', 'volume', input.volume]);
                  db.insert(settings)
                    .values({ key: 'volume', value: input.volume })
                    .onConflictDoUpdate({ target: settings.key, set: { value: input.volume } })
                    .run();
                } catch {
                  throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Music player unavailable' });
                }
              });
            }),
          state: protectedProcedure.query(async () => {
            try {
              const idle = await ipc.request(['get_property', 'idle-active']);
              const level = await ipc.request(['get_property', 'volume']).catch(() => null);
              const volume = typeof level === 'number' ? Math.round(level) : null;
              if (idle === true) return { available: true, volume, playing: null };
              const path = await ipc.request(['get_property', 'path']);
              let id: string | null = null;
              try {
                const url = typeof path === 'string' ? new URL(path) : null;
                if (url?.hostname === 'music.youtube.com') id = url.searchParams.get('v');
              } catch {
                return { available: true, volume, playing: null };
              }
              const song = id ? songs.get(id) : undefined;
              if (song) return { available: true, volume, playing: await publicSong(song) };
              if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return { available: true, volume, playing: null };
              const title = await ipc.request(['get_property', 'media-title']);
              const metadata = await ipc.request(['get_property', 'metadata']).catch(() => null);
              if (typeof title !== 'string' || !title) return { available: true, volume, playing: null };
              const artist = metadata && typeof metadata === 'object' && 'artist' in metadata ? metadata.artist : null;
              return {
                available: true,
                volume,
                playing: { id, title, artists: typeof artist === 'string' ? [{ name: artist }] : [], cover: null },
              };
            } catch {
              return { available: false, volume: null, playing: null };
            }
          }),
        }),
        close: () => {
          cancelHistory();
          ipc.events.off('event', onEvent);
          ipc.close();
        },
      };
    },
  });
}
export const musicModule = createMusicModule();
