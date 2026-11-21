import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import { useRef, useState, useSyncExternalStore } from 'react';
import ReactGridLayout, { useContainerWidth, type Layout } from 'react-grid-layout';
import { WidgetContext } from './widget-context.ts';
import { DayLine } from './day-line.tsx';
import { SplitPill } from '../components/split-pill.tsx';
import { useTRPC } from '../lib/trpc.ts';
import { smallestWidgetSize, widgetCells, type WidgetSize } from '../lib/widget-size.ts';
import { m } from '../paraglide/messages.js';
import { defaultLayout, useWidgets, type WidgetItem } from './widgets.ts';

// The server keeps one saved board, Panoramica's.
const zone = 'overview';

const sizeLabel: Record<WidgetSize, () => string> = {
  small: m.widget_size_small,
  medium: m.widget_size_medium,
  large: m.widget_size_large,
  wide: m.widget_size_wide,
  full: m.widget_size_full,
};

// The grid wants pixels; the tokens are rem so the desk's root scaling applies. The root font size is outside React
// (the desk shell sets it), so it is read as an external store: React re-reads it after commit and on resize.
function readGridMetrics() {
  const root = getComputedStyle(document.documentElement);
  const rem = Number.parseFloat(root.fontSize);
  const token = (name: string) => Number.parseFloat(root.getPropertyValue(name)) * rem;
  // A primitive snapshot, so an unchanged size never re-renders.
  return `${token('--spacing-widget-row')} ${token('--spacing-lg')}`;
}

function subscribeToResize(onChange: () => void) {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

// Reading order (rows top to bottom, then left to right), used for "move before/after" and to keep saves stable.
const byPosition = (a: WidgetItem, b: WidgetItem) => a.y - b.y || a.x - b.x;

/** Panoramica as a phone-style home screen: fixed sizes, drag to rearrange in edit mode, saved on the server. */
export function WidgetBoard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const queryKey = trpc.layout.get.queryKey({ zone });
  const saved = useQuery(trpc.layout.get.queryOptions({ zone }));
  const save = useMutation(trpc.layout.save.mutationOptions());
  const reset = useMutation(trpc.layout.reset.mutationOptions());
  const [editing, setEditing] = useState(false);
  const missingRef = useRef<HTMLDivElement>(null);
  const { width, containerRef, mounted } = useContainerWidth();

  const widgets = useWidgets();
  const known = new Map(widgets.map((widget) => [widget.id, widget]));
  // Unknown ids (a widget removed since) and sizes a widget no longer has are dropped, never rendered.
  const items = (saved.data ?? defaultLayout)
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
  const [rowHeight = 0, gap = 0] = useSyncExternalStore(subscribeToResize, readGridMetrics).split(' ').map(Number);

  return (
    <section aria-label={m.widget_board()} className="flex flex-col gap-md">
      <DayLine
        heading
        actions={
          <div className="flex items-center justify-end gap-sm">
            <SplitPill
              open={editing}
              label={editing ? m.widget_done() : m.widget_edit()}
              onClick={() => setEditing((value) => !value)}
              actions={[
                {
                  label: m.widget_add(),
                  disabled: missing.length === 0,
                  onClick: () => {
                    missingRef.current?.scrollIntoView({ block: 'nearest' });
                    missingRef.current?.querySelector('button')?.focus();
                  },
                },
                {
                  label: m.widget_reset(),
                  onClick: () => reset.mutate({ zone }, { onSuccess: () => queryClient.setQueryData(queryKey, null) }),
                },
              ]}
            />
          </div>
        }
      />
      {editing && <p className="text-caption text-muted-foreground">{m.widget_drag_hint()}</p>}
      <div ref={containerRef} className={editing ? 'widget-board editing' : 'widget-board'}>
        {mounted && (
          <ReactGridLayout
            layout={layout}
            width={width}
            gridConfig={{
              cols: 12,
              rowHeight,
              margin: [gap, gap],
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
                  <div className="h-full overflow-hidden rounded-lg" inert={editing}>
                    <WidgetContext value>
                      <Widget size={item.size} />
                    </WidgetContext>
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
                          <ArrowLeftIcon className="size-icon-sm" aria-hidden />
                        </ToolButton>
                        <ToolButton
                          label={m.widget_move_after({ name })}
                          disabled={index === items.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowRightIcon className="size-icon-sm" aria-hidden />
                        </ToolButton>
                        <ToolButton
                          label={m.widget_remove({ name })}
                          onClick={() => commit(items.filter((entry) => entry !== item))}
                        >
                          <XIcon className="size-icon-sm" aria-hidden />
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
        <div ref={missingRef} className="flex flex-col gap-sm rounded-lg border border-dashed border-border p-lg">
          <div className="flex justify-between gap-sm">
            <h2 className="text-label">{m.widget_add()}</h2>
            <span className="text-caption text-muted-foreground">{m.widget_missing_hint()}</span>
          </div>
          <div className="flex flex-wrap gap-xs">
            {missing.map((widget) => (
              <button
                key={widget.id}
                type="button"
                aria-label={m.widget_add_item({ name: widget.label() })}
                // Vertical compaction pulls the added widget into the first gap.
                onClick={() =>
                  commit([...items, { widget: widget.id, size: smallestWidgetSize(widget.sizes), x: 0, y: 200 }])
                }
                className="flex min-h-touch items-center gap-xs rounded-full border border-dashed border-border px-md text-label hover:bg-muted focus-visible:outline focus-visible:outline-accent"
              >
                <PlusIcon className="size-icon-sm" aria-hidden />
                {widget.label()}
              </button>
            ))}
          </div>
          <p className="text-caption text-muted-foreground">{m.widget_add_hint()}</p>
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
