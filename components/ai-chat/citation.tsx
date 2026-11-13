"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type FocusEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";

export interface CitationProps {
  index: number;
  /** The chip label, e.g. a domain: "support.google.com". */
  label: string;
  /** Hover card title and meta line. */
  title?: string;
  meta?: string;
  /** Quote with the cited part wrapped in [[double brackets]] to highlight it. */
  quote?: string;
  href?: string;
  /** Favicon or file glyph, shown on the chip and in the card; defaults to the UI Stacks mark. */
  icon?: ReactNode;
  /** Start with the hover card open (for previews). It stays as the resting card: pointer and focus leaving don't
   * close it, another citation's card replaces it, and it comes back once that card closes. */
  defaultOpen?: boolean;
  className?: string;
}

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

const ring = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
const GAP = 8; // chip to card
const EDGE = 8; // kept free at the viewport edge
const CLOSE_DELAY = 150; // time to move the pointer from the chip onto the card
// One card at a time: a citation that opens tells the others to close.
const OPEN_EVENT = "citation:open";
const CLOSE_EVENT = "citation:close";

function DefaultMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path d="M4.38 14.14 14.38 19.14 17.24 17.71v1.91L12.47 22 2.95 17.24v-2.38l1.43-.72ZM6.28 8.9l10 5 2.86-1.43v1.91l-4.76 2.38L4.85 12V9.62l1.43-.72ZM11.52 2l9.52 4.76v2.38l-4.76 2.38-9.52-4.76V4.38L11.52 2Z" fill="currentColor" />
    </svg>
  );
}

