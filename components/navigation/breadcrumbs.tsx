"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronRight, Ellipsis } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export interface BreadcrumbItem {
  /** Stable key; defaults to the label. */
  id?: string;
  label: string;
  /** Renders the crumb as a link. */
  href?: string;
  /** A 16 px glyph before the label. Shown on the first crumb only. */
  icon?: ReactNode;
}

export interface BreadcrumbsProps {
  /** Root first. The last item is the current page: plain text with aria-current, never a link. */
  items: BreadcrumbItem[];
  /**
   * Above this many crumbs the middle ones fold into a “…” menu (first and last two stay). When the row
   * is too narrow it folds further on its own, down to the first crumb, “…” and the current page.
   */
  maxItems?: number;
  /** Crumbs kept after the menu when folded. */
  itemsAfterCollapse?: number;
  separator?: "chevron" | "slash";
  size?: "sm" | "md";
  /**
   * Called on a crumb click or a pick in the “…” menu (index is the item's place in `items`). Call
   * `event.preventDefault()` to route in your app (Next.js router.push) instead of following the href.
   */
  onNavigate?: (item: BreadcrumbItem, index: number, event: MouseEvent<HTMLElement>) => void;
  "aria-label"?: string;
  className?: string;
}

const spring = { type: "spring", stiffness: 520, damping: 34 } as const;
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

function Separator({ kind }: { kind: "chevron" | "slash" }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center text-fg-subtle/70">
      {kind === "chevron" ? <ChevronRight size={16} strokeWidth={1.5} /> : <span className="px-0.5 text-[14px] leading-5">/</span>}
    </span>
  );
}

