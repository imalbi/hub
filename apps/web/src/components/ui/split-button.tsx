// Hairline UI · split-button · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

'use client';

import * as React from 'react';
import { CaretDownIcon } from '@phosphor-icons/react';
import { TextMorph } from './text-morph.tsx';
import { INTERACTION_FOCUS, interactionIcon, useInteractionReducedMotion } from './ui-interaction-motion.ts';

export interface SplitMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface SplitButtonProps {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  menuItems: SplitMenuItem[];
  variant?: 'primary' | 'secondary' | 'destructive';
  disabled?: boolean;
  loading?: boolean;
  /** Accessible name of the chevron and the menu; the caller fills it in Italian. */
  menuLabel: string;
  className?: string;
}

// Exact physics & timing from FilterBar
const EASE = 'cubic-bezier(0.16,1,0.3,1)';
const UI = 'cubic-bezier(0.23,1,0.32,1)';
const OPEN = 280;
const CLOSE = 200;
// In rem: the desk root is 150%, so pixel geometry would come out too small there.
const PANEL_MIN_REM = 14;
const GAP_REM = 0.375;

type Phase = 'closed' | 'opening' | 'open' | 'closing';
type Box = { left: number; top: number; width: number; height: number };

const variantStyles = {
  primary: {
    container: 'bg-primary text-primary-foreground',
    action: 'hover:bg-primary-foreground/10 active:bg-primary-foreground/15 text-primary-foreground',
    trigger: 'hover:bg-primary-foreground/10 active:bg-primary-foreground/15 text-primary-foreground',
    divider: 'bg-primary-foreground/25',
  },
  secondary: {
    container: 'bg-surface text-foreground shadow-[inset_0_0_0_1px_var(--border)]',
    action: 'hover:bg-muted active:bg-muted/80 text-foreground',
    trigger: 'hover:bg-muted active:bg-muted/80 text-foreground',
    divider: 'bg-border',
  },
  destructive: {
    container: 'bg-danger/10 text-danger shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--danger)_30%,transparent)]',
    action: 'hover:bg-danger/15 active:bg-danger/20 text-danger',
    trigger: 'hover:bg-danger/15 active:bg-danger/20 text-danger',
    divider: 'bg-danger/25',
  },
};

function rootRem() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

