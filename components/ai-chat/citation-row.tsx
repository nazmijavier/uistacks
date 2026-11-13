"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown, ExternalLink } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export interface CitationSource {
  id: string;
  /** The page title, e.g. "Best throw blankets under $150?". */
  title: string;
  /** The short address under the title, e.g. "reddit.com/r/BuyItForLife". */
  domain: string;
  href?: string;
  /** Favicon, ideally a full disc like a real favicon (it fills the 20 px circle in the chip and the list); defaults to the site's first letter. */
  icon?: ReactNode;
}

export interface CitationRowProps {
  sources: CitationSource[];
  /** How many favicons stack in the chip (default 4); the label counts them all. */
  maxIcons?: number;
  /** How many sources the open card lists before "Show all" (default 4). */
  previewCount?: number;
  /** The chip label; defaults to "9 sources". */
  label?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * "bottom" (default) opens the list in the flow under the chip. "top" floats it above the chip, over the text
   * before it, for a row that sits right above a docked composer: nothing has to scroll to show it.
   */
  placement?: "bottom" | "top";
  className?: string;
}

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
const spring = { type: "spring", stiffness: 420, damping: 34 } as const;

function Favicon({ source, size, className }: { source: CitationSource; size: number; className: string }) {
  return (
    // Decorative: the chip's label and each row's title name the sources, so the initial letter isn't read out.
    <span aria-hidden className={`grid shrink-0 place-items-center overflow-hidden rounded-full text-fg ${className}`} style={{ width: size, height: size }}>
      {source.icon ?? <span className="text-[11px] font-medium uppercase leading-none text-fg-muted">{source.domain.charAt(0)}</span>}
    </span>
  );
}

/** One source's favicon, title, domain and, for a linked source, the external-link mark. */
function SourceRow({ source, link }: { source: CitationSource; link: boolean }) {
  return (
    <>
      <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-surface shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--fg)_10%,transparent)]">
        {/* A full-disc favicon fills the 20 px circle; the hairline keeps a white or black disc readable on the tile. */}
        <Favicon source={source} size={20} className="ring-1 ring-fg/10 [&_svg]:size-full" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium leading-5 text-fg">{source.title}</span>
        <span className="block truncate text-[13px] leading-5 text-fg-muted">{source.domain}</span>
      </span>
      {link && <ExternalLink size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-fg-muted transition-colors group-hover/row:text-fg" />}
    </>
  );
}