/** The folded crumbs: a menu button with arrow keys, Home / End, Enter and Escape back to the button. */
function FoldMenu({
  items,
  offset,
  onPick,
  text,
  separator,
  reduce,
}: {
  items: BreadcrumbItem[];
  offset: number;
  onPick: (item: BreadcrumbItem, index: number, event: MouseEvent<HTMLElement>) => void;
  text: string;
  separator: "chevron" | "slash";
  reduce: boolean;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLLIElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    list.current?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus({ preventScroll: true });
  };
  // Keyboard picks click the row, so a link row navigates (or is routed by onNavigate) exactly like a pointer click.
  const pick = (i: number) => document.getElementById(`${uid}-${i}`)?.click();

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = items.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : n - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (e.key.length === 1) {
      const from = (active + 1) % n;
      for (let k = 0; k < n; k++) {
        const i = (from + k) % n;
        if (items[i].label.toLowerCase().startsWith(e.key.toLowerCase())) return setActive(i);
      }
    }
  };

  return (
    <motion.li
      ref={wrap}
      layout={reduce ? false : "position"}
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
      transition={spring}
      className="relative flex shrink-0 items-center gap-0.5"
    >
      <Separator kind={separator} />
      <motion.button
        ref={button}
        type="button"
        aria-label={text}
        title={text}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${uid}-menu` : undefined}
        whileTap={reduce ? undefined : { scale: 0.94 }}
        onClick={() => {
          setActive(0);
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (open || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
          e.preventDefault();
          setActive(e.key === "ArrowDown" ? 0 : items.length - 1);
          setOpen(true);
        }}
        className={`grid h-7 w-8 place-items-center rounded-full text-fg-muted transition-colors hover:bg-fg/[0.06] hover:text-fg ${open ? "bg-fg/[0.06] text-fg" : ""} ${focusRing}`}
      >
        <Ellipsis size={16} strokeWidth={1.5} />
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.12 } }}
            transition={spring}
            className="absolute left-0 top-[calc(100%+6px)] z-40 w-max min-w-[180px] max-w-[260px] origin-top-left rounded-[16px] bg-surface p-1.5 shadow-[var(--shadow-overlay)]"
          >
            <div
              ref={list}
              id={`${uid}-menu`}
              role="menu"
              tabIndex={-1}
              aria-label={text}
              aria-activedescendant={`${uid}-${active}`}
              onKeyDown={onKeyDown}
              onBlur={(e) => {
                if (!wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
              }}
              className="flex flex-col gap-0.5 outline-none"
            >
              {items.map((item, i) => {
                const Row = item.href ? "a" : "div";
                return (
                  <Row
                    key={item.id ?? item.label}
                    id={`${uid}-${i}`}
                    href={item.href}
                    role="menuitem"
                    tabIndex={-1}
                    onPointerMove={() => i !== active && setActive(i)}
                    onMouseDown={(e: MouseEvent<HTMLElement>) => e.preventDefault()}
                    onClick={(e: MouseEvent<HTMLElement>) => {
                      close();
                      onPick(item, offset + i, e);
                    }}
                    className={`flex h-9 cursor-pointer select-none items-center gap-2 rounded-[12px] px-2.5 text-[14px] leading-5 text-fg outline-none ${i === active ? "bg-fg/[0.06]" : ""}`}
                  >
                    <span className="min-w-0 truncate">{item.label}</span>
                  </Row>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export function Breadcrumbs({
  items,
  maxItems = 4,
  itemsAfterCollapse = 2,
  separator = "chevron",
  size = "md",
  onNavigate,
  "aria-label": ariaLabel = "Breadcrumb",
  className = "",
}: BreadcrumbsProps) {
  const reduce = useReduce();
  const list = useRef<HTMLOListElement>(null);
  // How many crumbs fit: starts at maxItems and steps down while the row overflows. The key resets it
  // when the path changes; a width change resets it too.
  const sig = `${maxItems}:${items.map((it) => it.id ?? it.label).join("/")}`;
  const [fit, setFit] = useState({ key: "", limit: maxItems });
  const limit = Math.max(2, fit.key === sig ? fit.limit : maxItems);
  const fold = items.length > limit;
  const squeeze = limit <= 2 || items.length <= 2; // nothing left to fold: labels truncate instead
  const tail = Math.min(Math.max(1, itemsAfterCollapse), limit - 1, items.length - 1);

  useLayoutEffect(() => {
    const el = list.current;
    if (el && limit > 2 && el.scrollWidth > el.clientWidth + 1) setFit({ key: sig, limit: limit - 1 });
  }, [limit, sig]);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - width) < 1) return;
      width = el.clientWidth;
      setFit({ key: "", limit: maxItems });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxItems]);

  const hidden = fold ? items.slice(1, items.length - tail) : [];
  const shown = fold ? [items[0], ...items.slice(items.length - tail)] : items;
  // Did this render fold or unfold crumbs? Only then does an entering crumb wait for its neighbours to slide clear
  // (adjusted during render); a plain drill-down or drill-up shows the new current crumb at once.
  const [seen, setSeen] = useState({ sig, hid: hidden.length, late: false });
  if (seen.sig !== sig || seen.hid !== hidden.length) setSeen({ sig, hid: hidden.length, late: seen.hid !== hidden.length });
  const indexOf = (i: number) => (fold && i > 0 ? items.length - tail + i - 1 : i);
  const text = size === "sm" ? "text-[13px]" : "text-[14px]";
  const enter = reduce ? { opacity: 0 } : { opacity: 0, x: -6 };

  const crumb = (item: BreadcrumbItem, i: number) => {
    const at = indexOf(i);
    const current = at === items.length - 1;
    const icon = at === 0 && item.icon ? <span className="flex shrink-0 [&_svg]:size-4">{item.icon}</span> : null;
    const body = (
      <>
        {icon}
        <span className="min-w-0 truncate">{item.label}</span>
      </>
    );
    const box = `inline-flex h-7 min-w-0 max-w-[200px] items-center gap-1.5 rounded-[8px] px-1.5 leading-5 ${text}`;
    if (current) {
      return (
        <span aria-current="page" title={item.label} className={`${box} font-medium text-fg`}>
          {body}
        </span>
      );
    }
    const onClick = (e: MouseEvent<HTMLElement>) => onNavigate?.(item, at, e);
    const look = `${box} text-fg-muted transition-colors hover:bg-fg/[0.05] hover:text-fg ${focusRing}`;
    return item.href ? (
      <a href={item.href} title={item.label} onClick={onClick} className={look}>
        {body}
      </a>
    ) : (
      <button type="button" title={item.label} onClick={onClick} className={look}>
        {body}
      </button>
    );
  };

  return (
    <nav aria-label={ariaLabel} className={`w-full min-w-0 ${className}`}>
      {/* popLayout: a leaving crumb drops out of flow at once, so the trail reflows in the same frame (no blank slot). */}
      <ol ref={list} className="relative flex min-w-0 items-center gap-0.5">
        <AnimatePresence mode="popLayout" initial={false}>
          {shown.flatMap((item, i) => {
            const li = (
              <motion.li
                key={item.id ?? `${item.label}-${indexOf(i)}`}
                layout={reduce ? false : "position"}
                initial={enter}
                // On a fold or unfold the entering crumb fades in a beat late, once its neighbours have slid clear of its separator.
                animate={{ opacity: 1, x: 0, transition: reduce ? undefined : { x: spring, opacity: { duration: 0.16, delay: seen.late ? 0.2 : 0 } } }}
                // A quick fade with a small drift, so an incoming separator never sits on a leaving crumb.
                exit={reduce ? { opacity: 0, transition: { duration: 0.1 } } : { opacity: 0, x: -6, transition: { duration: 0.08 } }}
                transition={spring}
                // One line: crumbs keep their width while folding can make room, then truncate (the current page last).
                className={`flex min-w-0 items-center gap-0.5 ${!squeeze ? "shrink-0" : i === shown.length - 1 ? "shrink-[0.4]" : ""}`}
              >
                {i > 0 && <Separator kind={separator} />}
                {crumb(item, i)}
              </motion.li>
            );
            if (!(fold && i === 0)) return [li];
            return [li, <FoldMenu key="fold" items={hidden} offset={1} onPick={(it, at, e) => onNavigate?.(it, at, e)} text={`Show ${hidden.length} more`} separator={separator} reduce={reduce} />];
          })}
        </AnimatePresence>
      </ol>
    </nav>
  );
}
