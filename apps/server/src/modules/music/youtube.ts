import { Innertube, YTNodes } from 'youtubei.js';

type SourceSong = {
  id?: string;
  title?: string;
  artists?: { name: string; channel_id?: string }[];
  album?: { name: string };
  duration?: { seconds: number };
  thumbnail?: { contents: { url: string }[] } | null;
};

export type Song = {
  id: string;
  title: string;
  artists: { name: string; id?: string }[];
  album?: string;
  seconds?: number;
  cover?: string;
};

type ArtistSource = Awaited<ReturnType<Innertube['music']['getArtist']>>;

export function mapArtist(artist: { header?: ArtistSource['header']; sections: ArtistSource['sections'][number][] }) {
  const header = artist.header;
  const banner = header?.is(YTNodes.MusicVisualHeader)
    ? header.thumbnail.at(-1)?.url
    : header?.is(YTNodes.MusicImmersiveHeader)
      ? header.thumbnail?.contents.at(-1)?.url
      : undefined;
  const songs = artist.sections.flatMap((section) =>
    section.is(YTNodes.MusicShelf) && section.title.toString() === 'Top songs' ? mapSongs(section.contents).songs : [],
  );
  const albums = artist.sections.flatMap((section) =>
    section.is(YTNodes.MusicCarouselShelf)
      ? section.contents.flatMap((item) =>
          item.is(YTNodes.MusicTwoRowItem) && item.item_type === 'album'
            ? [{ title: item.title.toString(), cover: item.thumbnail.at(-1)?.url }]
            : [],
        )
      : [],
  );
  return { name: header?.title?.toString() ?? '', banner, songs, albums };
}

export function mapSongs(items: SourceSong[]) {
  const songs: Song[] = [];
  let dropped = 0;
  for (const item of items) {
    if (!item.id || !item.title) {
      dropped++;
      continue;
    }
    songs.push({
      id: item.id,
      title: item.title,
      artists: (item.artists ?? []).map((artist) => ({
        name: artist.name,
        ...(artist.channel_id ? { id: artist.channel_id } : {}),
      })),
      ...(item.album ? { album: item.album.name } : {}),
      ...(item.duration ? { seconds: item.duration.seconds } : {}),
      ...(item.thumbnail?.contents[0]?.url ? { cover: item.thumbnail.contents[0].url } : {}),
    });
  }
  return { songs, dropped };
}

export function createYouTube() {
  let session: Promise<Innertube> | undefined;
  async function client() {
    session ??= Innertube.create({ generate_session_locally: true, retrieve_player: false });
    return session.catch((error: unknown) => {
      session = undefined;
      throw error;
    });
  }
  return {
    async artist(id: string) {
      const yt = await client();
      return mapArtist(await yt.music.getArtist(id));
    },
    async search(query: string) {
      const yt = await client();
      const result = await yt.music.search(query, { type: 'song' });
      return mapSongs(result.songs?.contents ?? []);
    },
    async upNext(id: string) {
      const yt = await client();
      const result = await yt.music.getUpNext(id);
      return mapSongs(
        result.contents.flatMap((item) => {
          const video = 'video_id' in item ? item : 'primary' in item ? item.primary : null;
          if (!video) return [];
          return [
            {
              id: video.video_id,
              title: video.title.toString(),
              artists: video.artists,
              album: video.album,
              duration: video.duration,
              thumbnail: { contents: video.thumbnail },
            },
          ];
        }),
      ).songs;
    },
  };
}
