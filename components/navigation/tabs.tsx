"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type TabsVariant = "underline" | "pill" | "vertical";

export interface TabItem {
  value: string;
  label: string;
  /** A glyph before the label (16 px reads best). */
  icon?: ReactNode;
  /** A small count after the label, e.g. 12. */
  count?: number | string;
  disabled?: boolean;
  /** The panel for this tab. Leave it out when the view lives somewhere else. */
  content?: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Underline for page sections, pill for compact view switches, vertical for settings. */
  variant?: TabsVariant;
  size?: "sm" | "md";
  /** Hug keeps every tab at its natural width; stretch shares the width equally. */
  layout?: "hug" | "stretch";
  /** Accessible name for the tab list, e.g. "Invoice sections". */
  label?: string;
  className?: string;
}

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;
/** Width of the edge fade on a scrolling tab row (and the room kept around the selected tab). */
const fade = 40;
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

const SIZES = {
  sm: { h: "h-8", text: "text-[13px]", gap: "gap-1.5", box: "h-6 px-2", pill: "h-6 px-2.5", row: "px-2.5" },
  md: { h: "h-9", text: "text-sm", gap: "gap-2", box: "h-7 px-2.5", pill: "h-7 px-3", row: "px-3" },
};

export function Tabs({ items, value, defaultValue, onValueChange, variant = "underline", size = "md", layout = "hug", label, className = "" }: TabsProps) {
  const id = useId();
  const reduce = useReduce();
  const [inner, setInner] = useState(defaultValue ?? items.find((t) => !t.disabled)?.value);
  // The first panel renders as is (no fade on page load); later switches fade in.
  const [switched, setSwitched] = useState(false);
  const current = value ?? inner;
  // A controlled value that changes from outside fades the new panel in too.
  const [seen, setSeen] = useState(current);
  if (seen !== current) {
    setSeen(current);
    setSwitched(true);
  }
  const active = items.find((t) => t.value === current);
  const vertical = variant === "vertical";
  const stretch = layout === "stretch" && !vertical;
  const s = SIZES[size];
  const move = reduce ? { duration: 0 } : spring;

  // A row that scrolls fades the edge that has more tabs past it, so a cut tab reads as "scroll", not a crop.
  const row = useRef<HTMLDivElement>(null);
  // How far each edge stays fully clear: 0 = no fade, 8 = the usual fade, more = a cut sliver of a tab to hide.
  const [edges, setEdges] = useState({ start: 0, end: 0 });
  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    let start = el.scrollLeft > 1 ? 8 : 0;
    let end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1 ? 8 : 0;
    // A tab cut down to a sliver fades out whole instead of reading as a crop: at the start that is an orphan count
    // or label end (up to 56 px); at the end only a bare edge (under 24 px), so a faded next tab still says "more".
    for (const tab of el.querySelectorAll<HTMLElement>('[role="tab"]')) {
      const r = tab.getBoundingClientRect();
      if (start && r.left < box.left && r.right > box.left && r.right - box.left < 56) start = r.right - box.left;
      if (end && r.right > box.right && r.left < box.right && box.right - r.left < 24) end = box.right - r.left;
    }
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
  }, []);
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [measure]);
  // Keep the selected tab in view inside the row (scrolls the row only, never the page).
  useEffect(() => {
    const el = row.current;
    const tab = el?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!el || !tab || el.scrollWidth <= el.clientWidth) return;
    const left = tab.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
    const pad = fade;
    if (left < el.scrollLeft + pad) el.scrollTo({ left: Math.max(0, left - pad), behavior: reduce ? "auto" : "smooth" });
    else if (left + tab.offsetWidth > el.scrollLeft + el.clientWidth - pad)
      el.scrollTo({ left: left + tab.offsetWidth - el.clientWidth + pad, behavior: reduce ? "auto" : "smooth" });
  }, [current, reduce]);
  // The clear part ramps to solid within the fade width (or 12 px past a hidden sliver, so the next tab stays solid).
  const ramp = (clear: number) => (clear > 8 ? clear + 12 : fade);
  const mask =
    edges.start || edges.end
      ? `linear-gradient(to right, ${edges.start ? `transparent ${edges.start}px, #000 ${ramp(edges.start)}px` : "#000 0"}, ${
          edges.end ? `#000 calc(100% - ${ramp(edges.end)}px), transparent calc(100% - ${edges.end}px)` : "#000 100%"
        })`
      : undefined;

  const select = (v: string) => {
    setInner(v);
    setSwitched(true);
    if (v !== current) onValueChange?.(v);
  };

  // Roving focus: arrows move and select, Home / End jump; disabled tabs are skipped.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const [prev, next] = vertical ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
    if (![prev, next, "Home", "End"].includes(e.key)) return;
    const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
    const at = tabs.indexOf(e.target as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    const to = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (at + (e.key === next ? 1 : -1) + tabs.length) % tabs.length;
    tabs[to].focus();
    if (tabs[to].dataset.value) select(tabs[to].dataset.value);
  };

  const list = {
    underline: "relative flex w-max min-w-full gap-1",
    // The kit segmented look: a grey track, the chosen tab a white raised pill.
    pill: `flex w-max gap-0.5 rounded-full bg-[color-mix(in_srgb,var(--fg)_6%,transparent)] p-1 dark:bg-black/25 ${stretch ? "min-w-full" : ""}`,
    vertical: "flex w-full max-w-[248px] shrink-0 flex-col gap-0.5",
  }[variant];

  const tablist = (
    <div role="tablist" aria-label={label} aria-orientation={vertical ? "vertical" : "horizontal"} onKeyDown={onKeyDown} className={list}>
      {items.map((t) => {
        const on = t.value === current;
        const inside = (
          <>
            {t.icon && <span className="flex shrink-0">{t.icon}</span>}
            <span className={vertical ? "min-w-0 flex-1 truncate text-left" : "whitespace-nowrap"}>{t.label}</span>
            {t.count !== undefined && (
              <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-current/10 px-1.5 text-xs font-medium tabular-nums">{t.count}</span>
            )}
          </>
        );
        const shared = {
          type: "button" as const,
          role: "tab",
          id: `${id}-tab-${t.value}`,
          "aria-selected": on,
          // Only the active panel is mounted, so only the active tab points at one.
          "aria-controls": on && t.content !== undefined ? `${id}-panel-${t.value}` : undefined,
          tabIndex: on ? 0 : -1,
          disabled: t.disabled,
          "data-value": t.value,
          onClick: () => select(t.value),
        };

        if (variant === "underline") {
          return (
            <button key={t.value} {...shared} className={`group relative flex ${s.h} ${stretch ? "flex-1" : "shrink-0"} items-center justify-center rounded-[12px] font-medium disabled:opacity-50 ${focusRing}`}>
              <span
                className={`flex ${s.box} ${s.gap} ${s.text} items-center rounded-[12px] transition-colors ${on ? "text-fg" : "text-fg-muted"} ${t.disabled ? "" : "group-hover:bg-fg/5"}`}
              >
                {inside}
              </span>
              {on && <motion.span layoutId={`${id}-indicator`} transition={move} className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-fg" />}
            </button>
          );
        }

        if (variant === "pill") {
          return (
            <button
              key={t.value}
              {...shared}
              className={`relative flex ${s.pill} ${stretch ? "flex-1" : "shrink-0"} items-center justify-center rounded-full ${s.text} font-medium transition-colors duration-200 disabled:opacity-50 ${focusRing} ${
                on ? "text-fg" : "text-fg-muted enabled:hover:text-fg"
              }`}
            >
              {on && (
                <motion.span
                  layoutId={`${id}-indicator`}
                  transition={move}
                  className="absolute inset-0 rounded-full bg-surface shadow-[var(--shadow-btn-secondary)] dark:bg-[color-mix(in_srgb,var(--fg)_16%,var(--surface))]"
                />
              )}
              <span className={`relative flex items-center ${s.gap}`}>{inside}</span>
            </button>
          );
        }

        return (
          <button
            key={t.value}
            {...shared}
            className={`relative flex ${s.h} w-full ${s.row} items-center rounded-[12px] ${s.text} font-medium transition-colors disabled:opacity-50 ${focusRing} ${
              on ? "text-fg" : "text-fg-muted enabled:hover:bg-fg/5"
            }`}
          >
            {on && <motion.span layoutId={`${id}-indicator`} transition={move} className="absolute inset-0 rounded-[12px] bg-raised shadow-[var(--shadow-hairline)]" />}
            <span className={`relative flex min-w-0 flex-1 items-center ${s.gap}`}>{inside}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    // minmax(0, 1fr): hugs its tabs when there is room, shrinks (and the row scrolls) when there isn't.
    <div className={`${vertical ? "flex items-start gap-6" : "grid grid-cols-[minmax(0,1fr)] content-start gap-4"} ${className}`}>
      {vertical ? (
        tablist
      ) : (
        // A row wider than its container scrolls sideways; the 4 px inset keeps the focus ring visible.
        // The underline baseline sits outside the scroller, so the edge fade never hides it.
        <div className="relative min-w-0">
          {variant === "underline" && <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-track" />}
          <motion.div
            ref={row}
            layoutScroll
            onScroll={measure}
            style={{ maskImage: mask, WebkitMaskImage: mask }}
            className="-m-1 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {tablist}
          </motion.div>
        </div>
      )}

      {active?.content !== undefined && (
        <motion.div
          key={active.value}
          role="tabpanel"
          id={`${id}-panel-${active.value}`}
          aria-labelledby={`${id}-tab-${active.value}`}
          tabIndex={0}
          // Opacity only: a y offset would push the panel's bottom edge out for a frame.
          initial={switched ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={`min-w-0 rounded-[12px] ${vertical ? "flex-1" : ""} ${focusRing}`}
        >
          {active.content}
        </motion.div>
      )}
    </div>
  );
}
