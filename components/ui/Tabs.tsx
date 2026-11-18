'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem {
  id: string;
  label: React.ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  label?: string;
  className?: string;
  /** Prefix used to link tabs to panels: tab id `${idPrefix}-tab-${id}`, panel `${idPrefix}-panel-${id}`. */
  idPrefix?: string;
}

/** Pill tabs with roving focus (arrow keys, Home/End). Render panels with <TabPanel>. */
export function Tabs({
  items,
  value,
  defaultValue,
  onChange,
  label = 'Sections',
  className,
  idPrefix,
}: TabsProps) {
  const auto = useId();
  const prefix = idPrefix ?? auto;
  const [inner, setInner] = useState(defaultValue ?? items[0]?.id);
  const current = value ?? inner;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // Active indicator that slides from tab to tab (transform only). Until it is measured the
  // selected tab draws its own background (server render, no JavaScript).
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const index = items.findIndex((t) => t.id === current);
  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[index];
      if (el) setBox({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [index]);

  const select = (id: string) => {
    if (value === undefined) setInner(id);
    onChange?.(id);
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const item = items[next];
    if (!item) return;
    select(item.id);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'relative inline-flex max-w-full flex-wrap gap-1.5 rounded-[28px] border border-border bg-surface-0 p-1.5',
        className,
      )}
    >
      {box && (
        <span
          aria-hidden="true"
          className="nm-tab-indicator"
          style={{
            height: box.h,
            transform: `translate(${box.x}px, ${box.y}px) scaleX(${box.w / 100})`,
          }}
        />
      )}
      {items.map((t, i) => {
        const selected = t.id === current;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${prefix}-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${prefix}-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => select(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'nm-tab relative min-h-tap cursor-pointer rounded-pill border-0 px-5 font-sans text-[15px] font-semibold max-sm:px-3.5',
              selected
                ? cn('text-on-night', box ? 'bg-transparent' : 'bg-night')
                : 'bg-transparent text-ink',
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  idPrefix,
  id,
  hidden,
  children,
  className,
}: {
  idPrefix: string;
  id: string;
  hidden?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${id}`}
      aria-labelledby={`${idPrefix}-tab-${id}`}
      hidden={hidden}
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  );
}
