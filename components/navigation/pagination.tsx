"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type PaginationVariant = "default" | "compact";

export interface PaginationProps {
  /** Number of items across all pages, e.g. 312. */
  total: number;
  /** 1-based current page. */
  page?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
  pageSize?: number;
  defaultPageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
  /** Choices for “Rows per page”. Pass an empty array to hide the select. */
  pageSizes?: number[];
  /** Pages shown on each side of the current one before an ellipsis. 1 keeps the pager at about 300 px, so it fits a phone. */
  siblings?: number;
  /** Default: rows per page, the range and numbered pages. Compact: ‹ Page 2 of 16 ›. */
  variant?: PaginationVariant;
  /** Show “21–40 of 312”. */
  showRange?: boolean;
  /** Noun after the total, e.g. "invoices" → “21–40 of 312 invoices”. */
  itemLabel?: string;
  disabled?: boolean;
  /** Accessible name of the nav landmark. */
  "aria-label"?: string;
  className?: string;
}

const spring = { type: "spring", stiffness: 520, damping: 34 } as const;
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
const nf = new Intl.NumberFormat("en-US");

type Slot = number | { gap: "start" | "end"; to: number };

/** 1 … 4 5 6 … 16: the ends, the current page with its siblings, and an ellipsis that jumps over the hidden pages. */
function pageSlots(page: number, count: number, siblings: number): Slot[] {
  const size = siblings * 2 + 5; // ends + siblings + current + two gaps
  if (count <= size) return Array.from({ length: count }, (_, i) => i + 1);
  const left = Math.max(page - siblings, 3);
  const right = Math.min(page + siblings, count - 2);
  const startNear = page - siblings <= 3;
  const endNear = page + siblings >= count - 2;
  const span = siblings * 2 + 3;
  if (startNear) return [...Array.from({ length: span }, (_, i) => i + 1), { gap: "end", to: Math.min(span + siblings + 1, count - 1) }, count];
  if (endNear) return [1, { gap: "start", to: Math.max(count - span - siblings, 2) }, ...Array.from({ length: span }, (_, i) => count - span + i + 1)];
  const middle = Array.from({ length: right - left + 1 }, (_, i) => left + i);
  return [1, { gap: "start", to: Math.max(page - siblings * 2 - 1, 2) }, ...middle, { gap: "end", to: Math.min(page + siblings * 2 + 1, count - 1) }, count];
}

