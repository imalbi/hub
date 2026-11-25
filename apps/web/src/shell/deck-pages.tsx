import { ContentBoundary } from './content-boundary.tsx';
import { useSubscription } from '@trpc/tanstack-react-query';
import { Badge } from '../components/ui/badge.tsx';
import { useIsOn } from '../lib/enabled-modules.ts';
import { useTRPC } from '../lib/trpc.ts';
import { PomodoroTile } from '../modules/pomodoro/deck-tile.tsx';
import { useLayoutEffect, useRef, useState } from 'react';
import { m } from '../paraglide/messages.js';
import { useDeckPages } from './deck-page-config.ts';
import { useJobs } from '../modules/jobs/jobs.tsx';
import { useConnectionLost } from '../lib/trpc.ts';
import { DeckFrame } from './deck-frame.tsx';
import { AgentConfirmation } from './agent-confirmation.tsx';
import { DeckPlayer } from '../modules/media/deck-player.tsx';

const storageKey = 'hub.deck.page';

/** One page plus the gap after it, the distance between two snap points. */
function pageStride(node: HTMLElement) {
  return node.clientWidth + (parseFloat(getComputedStyle(node).columnGap) || 0);
}

function storedPage(pages: { id: string }[]) {
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
  const trpc = useTRPC();
  const runningJobs = useJobs().filter((job) => job.status === 'running').length;
  const connectionLost = useConnectionLost();
  const isOn = useIsOn();
  // A module that is off has no router: its subscription would only fail.
  const pomodoro = useSubscription(trpc.pomodoro.onState.subscriptionOptions(undefined, { enabled: isOn('pomodoro') }));
  const pages = useDeckPages();
  const [active, setActive] = useState(() => storedPage(pages));
  const scroller = useRef<HTMLDivElement>(null);

  // The remembered page is where the deck opens, without an animation; scroll position lives in the DOM.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (node) node.scrollLeft = active * pageStride(node);
    // Only on mount: later the scroll position drives `active`, not the other way round.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onScroll() {
    const node = scroller.current;
    if (!node) return;
    const index = Math.round(node.scrollLeft / pageStride(node));
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
    node.scrollTo({ left: index * pageStride(node), behavior: smooth ? 'smooth' : 'instant' });
  }

  return (
    <DeckFrame
      status={
        connectionLost ? (
          m.connection_lost()
        ) : (
          <span className="flex items-center gap-sm">
            {pomodoro.data && pomodoro.data.phase !== 'idle' && pomodoro.data.pausedRemainingMs === null && (
              <button
                type="button"
                aria-label={m.deck_badge_pomodoro()}
                onClick={() => goTo(pages.findIndex((page) => page.tiles.includes(PomodoroTile)))}
              >
                <Badge dot>{m.pomodoro_title()}</Badge>
              </button>
            )}
            {runningJobs > 0 && (
              <span aria-label={m.jobs_running({ count: runningJobs })}>
                <Badge count={runningJobs} /> {m.jobs_title()}
              </span>
            )}
          </span>
        )
      }
    >
      <AgentConfirmation deck />
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
              <div className="deck-tile-grid grid grid-cols-3 gap-xs">
                {page.tiles.map((Tile, tile) => (
                  // A fixed list: the position is the identity.
                  <ContentBoundary key={tile}>
                    <Tile />
                  </ContentBoundary>
                ))}
              </div>
              {page.extra && (
                <ContentBoundary>
                  <page.extra />
                </ContentBoundary>
              )}
            </section>
          ))}
        </div>
      </div>
      <DeckPlayer />
    </DeckFrame>
  );
}
