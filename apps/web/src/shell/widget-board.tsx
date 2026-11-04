import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Plus, X } from 'lucide-react';
import { useState } from 'react';
import ReactGridLayout, { useContainerWidth, type Layout } from 'react-grid-layout';
import { TextMorph } from '../components/ui/text-morph.tsx';
import { useTRPC } from '../lib/trpc.ts';
import { widgetCells, type WidgetSize } from '../lib/widget-size.ts';
import { m } from '../paraglide/messages.js';
import { HeaderActions } from './header-slot.tsx';
import { defaultLayouts, widgets, zoneWidgets, type WidgetItem, type ZoneId } from './widgets.ts';

const sizeLabel: Record<WidgetSize, () => string> = {
  small: m.widget_size_small,
  medium: m.widget_size_medium,
  large: m.widget_size_large,
  wide: m.widget_size_wide,
  full: m.widget_size_full,
};

// The grid wants pixels; the tokens are rem so the desk's root scaling applies. Read once the desk layout is in place.
function gridMetrics() {
  const root = getComputedStyle(document.documentElement);
  const rem = Number.parseFloat(root.fontSize);
  const token = (name: string) => Number.parseFloat(root.getPropertyValue(name)) * rem;
  return { rowHeight: token('--spacing-widget-row'), gap: token('--spacing-lg') };
}

// Reading order (rows top to bottom, then left to right), used for "move before/after" and to keep saves stable.
const byPosition = (a: WidgetItem, b: WidgetItem) => a.y - b.y || a.x - b.x;