/** “Rows per page” as a small listbox: arrows, Home / End, Enter, Escape and type a digit. */
function PageSizeSelect({ value, options, onChange, disabled, reduce }: { value: number; options: number[]; onChange: (n: number) => void; disabled: boolean; reduce: boolean }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const current = Math.max(0, options.indexOf(value));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const show = (at: number) => {
    setActive(at);
    setOpen(true);
  };
  const pick = (i: number) => {
    setOpen(false);
    if (options[i] !== undefined && options[i] !== value) onChange(options[i]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const k = e.key;
    if (!open) {
      if (k === "ArrowDown" || k === "ArrowUp") {
        e.preventDefault();
        show(current);
      }
      return;
    }
    if (k === "ArrowDown" || k === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, Math.max(0, a + (k === "ArrowDown" ? 1 : -1))));
    } else if (k === "Home" || k === "End") {
      e.preventDefault();
      setActive(k === "Home" ? 0 : options.length - 1);
    } else if (k === "Enter" || k === " ") {
      e.preventDefault();
      pick(active);
    } else if (k === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (k === "Tab") {
      setOpen(false);
    } else if (/^\d$/.test(k)) {
      const i = options.findIndex((o) => String(o).startsWith(k));
      if (i >= 0) setActive(i);
    }
  };

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${uid}-list`}
        aria-activedescendant={open ? `${uid}-${active}` : undefined}
        aria-labelledby={`${uid}-label ${uid}-value`}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show(current))}
        onKeyDown={onKeyDown}
        className={`inline-flex h-8 items-center gap-1 rounded-full bg-surface pl-3 pr-2 dark:bg-raised text-[13px] font-medium leading-5 text-fg shadow-[var(--shadow-btn-secondary)] transition-[scale] active:scale-[0.97] disabled:opacity-50 ${focusRing}`}
      >
        <span id={`${uid}-label`} className="sr-only">
          Rows per page
        </span>
        <span id={`${uid}-value`} className="tabular-nums">
          {value}
        </span>
        <motion.span aria-hidden initial={false} animate={{ rotate: open ? 180 : 0 }} transition={reduce ? { duration: 0 } : spring} className="flex text-fg-subtle">
          <ChevronDown size={16} strokeWidth={1.5} />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 4, transition: { duration: 0.12 } }}
            transition={spring}
            onMouseDown={(e) => e.preventDefault()}
            className="absolute bottom-[calc(100%+6px)] left-0 z-30 w-[96px] origin-bottom-left rounded-[16px] bg-surface p-1.5 shadow-[var(--shadow-card)] dark:shadow-[var(--shadow-hairline)]"
          >
            <div role="listbox" id={`${uid}-list`} aria-label="Rows per page" className="flex flex-col gap-0.5">
              {options.map((o, i) => (
                <div
                  key={o}
                  id={`${uid}-${i}`}
                  role="option"
                  aria-selected={o === value}
                  onPointerMove={() => i !== active && setActive(i)}
                  onClick={() => pick(i)}
                  className={`flex h-8 cursor-pointer items-center rounded-[10px] px-2.5 text-[13px] leading-5 tabular-nums text-fg ${o === value ? "font-medium" : ""} ${
                    i === active ? "bg-fg/[0.06]" : ""
                  }`}
                >
                  {o}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Pagination({
  total,
  page: pageProp,
  defaultPage = 1,
  onPageChange,
  pageSize: sizeProp,
  defaultPageSize,
  onPageSizeChange,
  pageSizes = [10, 20, 50, 100],
  siblings = 1,
  variant = "default",
  showRange = true,
  itemLabel,
  disabled = false,
  "aria-label": ariaLabel = "Pagination",
  className = "",
}: PaginationProps) {
  const uid = useId();
  const reduce = useReduce();
  const [ownSize, setOwnSize] = useState(defaultPageSize ?? pageSizes[0] ?? 10);
  const size = Math.max(1, sizeProp ?? ownSize);
  const count = Math.max(1, Math.ceil(total / size));
  const [ownPage, setOwnPage] = useState(defaultPage);
  const page = Math.min(Math.max(1, pageProp ?? ownPage), count);
  const nav = useRef<HTMLElement>(null);
  // The live region speaks only after the user moves the pager, so a parent stepping pages on its own stays quiet.
  const [announce, setAnnounce] = useState(false);
  // Once the line has been read, clear it, so a later page change made by the parent is not announced.
  useEffect(() => {
    if (!announce) return;
    const id = setTimeout(() => setAnnounce(false), 1500);
    return () => clearTimeout(id);
  }, [announce, page, size]);

  const go = (next: number) => {
    const p = Math.min(Math.max(1, next), count);
    if (p === page) return;
    setAnnounce(true);
    if (pageProp === undefined) setOwnPage(p);
    onPageChange?.(p);
  };
  // A new page size keeps the first visible row on screen.
  const resize = (next: number) => {
    const first = (page - 1) * size;
    setAnnounce(true);
    if (sizeProp === undefined) setOwnSize(next);
    onPageSizeChange?.(next);
    const p = Math.floor(first / next) + 1;
    if (pageProp === undefined) setOwnPage(p);
    if (p !== page) onPageChange?.(p);
  };

  // Arrows, Home and End anywhere in the pager; focus follows the current page so you can keep pressing.
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (disabled) return;
    const target =
      e.key === "ArrowLeft" ? page - 1 : e.key === "ArrowRight" ? page + 1 : e.key === "Home" ? 1 : e.key === "End" ? count : e.key === "PageUp" ? page - 5 : e.key === "PageDown" ? page + 5 : null;
    if (target === null) return;
    e.preventDefault();
    go(target);
    requestAnimationFrame(() => (nav.current?.querySelector('[aria-current="page"]') as HTMLElement | null)?.focus());
  };

  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  const range = `${nf.format(from)}–${nf.format(to)}`;
  const roll = reduce ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } } : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 } };

  const arrow = (dir: -1 | 1) => {
    const off = disabled || (dir < 0 ? page <= 1 : page >= count);
    const Icon = dir < 0 ? ChevronLeft : ChevronRight;
    return (
      <button
        type="button"
        aria-label={dir < 0 ? "Previous page" : "Next page"}
        // aria-disabled, not disabled: focus stays on the arrow when it reaches the first or last page.
        aria-disabled={off || undefined}
        onClick={() => !off && go(page + dir)}
        className={`grid size-8 shrink-0 place-items-center rounded-full bg-surface text-fg shadow-[var(--shadow-btn-secondary)] dark:bg-raised transition-[scale,opacity] ${off ? "cursor-default opacity-40" : "active:scale-[0.94]"} ${focusRing}`}
      >
        <Icon size={16} strokeWidth={1.5} />
      </button>
    );
  };

  const status = (
    <p className="flex min-w-0 items-center gap-1 overflow-hidden text-[13px] leading-5 text-fg-muted tabular-nums">
      <span aria-live="polite" className="sr-only">
        {announce && `${range} of ${nf.format(total)}${itemLabel ? ` ${itemLabel}` : ""}`}
      </span>
      <span aria-hidden className="relative inline-grid overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={range} {...roll} transition={reduce ? { duration: 0.12 } : spring} className="whitespace-nowrap text-fg">
            {range}
          </motion.span>
        </AnimatePresence>
      </span>
      <span aria-hidden className="whitespace-nowrap">
        of {nf.format(total)}
        {itemLabel ? ` ${itemLabel}` : ""}
      </span>
    </p>
  );

  if (variant === "compact") {
    return (
      <nav ref={nav} aria-label={ariaLabel} onKeyDown={onKeyDown} className={`inline-flex items-center gap-2 ${disabled ? "opacity-60" : ""} ${className}`}>
        {arrow(-1)}
        <span aria-live="polite" className="sr-only">
          {announce && `Page ${page} of ${count}`}
        </span>
        <span aria-hidden className="min-w-[96px] px-1 text-center text-[13px] leading-5 text-fg-muted tabular-nums">
          Page{" "}
          <span className="relative inline-grid overflow-hidden align-bottom">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={page} {...roll} transition={reduce ? { duration: 0.12 } : spring} className="font-medium text-fg">
                {page}
              </motion.span>
            </AnimatePresence>
          </span>{" "}
          of {nf.format(count)}
        </span>
        {arrow(1)}
      </nav>
    );
  }

  const slots = pageSlots(page, count, Math.max(0, siblings));

  return (
    // Narrower than 560 px: two aligned rows (size + range, then the pager edge to edge). Wider: one row.
    <div className={`@container flex w-full flex-wrap items-center gap-x-4 gap-y-3 ${className}`}>
      {(pageSizes.length > 0 || showRange) && (
        <div className="flex w-full min-w-0 items-center justify-between gap-3 @[560px]:w-auto @[560px]:justify-start">
          {pageSizes.length > 0 && (
            <div className="flex items-center gap-2">
              <span aria-hidden className="whitespace-nowrap text-[13px] leading-5 text-fg-muted max-[420px]:hidden">
                Rows per page
              </span>
              <PageSizeSelect value={size} options={pageSizes.includes(size) ? pageSizes : [...pageSizes, size].sort((a, b) => a - b)} onChange={resize} disabled={disabled} reduce={reduce} />
            </div>
          )}
          {showRange && status}
        </div>
      )}
      <nav ref={nav} aria-label={ariaLabel} onKeyDown={onKeyDown} className="flex w-full items-center justify-between gap-1 @[560px]:ml-auto @[560px]:w-auto @[560px]:justify-start">
        {arrow(-1)}
        <ul className="flex items-center gap-0.5">
          {slots.map((s) =>
            typeof s === "number" ? (
              <li key={s}>
                <button
                  type="button"
                  aria-label={`Page ${s}`}
                  aria-current={s === page ? "page" : undefined}
                  disabled={disabled}
                  onClick={() => go(s)}
                  className={`relative h-8 min-w-8 rounded-full px-1.5 text-[13px] font-medium leading-5 tabular-nums transition-colors ${
                    s === page ? "text-fg" : "text-fg-muted enabled:hover:bg-fg/[0.04] enabled:hover:text-fg"
                  } ${focusRing}`}
                >
                  {s === page && (
                    <motion.span layoutId={reduce ? undefined : `${uid}-page`} transition={spring} aria-hidden className="absolute inset-0 rounded-full bg-surface shadow-[var(--shadow-control)] dark:bg-raised" />
                  )}
                  <span className="relative">{s}</span>
                </button>
              </li>
            ) : (
              <li key={s.gap}>
                <button
                  type="button"
                  aria-label={`Jump to page ${s.to}`}
                  title={`Page ${s.to}`}
                  disabled={disabled}
                  onClick={() => go(s.to)}
                  className={`grid h-8 w-7 place-items-center rounded-full text-[13px] font-medium text-fg-subtle transition-colors enabled:hover:bg-fg/[0.04] enabled:hover:text-fg ${focusRing}`}
                >
                  …
                </button>
              </li>
            )
          )}
        </ul>
        {arrow(1)}
      </nav>
    </div>
  );
}
