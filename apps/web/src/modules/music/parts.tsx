import * as React from 'react';
import { MusicNoteIcon, MusicNotesIcon } from '@phosphor-icons/react';

export type SongItem = {
  id: string;
  title: string;
  artists: { name: string; id?: string }[];
  cover?: string | null;
  seconds?: number;
};

/** A pill button: the house shape for text controls on the Musica page. */
export const pill =
  'inline-flex h-touch items-center gap-xs rounded-full px-md text-label focus-visible:outline-2 focus-visible:outline-ring';
export const pillQuiet = `${pill} text-foreground hover:bg-muted`;
export const pillOutline = `${pill} border border-border text-foreground hover:bg-muted`;
export const pillPrimary = `${pill} bg-primary text-primary-foreground disabled:opacity-60`;
export const iconButton =
  'flex size-touch shrink-0 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring';

/** A cover, or a note on a muted tile when the source has none (a song saved before covers were kept). */
export function CoverTile({ src, className = 'size-2xl rounded-md' }: { src?: string | null; className?: string }) {
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center overflow-hidden bg-muted ${className}`}>
      {src ? <img src={src} alt="" className="size-full object-cover" /> : <MusicNoteIcon className="size-icon" />}
    </span>
  );
}

export function Artists({
  artists,
  onOpen,
}: {
  artists: { name: string; id?: string }[];
  onOpen: (id: string) => void;
}) {
  return artists.map((artist, index) => {
    const id = artist.id;
    return (
      <React.Fragment key={`${artist.name}-${index}`}>
        {index > 0 && ', '}
        {id && /^UC[A-Za-z0-9_-]{22}$/.test(id) ? (
          <button
            type="button"
            className="relative z-10 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => onOpen(id)}
          >
            {artist.name}
          </button>
        ) : (
          artist.name
        )}
      </React.Fragment>
    );
  });
}

export function Duration({ seconds }: { seconds?: number }) {
  if (seconds === undefined) return null;
  return (
    <span className="text-caption text-muted-foreground tabular-nums">
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </span>
  );
}

/** The cover of a playlist: songs keep no artwork, so a note on a muted tile stands for it. */
export function PlaylistCover({ className = 'size-2xl rounded-md' }: { className?: string }) {
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center bg-muted ${className}`}>
      <MusicNotesIcon className="size-icon" />
    </span>
  );
}

/** A playlist row's cover: the first songs' thumbnails as a 2x2 mosaic, one thumbnail when fewer than four, else the note tile. */
export function PlaylistMosaic({ covers }: { covers: string[] }) {
  const [first] = covers;
  if (!first) return <PlaylistCover />;
  if (covers.length < 4) return <CoverTile src={first} />;
  return (
    <span aria-hidden className="grid size-2xl shrink-0 grid-cols-2 overflow-hidden rounded-md bg-muted">
      {covers.map((src, index) => (
        <img key={index} src={src} alt="" className="size-full object-cover" />
      ))}
    </span>
  );
}