export function SplitButton({
  label,
  icon,
  onClick,
  menuItems,
  variant = 'primary',
  disabled = false,
  loading = false,
  menuLabel,
  className = '',
}: SplitButtonProps) {
  const reduced = useInteractionReducedMotion();
  const [phase, setPhase] = React.useState<Phase>('closed');
  const [box, setBox] = React.useState<Box>({ left: 0, top: 0, width: 0, height: 0 });
  const [geometry, setGeometry] = React.useState({ menuWidth: 0, gap: 0 });
  const [panelH, setPanelH] = React.useState(0);
  const [activeIndex, setActiveIndex] = React.useState(0);

  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const timer = React.useRef<number>(0);

  const v = variantStyles[variant];
  const inert = disabled || loading;
  const mounted = phase !== 'closed';
  const expanded = phase === 'open';

  // Open the morphing floating dropdown from the trigger pill
  const openMenu = () => {
    const wrap = wrapRef.current;
    const trigger = triggerRef.current;
    if (!wrap || !trigger) return;
    window.clearTimeout(timer.current);
    const a = trigger.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    const rem = rootRem();
    setBox({ left: a.left - w.left, top: a.top - w.top, width: a.width, height: a.height });
    setGeometry({ menuWidth: Math.max(PANEL_MIN_REM * rem, w.width), gap: GAP_REM * rem });
    setActiveIndex(0);
    setPhase(reduced ? 'open' : 'opening');
  };

  const closeMenu = React.useCallback(
    (refocus = true) => {
      window.clearTimeout(timer.current);
      if (refocus) {
        triggerRef.current?.focus({ preventScroll: true });
      }
      if (reduced) {
        setPhase('closed');
        return;
      }
      setPhase('closing');
      timer.current = window.setTimeout(() => {
        setPhase('closed');
      }, CLOSE);
    },
    [reduced],
  );

  // FilterBar double-rAF expansion
  React.useEffect(() => {
    if (phase !== 'opening') return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setPhase('open'));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [phase]);

  // Clean timer on unmount
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  // Measure content height dynamically
  React.useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const measure = () => setPanelH(panel.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [menuItems, mounted]);

  // Close on outside pointer click
  React.useEffect(() => {
    if (!mounted || phase === 'closing') return;
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !wrapRef.current?.contains(e.target)) {
        closeMenu(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [mounted, phase, closeMenu]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!mounted || phase === 'closing') {
      if (e.key === 'ArrowDown' && document.activeElement === triggerRef.current) {
        e.preventDefault();
        openMenu();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < menuItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : menuItems.length - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(menuItems.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const current = menuItems[activeIndex];
      if (current && !current.disabled) {
        closeMenu(true);
        current.onSelect();
      }
    }
  };

  const handleActionClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (inert) {
      e.preventDefault();
      return;
    }
    onClick?.();
  };

  const toggleDropdown = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (inert) return;
    if (mounted && phase !== 'closing') {
      closeMenu();
    } else {
      openMenu();
    }
  };

  // Dimensions & alignment: matches FilterBar's floating panel geometry
  const { menuWidth, gap } = geometry;
  const targetLeft = box.left + box.width - menuWidth;
  const targetTop = box.top + box.height + gap;

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- keys bubble up from the buttons and menu items inside; the wrapper itself is never focused // guard-private: allow lint rule name
    <div
      ref={wrapRef}
      onKeyDown={handleKeyDown}
      className={`relative isolate ${mounted ? 'z-50' : ''} inline-flex h-touch items-stretch rounded-full text-label transition-[scale] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] select-none has-[button:active:not(:disabled)]:scale-[0.98] motion-reduce:transition-none motion-reduce:has-[button:active]:scale-100 ${v.container} ${
        disabled ? 'opacity-45' : ''
      } ${className}`}
    >
      {/* Primary Action Button */}
      <button
        type="button"
        disabled={inert}
        onClick={handleActionClick}
        aria-busy={loading || undefined}
        className={`relative inline-flex cursor-pointer items-center justify-center gap-xs rounded-l-full pr-sm pl-md font-medium whitespace-nowrap transition-colors duration-200 disabled:cursor-default ${v.action} ${INTERACTION_FOCUS}`}
      >
        {/* The slot opens for an icon or the spinner; they trade places through a blur. */}
        <span
          aria-hidden="true"
          className="relative flex size-icon shrink-0 items-center justify-center"
          style={{
            width: icon || loading ? undefined : 0,
            marginRight: icon || loading ? undefined : 'calc(-1 * var(--spacing-xs))',
            transition: reduced ? 'none' : `width 380ms ${EASE}, margin-right 380ms ${EASE}`,
          }}
        >
          <span
            className="absolute inset-0 flex items-center justify-center"
            style={interactionIcon(!loading, reduced)}
          >
            {icon}
          </span>
          <span className="absolute inset-0 flex items-center justify-center" style={interactionIcon(loading, reduced)}>
            <span
              className={`size-sm rounded-full border-[1.5px] border-current border-t-transparent ${loading ? 'animate-spin' : ''}`}
            />
          </span>
        </span>
        <TextMorph>{label}</TextMorph>
      </button>

      {/* Quiet Hairline Divider */}
      <span aria-hidden="true" className={`my-xs w-px self-stretch ${v.divider}`} />

      {/* Dropdown Chevron Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={inert}
        onClick={toggleDropdown}
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={mounted && phase !== 'closing'}
        className={`relative inline-flex cursor-pointer items-center justify-center rounded-r-full px-sm transition-colors duration-200 disabled:cursor-default ${v.trigger} ${INTERACTION_FOCUS}`}
      >
        <CaretDownIcon
          className="size-icon"
          style={{
            transform: mounted && phase !== 'closing' ? 'rotate(180deg)' : 'none',
            transition: reduced ? 'none' : `transform 300ms ${EASE}`,
          }}
        />
      </button>

      {/* Floating Panel: Morphs out from under the trigger pill with HairlineUI physics */}
      {mounted && (
        <div
          role="menu"
          aria-label={menuLabel}
          className="absolute z-50 overflow-hidden bg-surface text-foreground"
          style={{
            top: targetTop,
            left: expanded ? targetLeft : box.left,
            width: expanded ? menuWidth : box.width,
            height: expanded ? panelH : box.height,
            borderRadius: expanded ? 'var(--radius-md)' : box.height / 2,
            opacity: expanded ? 1 : 0,
            boxShadow: '0 0 0 1px var(--border)',
            transition: reduced
              ? 'none'
              : phase === 'closing'
                ? `width ${CLOSE}ms ${UI}, height ${CLOSE}ms ${UI}, left ${CLOSE}ms ${UI}, border-radius ${CLOSE}ms ${UI}, opacity ${CLOSE}ms ${UI}`
                : `width ${OPEN}ms ${UI}, height ${OPEN}ms ${UI}, left ${OPEN}ms ${UI}, border-radius ${OPEN}ms ${UI}, opacity 160ms ${UI}`,
          }}
        >
          <div
            ref={panelRef}
            inert={!expanded ? true : undefined}
            className="relative p-2xs"
            style={{
              width: menuWidth,
              opacity: expanded ? 1 : 0,
              transition: reduced ? 'none' : expanded ? `opacity 180ms ${EASE} 60ms` : 'opacity 90ms ease-out',
            }}
          >
            {/* The Internal Highlight Glides Between Menu Rows; rows and highlight share one height, so a step is 100%. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-2xs top-2xs h-touch rounded-sm bg-muted"
              style={{
                transform: `translateY(${activeIndex * 100}%)`,
                opacity: activeIndex >= 0 && menuItems.length > 0 ? 1 : 0,
                transition: reduced ? 'none' : `transform 160ms ${UI}`,
              }}
            />

            {/* Menu Items */}
            {menuItems.map((item, index) => {
              const isDestructive = item.destructive;
              const isSelected = activeIndex === index;

              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  data-menu-item=""
                  disabled={item.disabled}
                  onPointerEnter={() => !item.disabled && setActiveIndex(index)}
                  onClick={() => {
                    closeMenu(false);
                    item.onSelect();
                  }}
                  className={`relative z-10 flex h-touch w-full cursor-pointer items-center gap-xs rounded-sm px-sm text-left text-label font-medium transition-colors select-none disabled:cursor-not-allowed disabled:opacity-40 ${
                    isDestructive
                      ? isSelected
                        ? 'font-semibold text-danger'
                        : 'text-danger/90'
                      : isSelected
                        ? 'font-semibold text-foreground'
                        : 'text-muted-foreground'
                  } ${INTERACTION_FOCUS}`}
                >
                  {item.icon && (
                    <span
                      className={`inline-flex size-icon shrink-0 items-center justify-center ${
                        isDestructive ? 'text-danger' : 'text-muted-foreground'
                      }`}
                    >
                      {item.icon}
                    </span>
                  )}
                  <span className="flex-1 truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
