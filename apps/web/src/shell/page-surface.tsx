import { createContext, use, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';

/** True inside a page surface: `Panel` then draws itself as an inner panel. */
export const SurfaceContext = createContext(false);
export const SurfaceScroller = createContext<React.RefObject<HTMLDivElement | null> | null>(null);

export function useInSurface() {
  return use(SurfaceContext);
}

export function PageSurface({
  fill = false,
  float = false,
  bar,
  scrollKey,
  className = '',
  ...rest
}: { fill?: boolean; float?: boolean; bar?: ReactNode; scrollKey?: string } & ComponentProps<'div'>) {
  const scrolls = !fill && !float;
  const surface = useRef<HTMLDivElement>(null);
  const band = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useLayoutEffect(() => {
    if (scrollKey !== undefined) surface.current?.scrollTo(0, 0);
  }, [scrollKey]);
  useLayoutEffect(() => {
    const element = surface.current;
    const header = band.current;
    if (!element || !header || !scrolls) return;
    const observer = new ResizeObserver(() =>
      element.style.setProperty('scroll-padding-top', `${header.offsetHeight}px`),
    );
    observer.observe(header);
    return () => observer.disconnect();
  }, [scrolls]);
  const content = (
    <>
      {bar && (
        <div
          ref={band}
          data-surface-band
          data-scrolled={scrolled}
          className={scrolls ? 'sticky top-0 z-20 -mx-lg shrink-0 bg-surface px-lg pt-lg pb-lg' : 'shrink-0'}
        >
          {bar}
          {scrolls && scrolled && <div aria-hidden className="absolute inset-x-0 bottom-0 border-b border-border" />}
        </div>
      )}
      <div className={`${scrolls ? 'shrink-0' : 'min-h-0'} flex flex-1 flex-col ${className}`} {...rest} />
    </>
  );
  return (
    <SurfaceContext value>
      <SurfaceScroller value={surface}>
        <div
          ref={scrolls ? undefined : surface}
          data-page-surface
          // Chromium does not cut a child's scrollbar at the parent's rounded overflow clip; clip-path does (owner, step 75).
          style={scrolls ? { clipPath: 'inset(0 round var(--radius-xl))' } : undefined}
          className={`relative ${float ? 'mb-3xl' : 'mb-xl'} ${float ? '' : 'overflow-hidden'} flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-surface ${scrolls ? '' : 'gap-lg p-lg'}`}
        >
          {scrolls ? (
            <div
              ref={surface}
              data-page-scroller
              onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}
              style={{ scrollbarColor: 'var(--muted-foreground) transparent' }}
              className={`flex min-h-0 flex-1 [scrollbar-gutter:stable] flex-col overflow-y-auto overscroll-contain bg-surface p-lg ${bar ? 'gap-0 pt-0' : 'gap-lg'}`}
            >
              {content}
            </div>
          ) : (
            content
          )}
        </div>
      </SurfaceScroller>
    </SurfaceContext>
  );
}
