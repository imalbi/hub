import type { Song } from './youtube.ts';
export const calls: { queries: string[]; commands: (string | number | boolean)[][] } = { queries: [], commands: [] };
export const wiring = {
  youtube: {
    async search(query: string): Promise<{ songs: Song[]; dropped: number }> {
      calls.queries.push(query);
      return {
        songs: [
          { id: 'abcdefghijk', title: 'Song', artists: [{ name: 'Artist' }], cover: 'https://i.ytimg.com/cover' },
        ],
        dropped: 0,
      };
    },
  },
  ipc: {
    async request(command: (string | number | boolean)[]): Promise<unknown> {
      calls.commands.push(command);
      if (command[1] === 'idle-active') return !calls.commands.some((item) => item[0] === 'loadfile');
      if (command[1] === 'path') return 'https://music.youtube.com/watch?v=abcdefghijk';
      if (command[1] === 'media-title') return 'Song';
      if (command[1] === 'metadata') return { artist: 'Artist' };
      return true;
    },
    close() {},
  },
};