export function CitationRow({
  sources,
  maxIcons = 4,
  previewCount = 4,
  label,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  placement = "bottom",
  className = "",
}: CitationRowProps) {
  const above = placement === "top";
  const reduce = Boolean(useReduce());
  const [inner, setInner] = useState(defaultOpen);
  const open = openProp ?? inner;
  const [all, setAll] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const stacked = sources.slice(0, maxIcons);
  const listed = all ? sources : sources.slice(0, previewCount);
  const text = label ?? `${sources.length} ${sources.length === 1 ? "source" : "sources"}`;

  // Once the list has opened (or grown with "Show all"), scroll the nearest scrolling box (a chat thread) just enough
  // that the whole list sits in view above whatever is docked under it. Only that box scrolls, never the page.
  const listRef = useRef<HTMLDivElement>(null);
  const reveal = () => {
    if (above) return;
    const el = listRef.current;
    let box = el?.parentElement ?? null;
    while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    if (!el || !box || box === document.scrollingElement || box === document.body) return;
    const over = el.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom;
    if (over > 0) box.scrollBy({ top: over, behavior: reduce ? "auto" : "smooth" });
  };

  const setOpen = (next: boolean) => {
    setInner(next);
    onOpenChange?.(next);
    if (!next) setAll(false);
  };

  // The floating list closes on a click outside it, like any popover.
  const rootRef = useRef<HTMLDivElement>(null);
  // Floating above, the list may only use the room between the chip and the top of its scrolling box (or the
  // window); past that it scrolls inside instead of being cut off.
  const [room, setRoom] = useState<number>();
  useEffect(() => {
    if (!above || !open) return;
    const el = rootRef.current;
    let box = el?.parentElement ?? null;
    while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    const inBox = box && box !== document.body && box !== document.scrollingElement ? box : null;
    const measure = () => {
      if (!el) return;
      // Rects are on-screen pixels; inside a scaled preview the max-height is in the element's own pixels.
      const r = el.getBoundingClientRect();
      const k = el.offsetHeight ? r.height / el.offsetHeight : 1;
      setRoom(Math.max(160, (r.top - (inBox ? Math.max(0, inBox.getBoundingClientRect().top) : 0)) / k - 16));
    };
    measure();
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
    };
  }, [above, open, all]);
  useEffect(() => {
    if (!above || !open) return;
    const away = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  });

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-source]"));
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? Math.min(items.length - 1, at + 1) : Math.max(0, at - 1);
    e.preventDefault();
    items[to]?.focus();
  };

  return (
    <div
      ref={rootRef}
      // Escape closes the list from the chip too, not only from inside the list.
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open || e.defaultPrevented) return;
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }}
      className={`flex w-full max-w-[360px] flex-col items-start ${above ? "relative" : ""} ${className}`}>
      <motion.button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        onClick={() => setOpen(!open)}
        whileTap={reduce ? undefined : { scale: 0.97 }}
        // --chip-bg: the chip's own fill, so each favicon's separating ring matches what is behind it.
        className={`group inline-flex h-8 items-center gap-2 rounded-full pl-1 pr-2.5 text-[13px] leading-5 transition-colors ${focusRing} ${
          open ? "bg-muted text-fg [--chip-bg:var(--muted)]" : "text-fg-muted hover:bg-subtle hover:text-fg hover:[--chip-bg:var(--subtle)]"
        }`}
      >
        <span className="flex items-center pl-0.5">
          {stacked.map((s, i) => (
            <motion.span
              key={s.id}
              className="flex"
              style={{ marginLeft: i === 0 ? 0 : -4, zIndex: stacked.length - i }}
              initial={reduce ? false : { opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...spring, delay: reduce ? 0 : i * 0.04 }}
            >
              <Favicon source={s} size={20} className="relative bg-surface shadow-[0_0_0_1.5px_var(--chip-bg,var(--bg))] after:absolute after:inset-0 after:rounded-full after:ring-1 after:ring-inset after:ring-fg/10 [&_svg]:size-full" />
            </motion.span>
          ))}
        </span>
        <span className="whitespace-nowrap">{text}</span>
        <motion.span className="flex text-fg-muted" animate={{ rotate: open ? 180 : 0 }} transition={reduce ? { duration: 0 } : spring}>
          <ChevronDown size={16} strokeWidth={1.5} />
        </motion.span>
      </motion.button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="list"
            ref={listRef}
            id={`${id}-list`}
            onAnimationComplete={() => open && reveal()}
            initial={{ opacity: 0, height: reduce || above ? "auto" : 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: reduce || above ? "auto" : 0 }}
            transition={reduce ? { duration: 0.12 } : spring}
            className={above ? "absolute bottom-full left-0 z-30 mb-2 w-full" : "-mx-4 -mb-6 w-[calc(100%+32px)] overflow-hidden px-4 pb-6"}
          >
            <motion.div
              role="group"
              aria-label={`Sources, ${sources.length}`}
              onKeyDown={onListKey}
              initial={{ scale: reduce ? 1 : 0.96, y: reduce ? 0 : above ? 4 : -4 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: reduce ? 1 : 0.96, y: reduce ? 0 : above ? 4 : -4 }}
              transition={spring}
              style={{ transformOrigin: above ? "bottom left" : "top left", maxHeight: above ? room : undefined }}
              className={`w-full rounded-[20px] bg-surface p-2 ${above ? "overflow-y-auto shadow-[var(--shadow-overlay)]" : "mt-2 shadow-[var(--shadow-card)]"}`}
            >
              <motion.ul layout={reduce ? false : "size"} transition={spring} className="flex flex-col">
                <AnimatePresence initial={false}>
                  {listed.map((s, i) => (
                    <motion.li
                      key={s.id}
                      initial={{ opacity: 0, y: reduce ? 0 : 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ ...spring, delay: reduce ? 0 : Math.max(0, i - (all ? previewCount : 0)) * 0.035 }}
                    >
                      {s.href ? (
                        <a data-source href={s.href} target="_blank" rel="noreferrer" className={`group/row flex items-center gap-3 rounded-[12px] px-2 py-2 transition-colors hover:bg-subtle ${focusRing}`}>
                          <SourceRow source={s} link />
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      ) : (
                        // No address: a plain row, not a link that goes nowhere (no link mark, no hover tint).
                        <div className="flex items-center gap-3 rounded-[12px] px-2 py-2">
                          <SourceRow source={s} link={false} />
                        </div>
                      )}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </motion.ul>
              {sources.length > previewCount && (
                <button
                  type="button"
                  data-source
                  aria-expanded={all}
                  onClick={() => {
                    setAll(!all);
                    // The extra rows land on the next frame; then keep the grown list in view.
                    requestAnimationFrame(() => requestAnimationFrame(reveal));
                  }}
                  className={`mt-0.5 inline-flex h-8 items-center rounded-full px-2 text-[13px] font-medium leading-5 text-fg transition-colors hover:bg-subtle ${focusRing}`}
                >
                  {all ? "Show fewer" : `Show all ${sources.length} sources`}
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
