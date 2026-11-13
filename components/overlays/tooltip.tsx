"use client";

import { cloneElement, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type FocusEvent, type HTMLAttributes, type ReactElement, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type TooltipPlacement = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  /** The hint. With size "md" it is the line under the title. */
  content: ReactNode;
  /** Bold first line of the "md" card. */
  title?: string;
  /** Keys shown as chips, e.g. ["⌘", "D"]. */
  shortcut?: string[];
  /** Preferred side; it flips to the opposite side when the viewport has no room. */
  placement?: TooltipPlacement;
  /** "sm" is a one-line label; "md" is a 240 px card with a title. */
  size?: "sm" | "md";
  arrow?: boolean;
  /** Milliseconds of hover or keyboard focus before it opens. */
  delay?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  /** One focusable element, such as a button or a link. It gets aria-describedby while the tooltip shows. */
  children: ReactElement<HTMLAttributes<HTMLElement>>;
  className?: string;
}

const OPPOSITE = { top: "bottom", bottom: "top", left: "right", right: "left" } as const;
const OFFSET = 10; // trigger to bubble, arrow included

const SIDE: Record<TooltipPlacement, { pos: string; origin: string; from: { x?: number; y?: number } }> = {
  top: { pos: "bottom-full left-1/2 mb-1 -translate-x-1/2 flex-col", origin: "origin-bottom", from: { y: 4 } },
  bottom: { pos: "top-full left-1/2 mt-1 -translate-x-1/2 flex-col-reverse", origin: "origin-top", from: { y: -4 } },
  left: { pos: "right-full top-1/2 mr-1 -translate-y-1/2 flex-row", origin: "origin-right", from: { x: 4 } },
  right: { pos: "left-full top-1/2 ml-1 -translate-y-1/2 flex-row-reverse", origin: "origin-left", from: { x: -4 } },
};

// The kit's rounded tip, one drawing per side (it points at the trigger).
const ARROW: Record<TooltipPlacement, { w: number; h: number; d: string; overlap: string }> = {
  top: { w: 12, h: 6, d: "M0 0H12L7.41 4.59C6.63 5.37 5.37 5.37 4.59 4.59L0 0Z", overlap: "-mt-px" },
  bottom: { w: 12, h: 6, d: "M0 6H12L7.41 1.41C6.63 0.63 5.37 0.63 4.59 1.41L0 6Z", overlap: "-mb-px" },
  left: { w: 6, h: 12, d: "M0 0V12L4.59 7.41C5.37 6.63 5.37 5.37 4.59 4.59L0 0Z", overlap: "-ml-px" },
  right: { w: 6, h: 12, d: "M6 0V12L1.41 7.41C0.63 6.63 0.63 5.37 1.41 4.59L6 0Z", overlap: "-mr-px" },
};

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {keys.map((k) => (
        <kbd
          key={k}
          className="grid h-5 min-w-5 place-items-center rounded-[8px] bg-[color-mix(in_srgb,var(--inverse-fg)_18%,transparent)] px-1 font-sans text-xs font-medium leading-4 text-[color-mix(in_srgb,var(--inverse-fg)_64%,transparent)]"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

export function Tooltip({
  content,
  title,
  shortcut,
  placement = "top",
  size = "sm",
  arrow = true,
  delay = 300,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  children,
  className = "",
}: TooltipProps) {
  const id = useId();
  const reduce = useReduce();
  const [inner, setInner] = useState(defaultOpen);
  const open = !disabled && (openProp ?? inner);
  const [side, setSide] = useState<TooltipPlacement>(placement);
  const wrap = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const setOpen = useCallback(
    (next: boolean) => {
      setInner(next);
      onOpenChange?.(next);
    },
    [onOpenChange]
  );
  const show = () => {
    clearTimeout(timer.current);
    if (!open) timer.current = setTimeout(() => setOpen(true), delay);
  };
  // A short grace period lets the pointer cross the gap onto the bubble (it stays hoverable).
  const hide = (wait = 0) => {
    clearTimeout(timer.current);
    if (!open) return;
    if (wait) timer.current = setTimeout(() => setOpen(false), wait);
    else setOpen(false);
  };
  // Keyboard focus opens it; a click that focuses the trigger does not.
  const onFocus = (e: FocusEvent<HTMLSpanElement>) => {
    if ((e.target as HTMLElement).matches(":focus-visible")) show();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    const t = timer;
    return () => clearTimeout(t.current);
  }, []);

  // Viewport-aware flip: measure once the bubble mounts, then take the opposite side if the preferred one has no room.
  const place = useCallback(
    (node: HTMLSpanElement | null) => {
      const t = wrap.current?.getBoundingClientRect();
      if (!node || !t) return;
      const onScreen = t.bottom > 0 && t.right > 0 && t.top < window.innerHeight && t.left < window.innerWidth;
      if (!onScreen) return setSide(placement);
      const room = {
        top: t.top - node.offsetHeight - OFFSET,
        bottom: window.innerHeight - t.bottom - node.offsetHeight - OFFSET,
        left: t.left - node.offsetWidth - OFFSET,
        right: window.innerWidth - t.right - node.offsetWidth - OFFSET,
      };
      const flip = OPPOSITE[placement];
      setSide(room[placement] < 0 && room[flip] > room[placement] ? flip : placement);
    },
    [placement]
  );

  const at = SIDE[side];
  const tip = ARROW[side];
  const from = reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, ...at.from };
  const keys = shortcut && shortcut.length > 0 ? <Keys keys={shortcut} /> : null;

  return (
    <span
      ref={wrap}
      onMouseEnter={show}
      onMouseLeave={() => hide(120)}
      onFocus={onFocus}
      onBlur={() => hide()}
      onPointerDown={() => hide()}
      className={`relative inline-flex ${className}`}
    >
      {cloneElement(children, { "aria-describedby": open ? id : children.props["aria-describedby"] })}
      <AnimatePresence>
        {open && (
          <motion.span
            ref={place}
            id={id}
            role="tooltip"
            initial={from}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ ...from, transition: { duration: 0.12 } }}
            transition={{ type: "spring", stiffness: 520, damping: 34 }}
            className={`absolute z-50 flex items-center ${at.pos} ${at.origin}`}
          >
            <span
              className={`flex bg-[var(--inverse)] text-[var(--inverse-fg)] shadow-[var(--shadow-card)] ${
                size === "sm" ? "h-7 items-center gap-2 whitespace-nowrap rounded-[8px] px-2.5" : "w-[240px] flex-col gap-1 rounded-[16px] px-3 py-2.5"
              }`}
            >
              {size === "sm" ? (
                <>
                  <span className="text-xs font-medium leading-4">{content}</span>
                  {keys}
                </>
              ) : (
                <>
                  {(title || keys) && (
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 text-[13px] font-medium leading-5">{title}</span>
                      {keys}
                    </span>
                  )}
                  <span className="text-xs leading-4 text-[color-mix(in_srgb,var(--inverse-fg)_64%,transparent)]">{content}</span>
                </>
              )}
            </span>
            {arrow && (
              <svg width={tip.w} height={tip.h} viewBox={`0 0 ${tip.w} ${tip.h}`} aria-hidden className={`shrink-0 text-[var(--inverse)] ${tip.overlap}`}>
                <path d={tip.d} fill="currentColor" />
              </svg>
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
