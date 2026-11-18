import { useRouter } from '@tanstack/react-router';
import { XIcon } from '@phosphor-icons/react';
import type { TodayLine } from '../lib/module-ui.ts';
import { TextMorph } from './ui/text-morph.tsx';
import { FadingLine } from './ui/fading-line.tsx';
import { Badge } from './ui/badge.tsx';
import { m } from '../paraglide/messages.js';

/** One line of Oggi (step 66): chip, text, and a value or "Apri" on the right; the whole row is the link when there is one. */
export function TodayRow({ line }: { line: TodayLine }) {
  const router = useRouter();
  const body = (
    <>
      {line.chip && (
        <Badge outline size="sm" className="shrink-0">
          {line.chip}
        </Badge>
      )}
      <FadingLine
        subject={`${line.text}\n${line.muted ?? ''}`}
        className={`flex-1 ${line.chip ? '' : 'text-muted-foreground'}`}
      >
        {line.text}
        {line.muted && <span className="text-muted-foreground"> {line.muted}</span>}
      </FadingLine>
      {(line.value ?? (line.href ? m.today_open() : undefined)) && (
        <span
          className={
            line.value ? 'shrink-0 text-caps text-muted-foreground' : 'shrink-0 text-caption text-muted-foreground'
          }
        >
          <TextMorph animateWidth={false}>{line.value ?? m.today_open()}</TextMorph>
        </span>
      )}
    </>
  );
  const row = 'flex min-h-0 min-w-0 items-center gap-sm text-body';
  return (
    <li className="min-w-0">
      {line.href ? (
        // A plain anchor pushed through the router: hrefs carry search params (Lavoro's `?segment=`), which `Link`'s typed `to` does not take as a string.
        <a
          href={line.href}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            if (line.href) router.history.push(line.href);
          }}
          className={`${row} rounded-sm hover:text-foreground focus-visible:outline focus-visible:outline-accent`}
        >
          {body}
        </a>
      ) : (
        <div className={row}>
          {body}
          {line.dismiss && (
            <button
              type="button"
              aria-label={line.dismiss.label}
              onClick={line.dismiss.run}
              className="shrink-0 cursor-pointer rounded-full p-2xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <XIcon className="size-icon-sm" aria-hidden />
            </button>
          )}
        </div>
      )}
    </li>
  );
}
