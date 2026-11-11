import assert from 'node:assert/strict';
import { test } from 'node:test';
import { YTNodes } from 'youtubei.js';
import { mapArtist, mapSongs } from './youtube.ts';

void test('maps artist header, top songs and albums from youtubei nodes', () => {
  const header = new YTNodes.MusicVisualHeader({
    title: { runs: [{ text: 'Artist' }] },
    thumbnail: {
      musicThumbnailRenderer: {
        thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/banner', width: 540, height: 225 }] },
      },
    },
  });
  const shelf = new YTNodes.MusicShelf({ title: { runs: [{ text: 'Top songs' }] }, contents: [] });
  const song = new YTNodes.MusicResponsiveListItem({
    flexColumns: [{ musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Song' }] } } }],
  });
  song.id = 'abcdefghijk';
  song.title = 'Song';
  song.artists = [{ name: 'Artist', channel_id: 'UCabcdefghijklmnopqrstuv' }];
  shelf.contents.push(song);
  const other = new YTNodes.MusicShelf({ title: { runs: [{ text: 'Other' }] }, contents: [] });
  other.contents.push(song);
  const carousel = new YTNodes.MusicCarouselShelf({ contents: [] });
  const album = new YTNodes.MusicTwoRowItem({
    title: { runs: [{ text: 'Album' }] },
    subtitle: {},
    navigationEndpoint: {
      browseEndpoint: {
        browseId: 'album',
        browseEndpointContextSupportedConfigs: {
          browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ALBUM' },
        },
      },
    },
    thumbnailRenderer: {
      musicThumbnailRenderer: {
        thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/album', width: 100, height: 100 }] },
      },
    },
  });
  carousel.contents.push(album);
  assert.deepEqual(mapArtist({ header, sections: [shelf, other, carousel] }), {
    name: 'Artist',
    banner: 'https://i.ytimg.com/banner',
    songs: [{ id: 'abcdefghijk', title: 'Song', artists: [{ name: 'Artist', id: 'UCabcdefghijklmnopqrstuv' }] }],
    albums: [{ title: 'Album', cover: 'https://i.ytimg.com/album' }],
  });
});

void test('maps song fields and counts missing identifiers', () => {
  const { songs, dropped } = mapSongs([
    {
      id: 'abcdefghijk',
      title: 'Song',
      artists: [{ name: 'Artist', channel_id: 'UC123' }],
      album: { name: 'Album' },
      duration: { seconds: 123 },
      thumbnail: { contents: [{ url: 'https://example.org/art' }] },
    },
    { title: 'No id' },
  ]);
  assert.deepEqual(songs, [
    {
      id: 'abcdefghijk',
      title: 'Song',
      artists: [{ name: 'Artist', id: 'UC123' }],
      album: 'Album',
      seconds: 123,
      cover: 'https://example.org/art',
    },
  ]);
  assert.equal(dropped, 1);
});
