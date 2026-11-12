import { useSubscription } from '@trpc/tanstack-react-query';
import { Badge } from '../components/ui/badge.tsx';
import { useIsOn } from '../lib/enabled-modules.ts';
import { useTRPC } from '../lib/trpc.ts';
import { NewsTile } from '../modules/news/deck-tile.tsx';
import { MailTile } from '../modules/mail/deck-tile.tsx';
import { useMailTRPC } from '../modules/mail/use-mail.ts';
import { summarizeMail } from '../modules/mail/summary.ts';
import { PomodoroTile } from '../modules/pomodoro/deck-tile.tsx';
import { useLayoutEffect, useRef, useState } from 'react';
import { m } from '../paraglide/messages.js';
import { useDeckPages } from './pages.ts';
import { useJobs } from '../modules/jobs/jobs.tsx';

const storageKey = 'hub.deck.page';

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
  const isOn = useIsOn();
  // A module that is off has no router: its subscription would only fail.
  const news = useSubscription(trpc.news.onState.subscriptionOptions(undefined, { enabled: isOn('news') }));
  const pomodoro = useSubscription(trpc.pomodoro.onState.subscriptionOptions(undefined, { enabled: isOn('pomodoro') }));
  const mailTRPC = useMailTRPC();
  const mail = useSubscription(mailTRPC.onState.subscriptionOptions(undefined, { enabled: isOn('mail') }));
  const unread = mail.data ? summarizeMail(mail.data.accounts).count : null;
  const pages = useDeckPages();
  const [active, setActive] = useState(() => storedPage(pages));
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
      <nav aria-label={m.deck_activity()} className="flex justify-center gap-xs">
        {runningJobs > 0 && (
          <span aria-label={m.jobs_running({ count: runningJobs })}>
            <Badge count={runningJobs} /> {m.jobs_title()}
          </span>
        )}
        {unread !== null && unread > 0 && (
          <button
            type="button"
            aria-label={m.mail_badge({ count: unread })}
            onClick={() => goTo(pages.findIndex((page) => page.tiles.includes(MailTile)))}
          >
            <Badge count={unread} /> {m.module_mail()}
          </button>
        )}
        {news.data?.fresh && news.data.items > 0 && (
          <button
            type="button"
            aria-label={m.deck_badge_news({ count: news.data.items })}
            onClick={() => goTo(pages.findIndex((page) => page.tiles.includes(NewsTile)))}
          >
            <Badge count={news.data.items} /> {m.news_title()}
          </button>
        )}
        {pomodoro.data && pomodoro.data.phase !== 'idle' && pomodoro.data.pausedRemainingMs === null && (
          <button
            type="button"
            aria-label={m.deck_badge_pomodoro()}
            onClick={() => goTo(pages.findLastIndex((page) => page.tiles.includes(PomodoroTile)))}
          >
            <Badge dot>{m.pomodoro_title()}</Badge>
          </button>
        )}
      </nav>
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
            <div
              className={`grid grid-cols-3 ${page.id === 'desk' ? 'gap-xs [&>button]:gap-2xs [&>button]:p-sm' : 'gap-md'}`}
            >
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
