"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";

export interface AnnouncementPillProps {
  /** The announcement line. When it changes (a string), the old line rolls up and the pill eases to the new width. */
  children: ReactNode;
  /** The dark tag before the line, e.g. "New" or "Beta". `false` hides it. */
  tag?: ReactNode | false;
  /** Renders a link; without it the pill is a button (with `onClick`) or plain text. */
  href?: string;
  target?: string;
  rel?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  /** Hide the trailing arrow. */
  arrow?: boolean;
  "aria-label"?: string;
  className?: string;
}

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

const noSubscribe = () => () => {};

/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

const keyOf = (node: ReactNode, fallback: string) => (typeof node === "string" || typeof node === "number" ? String(node) : fallback);

/**
 * Rolls its content when `rollKey` changes: the old copy rises out, the new one rises in, and the clipped box springs
 * to the new width (it follows an invisible copy of the current content). While it rolls the text is clipped, not
 * ellipsized, so a longer line never shows "…" while the box catches up; once settled, `truncate` covers a pill held
 * narrower by its max width.
 */
function Roll({ children, rollKey, reduce, className, truncate = false }: { children: ReactNode; rollKey: string; reduce: boolean; className: string; truncate?: boolean }) {
  const sizer = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);

  useLayoutEffect(() => {
    const el = sizer.current;
    if (!el) return;
    // Rounded up, so a fractional text width never leaves the settled line a hair short (and ellipsized). The computed
    // width is the layout width, so a scale transform on an ancestor (a zoomed modal, a scaled card) doesn't shrink it.
    const measure = () => setWidth(Math.ceil(parseFloat(getComputedStyle(el).width) || 0));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rollKey]);

  return (
    <motion.span
      className="relative block min-w-0 overflow-hidden"
      initial={false}
      animate={width === null ? undefined : { width }}
      transition={reduce ? { duration: 0 } : spring}
      onAnimationStart={() => setRolling(true)}
      onAnimationComplete={() => setRolling(false)}
    >
      <span ref={sizer} aria-hidden className={`invisible absolute left-0 top-0 whitespace-nowrap ${className}`}>
        {children}
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={rollKey}
          className={`block whitespace-nowrap ${truncate && !rolling ? "truncate" : ""} ${className}`}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
          transition={reduce ? { duration: 0.15 } : spring}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}

export function AnnouncementPill({ children, tag = "New", href, target, rel, onClick, arrow = true, className = "", ...aria }: AnnouncementPillProps) {
  const reduce = useReduce();

  const interactive = Boolean(href || onClick);
  const base = `group relative inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 text-fg ${tag === false ? "pl-3" : ""} ${
    interactive ? `transition-colors hover:bg-subtle dark:hover:bg-raised motion-safe:active:scale-[0.98] ${focusRing}` : ""
  } ${className}`;

  const inner = (
    <>
      {/* The tag rolls with the line, so the pill's left part eases to its new width instead of snapping. */}
      {tag !== false && (
        <span className="shrink-0 rounded-full bg-[var(--inverse)] px-2 py-0.5 text-[var(--inverse-fg)]">
          <Roll rollKey={keyOf(tag, "tag")} reduce={reduce} className="text-[12px] font-medium leading-4">
            {tag}
          </Roll>
        </span>
      )}
      <Roll rollKey={keyOf(children, "line")} reduce={reduce} truncate className="text-[13px] font-medium leading-5 tracking-[-0.003em]">
        {children}
      </Roll>
      {arrow && (
        <ArrowRight
          size={16}
          strokeWidth={1.5}
          aria-hidden
          className="shrink-0 text-fg-muted transition-transform duration-200 group-hover:text-fg motion-safe:group-hover:translate-x-0.5"
        />
      )}
    </>
  );

  const enter = {
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: -6 },
    animate: { opacity: 1, y: 0 },
    transition: reduce ? { duration: 0.2 } : spring,
  };

  if (href)
    return (
      <motion.a {...enter} href={href} target={target} rel={rel ?? (target === "_blank" ? "noreferrer" : undefined)} onClick={onClick} className={base} {...aria}>
        {inner}
        {target === "_blank" && <span className="sr-only"> (opens in a new tab)</span>}
      </motion.a>
    );
  if (onClick)
    return (
      <motion.button {...enter} type="button" onClick={onClick} className={base} {...aria}>
        {inner}
      </motion.button>
    );
  return (
    <motion.p {...enter} className={base} {...aria}>
      {inner}
    </motion.p>
  );
}
