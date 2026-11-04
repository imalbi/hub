import { useLayoutEffect, useRef, useState } from 'react';
import { m } from '../paraglide/messages.js';
import { pages } from './pages.ts';

const storageKey = 'hub.deck.page';

function storedPage() {
  try {
    const index = pages.findIndex((page) => page.id === localStorage.getItem(storageKey));
    return Math.max(0, index);
  } catch {
    return 0;
  }
}

/**
 * The deck's pages side by side, one viewport wide each, switched by swiping (CSS scroll snap, no gesture library) or
 * by the dots under the header. Pages off screen are `inert`, so focus and screen readers stay on the one shown.
 */
export function DeckPages() {
  const [active, setActive] = useState(storedPage);
  const scroller = useRef<HTMLDivElement>(null);

  // The remembered page is where the deck opens, without an animation; scroll position lives in the DOM.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (node) node.scrollLeft = active * node.clientWidth;
    // Only on mount: later the scroll position drives `active`, not the other way round.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onScroll() {
    const node = scroller.current;
    if (!node) return;
    const index = Math.round(node.scrollLeft / node.clientWidth);
    if (index === active || !pages[index]) return;
    setActive(index);
    try {
      localStorage.setItem(storageKey, pages[index].id);
    } catch {
      /* The page still switches; it is just not remembered. */
    }
  }

  function goTo(index: number) {
    const node = scroller.current;
    if (!node) return;
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollTo({ left: index * node.clientWidth, behavior: smooth ? 'smooth' : 'instant' });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-md">
      <nav aria-label={m.deck_pages()} className="flex justify-center gap-3xs">
        {pages.map((page, index) => (
          <button
            key={page.id}
            type="button"
            aria-label={m.deck_page_go({ page: page.label() })}
            aria-current={index === active ? 'page' : undefined}
            onClick={() => goTo(index)}
            className="flex size-touch items-center justify-center"
          >
            <span className="deck-dot size-2xs rounded-full" />
          </button>
        ))}
      </nav>
      <div ref={scroller} onScroll={onScroll} className="deck-pages flex min-h-0 flex-1">
        {pages.map((page, index) => (
          <section
            key={page.id}
            aria-label={page.label()}
            inert={index !== active}
            // Spelled out too: Playwright's role queries (and some screen readers) do not treat inert as hidden.
            aria-hidden={index !== active || undefined}
            className="flex w-full shrink-0 flex-col gap-xl"
          >
            <div className="grid grid-cols-3 gap-md">
              {page.tiles.map((Tile, tile) => (
                // A fixed list: the position is the identity.
                <Tile key={tile} />
              ))}
            </div>
            {page.extra && <page.extra />}
          </section>
        ))}
      </div>
    </div>
  );
}