/** A desk zone as a phone-style home screen: fixed sizes, drag to rearrange in edit mode, saved on the server. */
export function WidgetBoard({ zone }: { zone: ZoneId }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const queryKey = trpc.layout.get.queryKey({ zone });
  const saved = useQuery(trpc.layout.get.queryOptions({ zone }));
  const save = useMutation(trpc.layout.save.mutationOptions());
  const reset = useMutation(trpc.layout.reset.mutationOptions());
  const [editing, setEditing] = useState(false);
  const { width, containerRef, mounted } = useContainerWidth();

  const allowed = zoneWidgets[zone];
  const known = new Map(
    widgets.filter((widget) => allowed === 'all' || allowed.includes(widget.id)).map((widget) => [widget.id, widget]),
  );
  // Unknown ids (a widget removed since) and sizes a widget no longer has are dropped, never rendered.
  const items = (saved.data ?? defaultLayouts[zone])
    .filter((item) => known.get(item.widget)?.sizes.includes(item.size))
    .toSorted(byPosition);

  function commit(next: WidgetItem[]) {
    const sorted = next.toSorted(byPosition);
    queryClient.setQueryData(queryKey, sorted);
    save.mutate({ zone, items: sorted });
  }

  function fromLayout(layout: Layout) {
    const position = new Map(layout.map(({ i, x, y }) => [i, { x, y }]));
    return items.map((item) => ({ ...item, ...position.get(item.widget) }));
  }

  function move(index: number, step: -1 | 1) {
    const other = items[index + step];
    const item = items[index];
    if (!item || !other) return;
    // Swapping positions; the grid resolves any overlap two different sizes leave.
    commit(
      items.map((entry) =>
        entry === item
          ? { ...entry, x: other.x, y: other.y }
          : entry === other
            ? { ...entry, x: item.x, y: item.y }
            : entry,
      ),
    );
  }

  const layout: Layout = items.map((item) => ({ i: item.widget, x: item.x, y: item.y, ...widgetCells[item.size] }));
  const missing = [...known.values()].filter((widget) => !items.some((item) => item.widget === widget.id));
  const metrics = mounted ? gridMetrics() : null;

  return (
    <section aria-label={m.widget_board()} className="col-span-12 flex flex-col gap-md">
      <HeaderActions>
        {/* One pill that splits into Ripristina and Fine while editing, and merges back (see .split-pill). */}
        <div className="split-pill flex items-center" data-open={editing || undefined}>
          <button
            type="button"
            inert={!editing}
            onClick={() => reset.mutate({ zone }, { onSuccess: () => queryClient.setQueryData(queryKey, null) })}
            className="split-pill-extra min-h-touch rounded-full border-border text-label text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-accent"
          >
            {m.widget_reset()}
          </button>
          <button
            type="button"
            aria-label={editing ? m.widget_done() : m.widget_edit()}
            data-editing={editing || undefined}
            onClick={() => setEditing((value) => !value)}
            className="min-h-touch rounded-full border border-border px-lg text-label hover:bg-muted focus-visible:outline focus-visible:outline-accent data-editing:bg-primary data-editing:text-primary-foreground"
          >
            <TextMorph aria-hidden>{editing ? m.widget_done() : m.widget_edit()}</TextMorph>
          </button>
        </div>
      </HeaderActions>
      <div ref={containerRef} className={editing ? 'widget-board editing' : 'widget-board'}>
        {metrics && (
          <ReactGridLayout
            layout={layout}
            width={width}
            gridConfig={{
              cols: 12,
              rowHeight: metrics.rowHeight,
              margin: [metrics.gap, metrics.gap],
              containerPadding: [0, 0],
            }}
            dragConfig={{ enabled: editing, cancel: '.widget-tools' }}
            resizeConfig={{ enabled: false }}
            onDragStop={(next) => commit(fromLayout(next))}
          >
            {items.map((item, index) => {
              const widget = known.get(item.widget);
              if (!widget) return null;
              const Widget = widget.component;
              const name = widget.label();
              return (
                <div key={item.widget} data-widget={item.widget} data-size={item.size} className="widget-cell">
                  {/* While editing the widget is a picture to move: its own buttons must not take the press. */}
                  <div className="h-full overflow-hidden rounded-xl" inert={editing}>
                    <Widget size={item.size} />
                  </div>
                  {editing && (
                    <>
                      <div className="widget-tools desk-glass absolute bottom-sm left-sm rounded-full border p-3xs">
                        <fieldset className="flex">
                          <legend className="sr-only">{m.widget_size_label({ name })}</legend>
                          {widget.sizes.map((size) => (
                            <label
                              key={size}
                              title={sizeLabel[size]()}
                              className="relative flex size-touch cursor-pointer items-center justify-center rounded-full text-caption hover:bg-muted has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:outline has-focus-visible:outline-accent"
                            >
                              <input
                                type="radio"
                                name={`size-${item.widget}`}
                                checked={item.size === size}
                                onChange={() =>
                                  commit(items.map((entry) => (entry === item ? { ...entry, size } : entry)))
                                }
                                className="sr-only"
                              />
                              {/* One letter fits on a small widget; the full name is the radio's accessible name. */}
                              <span aria-hidden>{sizeLabel[size]().charAt(0)}</span>
                              <span className="sr-only">{sizeLabel[size]()}</span>
                            </label>
                          ))}
                        </fieldset>
                      </div>
                      <div className="widget-tools desk-glass absolute top-sm right-sm flex items-center rounded-full border p-3xs">
                        <ToolButton
                          label={m.widget_move_before({ name })}
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowLeft className="size-icon-sm" aria-hidden />
                        </ToolButton>
                        <ToolButton
                          label={m.widget_move_after({ name })}
                          disabled={index === items.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowRight className="size-icon-sm" aria-hidden />
                        </ToolButton>
                        <ToolButton
                          label={m.widget_remove({ name })}
                          onClick={() => commit(items.filter((entry) => entry !== item))}
                        >
                          <X className="size-icon-sm" aria-hidden />
                        </ToolButton>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </ReactGridLayout>
        )}
      </div>
      {editing && missing.length > 0 && (
        <div className="flex flex-col gap-sm">
          <h2 className="text-label">{m.widget_add()}</h2>
          <div className="flex flex-wrap gap-xs">
            {missing.map((widget) => (
              <button
                key={widget.id}
                type="button"
                aria-label={m.widget_add_item({ name: widget.label() })}
                // Added at the bottom in its first size; vertical compaction pulls it up into the first gap.
                onClick={() =>
                  commit([...items, { widget: widget.id, size: widget.sizes[0] ?? 'small', x: 0, y: 200 }])
                }
                className="flex min-h-touch items-center gap-xs rounded-full border border-dashed border-border px-md text-label hover:bg-muted focus-visible:outline focus-visible:outline-accent"
              >
                <Plus className="size-icon-sm" aria-hidden />
                {widget.label()}
              </button>
            ))}
          </div>
        </div>
      )}
      {save.isError && (
        <p role="alert" className="text-caption text-danger">
          {m.widget_save_failed()}
        </p>
      )}
    </section>
  );
}

function ToolButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-touch items-center justify-center rounded-full hover:bg-muted focus-visible:outline focus-visible:outline-accent disabled:opacity-40"
    >
      {children}
    </button>
  );
}
