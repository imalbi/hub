type Page<T, L, E> = { id: string; label: L; tiles: T[]; count: number; tail?: number; extra?: E };

/**
 * Places a module's unpositioned tiles together on the last page with room for all of them (12 rendered tiles a page),
 * before that page's `tail` (Sistema's holds stay last, board D1); with no room anywhere they get a page of their own.
 */
export function placeDeckTiles<T, L, E>(
  pages: Page<T, L, E>[],
  deck: { id: string; label: L; tiles: T[] },
): Page<T, L, E>[] {
  const index = pages.findLastIndex((page) => page.count + deck.tiles.length <= 12);
  if (index < 0) {
    let id = deck.id;
    let suffix = 2;
    while (pages.some((page) => page.id === id)) id = `${deck.id}-${suffix++}`;
    return [...pages, { id, label: deck.label, tiles: deck.tiles, count: deck.tiles.length }];
  }
  return pages.map((page, i) =>
    i === index
      ? {
          ...page,
          tiles: page.tiles.toSpliced(page.tiles.length - (page.tail ?? 0), 0, ...deck.tiles),
          count: page.count + deck.tiles.length,
        }
      : page,
  );
}
