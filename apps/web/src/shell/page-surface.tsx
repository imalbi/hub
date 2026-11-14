import { createContext, use, type ComponentProps, type ReactNode } from 'react';

/** True inside a page surface: `Panel` then draws itself as an inner panel. */
export const SurfaceContext = createContext(false);

export function useInSurface() {
  return use(SurfaceContext);
}

/**
 * The one rounded surface of a zone page (step 47): all the page's content, with the tab bar (`bar`, step 47c) as its
 * first row. It starts at the desk's top inset, fills the height and keeps one `xl` gap to the window bottom. The body
 * under the bar takes `className` and the tabpanel props: a `fill` page lays out and scrolls its own lists; any other
 * page scrolls the body, its scrollbar pulled to the surface edge. A `float` page hangs something over the bottom edge
 * (the Musica player, `-bottom-touch`): the surface then does not clip and leaves room under it.
 */
export function PageSurface({
  fill = false,
  float = false,
  bar,
  className = '',
  ...rest
}: { fill?: boolean; float?: boolean; bar?: ReactNode } & ComponentProps<'div'>) {
  const scrolls = !fill && !float;
  return (
    <SurfaceContext value>
      <div
        data-page-surface
        className={`relative ${float ? 'mb-3xl' : 'mb-xl overflow-hidden'} flex min-h-0 flex-1 flex-col gap-lg rounded-xl border border-border bg-surface p-lg`}
      >
        {bar && <div className="shrink-0 self-start">{bar}</div>}
        <div
          className={`${scrolls ? '-mr-lg -mb-lg overflow-y-auto overscroll-contain pr-lg pb-lg' : ''} flex min-h-0 flex-1 flex-col ${className}`}
          {...rest}
        />
      </div>
    </SurfaceContext>
  );
}
