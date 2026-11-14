import { createContext, use, type ComponentProps } from 'react';

/** True inside a page surface: `Panel` then draws itself as an inner panel. */
export const SurfaceContext = createContext(false);

export function useInSurface() {
  return use(SurfaceContext);
}

/**
 * The one rounded surface of a zone page (step 47): all the page's content, under its tabs. It fills the height left by
 * the tab row and keeps one `xl` gap to the window bottom. A `fill` page lays out and scrolls its own lists; any other
 * page scrolls inside the surface, so the scrollbar sits at the surface edge. A `float` page hangs something over the
 * bottom edge (the Musica player, `-bottom-touch`): the surface then does not clip and leaves room under it. Extra props
 * carry the tabpanel semantics.
 */
export function PageSurface({
  fill = false,
  float = false,
  className = '',
  ...rest
}: { fill?: boolean; float?: boolean } & ComponentProps<'div'>) {
  return (
    <SurfaceContext value>
      <div
        data-page-surface
        className={`relative ${float ? 'mb-3xl' : 'mb-xl'} flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-surface p-lg ${
          float ? '' : fill ? 'overflow-hidden' : 'overflow-y-auto overscroll-contain'
        } ${className}`}
        {...rest}
      />
    </SurfaceContext>
  );
}