function Quote({ text }: { text: string }) {
  const parts = text.split(/(\[\[.*?\]\])/);
  return (
    <>
      “
      {parts.map((p, i) =>
        p.startsWith("[[") ? (
          <mark key={i} className="rounded-[4px] bg-select-soft px-0.5 text-fg [box-decoration-break:clone]">
            {p.slice(2, -2)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
      ”
    </>
  );
}

export function Citation({ index, label, title, meta, quote, href, icon, defaultOpen = false, className = "" }: CitationProps) {
  const [open, setOpenState] = useState(defaultOpen);
  // Where the card sits: above the chip unless only below has room, and shifted left to stay on screen.
  const [pos, setPos] = useState({ below: false, left: 0 });
  const id = useId();
  const descId = useId();
  const reduce = useReduce();
  const wrap = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLSpanElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const restTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isOpen = useRef(defaultOpen);
  // A card someone opened may flip below the chip; a defaultOpen preview keeps its place.
  const byUser = useRef(false);
  // Opened by the pointer resting on the chip: the click that follows keeps it open instead of closing it.
  const byHover = useRef(false);
  const hasCard = Boolean(title || quote);
  // The card's text, always in the DOM so the chip can point at it with aria-describedby.
  const description = [title, meta, quote?.replace(/\[\[|\]\]/g, "")].filter(Boolean).join(". ");

  const setOpen = useCallback(
    (next: boolean) => {
      clearTimeout(timer.current);
      clearTimeout(restTimer.current);
      const was = isOpen.current;
      isOpen.current = next;
      if (!next) byHover.current = false;
      setOpenState(next);
      if (next) {
        byUser.current = true;
        window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
      } else if (was) window.dispatchEvent(new CustomEvent(CLOSE_EVENT, { detail: id }));
    },
    [id]
  );

  // Another citation opened: this one closes, a defaultOpen card included. Once that card closes, the defaultOpen
  // card comes back in its own place (after a beat, so moving between chips doesn't flash it).
  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail === id) return;
      clearTimeout(timer.current);
      clearTimeout(restTimer.current);
      isOpen.current = false;
      setOpenState(false);
    };
    const onClosed = (e: Event) => {
      if (!defaultOpen || (e as CustomEvent<string>).detail === id) return;
      clearTimeout(restTimer.current);
      restTimer.current = setTimeout(() => {
        byUser.current = false;
        isOpen.current = true;
        setOpenState(true);
      }, CLOSE_DELAY * 2);
    };
    window.addEventListener(OPEN_EVENT, onOther);
    window.addEventListener(CLOSE_EVENT, onClosed);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOther);
      window.removeEventListener(CLOSE_EVENT, onClosed);
    };
  }, [id, defaultOpen]);

  const place = useCallback(() => {
    const w = wrap.current;
    const c = card.current;
    if (!w || !c) return;
    const t = w.getBoundingClientRect();
    const k = w.offsetWidth ? t.width / w.offsetWidth : 1; // a zoomed or scaled parent
    const cw = c.offsetWidth * k;
    const ch = c.offsetHeight * k;
    const above = t.top - GAP;
    const below = byUser.current && above < ch && window.innerHeight - t.bottom - GAP > above;
    const vw = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth);
    const left = (Math.min(Math.max(t.left, EDGE), Math.max(EDGE, vw - EDGE - cw)) - t.left) / k;
    setPos((p) => (p.below === below && Math.abs(p.left - left) < 0.5 ? p : { below, left }));
  }, []);

  const cardRef = useCallback(
    (node: HTMLSpanElement | null) => {
      card.current = node;
      if (node) place();
    },
    [place]
  );

  // While open: follow scroll and resize, and Escape closes it (focus stays on the chip).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const inside = wrap.current?.contains(document.activeElement);
      setOpen(false);
      if (inside) (wrap.current?.firstElementChild as HTMLElement | null)?.focus();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, place, setOpen]);

  useEffect(() => {
    const t = timer;
    const rest = restTimer;
    return () => {
      clearTimeout(t.current);
      clearTimeout(rest.current);
    };
  }, []);

  const chip = {
    onFocus: () => !open && setOpen(true),
    // Focus moving onto the card keeps it open.
    onBlur: (e: FocusEvent<HTMLElement>) => {
      if (!defaultOpen && !wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
    },
    "aria-describedby": hasCard ? descId : undefined,
    className: `inline-flex h-8 items-center gap-2 rounded-full bg-surface px-3 text-sm text-fg shadow-[inset_0_0_0_1px_var(--border)] transition hover:bg-subtle ${ring}`,
  };
  const inner = (
    <>
      <span className="text-fg-muted">{index}</span>
      {icon ?? <DefaultMark />}
      {label}
    </>
  );
  const from = reduce ? { opacity: 0 } : { opacity: 0, y: pos.below ? -6 : 6, scale: 0.97 };

  return (
    <span
      ref={wrap}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => {
        if (open) return clearTimeout(timer.current);
        byHover.current = true;
        setOpen(true);
      }}
      onMouseLeave={() => {
        clearTimeout(timer.current);
        if (!defaultOpen) timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY);
      }}
    >
      {/* No href: a button that opens and closes the card, never a dead "#" link. */}
      {href ? (
        <a href={href} {...chip}>
          {inner}
        </a>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (!open) setOpen(true);
            else if (byHover.current) byHover.current = false;
            else setOpen(false);
          }}
          {...chip}
        >
          {inner}
        </button>
      )}
      {hasCard && (
        <span id={descId} className="sr-only">
          {description}
        </span>
      )}
      <AnimatePresence>
        {open && hasCard && (
          <motion.span
            ref={cardRef}
            initial={from}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ ...from, transition: { duration: 0.12 } }}
            transition={{ type: "spring", stiffness: 520, damping: 34 }}
            style={{ left: pos.left, transformOrigin: `${-pos.left + 16}px ${pos.below ? "0%" : "100%"}` }}
            // The ::after strip bridges the 8 px gap, so the pointer can travel from the chip onto the card.
            className={`absolute z-20 block w-[280px] rounded-[16px] bg-surface p-4 text-left shadow-[var(--shadow-overlay)] after:absolute after:inset-x-0 after:h-2 ${
              pos.below ? "top-[calc(100%+8px)] after:bottom-full" : "bottom-[calc(100%+8px)] after:top-full"
            }`}
          >
            {/* aria-hidden: the chip already reads this text through aria-describedby. */}
            <span aria-hidden className="block">
              <span className="flex items-center gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-surface shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--fg)_10%,transparent)] text-fg [&>svg]:size-4">{icon ?? <DefaultMark />}</span>
                <span className="min-w-0">
                  {title && <span className="block truncate text-[15px] font-medium leading-[22px] text-fg">{title}</span>}
                  {meta && <span className="block truncate text-[13px] leading-5 text-fg-muted">{meta}</span>}
                </span>
              </span>
              {quote && (
                <span className="mt-3 block text-pretty text-[15px] leading-[22px] text-fg-muted">
                  <Quote text={quote} />
                </span>
              )}
            </span>
            {/* Repeats the chip's link for the pointer; keyboard users follow the chip itself, so it's out of the tab order. */}
            {href && (
              <a href={href} tabIndex={-1} className="mt-3 flex w-fit items-center gap-1.5 text-[13px] leading-5 text-fg-muted transition-colors hover:text-fg">
                <ArrowUpRight size={16} strokeWidth={1.5} aria-hidden /> Open source<span className="sr-only">: {title ?? label}</span>
              </a>
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
