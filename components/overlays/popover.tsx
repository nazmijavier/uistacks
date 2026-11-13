"use client";

import {
  cloneElement,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type HTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type PopoverPlacement = "top" | "bottom";
export type PopoverAlign = "start" | "center" | "end";

export interface PopoverApi {
  /** Closes the popover and hands focus back to the trigger. */
  close: () => void;
}

export interface PopoverProps {
  /** One button that opens and closes it. It gets aria-expanded, aria-haspopup and aria-controls. */
  trigger: ReactElement<HTMLAttributes<HTMLElement>>;
  /** The panel body. Pass a function to get `close`, e.g. for a button that finishes the task. */
  children: ReactNode | ((api: PopoverApi) => ReactNode);
  /** Heading at the top of the panel; it also names the dialog. */
  title?: ReactNode;
  description?: ReactNode;
  /** A round close button in the top corner. */
  showClose?: boolean;
  /** Preferred side; it flips when the viewport has no room there. */
  placement?: PopoverPlacement;
  /** How the panel lines up with the trigger; it also shifts to stay 8 px inside the viewport. */
  align?: PopoverAlign;
  /** Flip and shift to stay inside the viewport. Turn it off for a panel that is always open in a fixed frame. */
  avoidCollisions?: boolean;
  /** Panel width in px, never wider than the viewport minus 16. */
  width?: number;
  arrow?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Where focus lands when someone opens it. Defaults to the first field or button inside. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Move focus in when it opens from the trigger. A controlled `open` never moves focus. */
  autoFocus?: boolean;
  /** Names the dialog when there is no title. */
  "aria-label"?: string;
  disabled?: boolean;
  /** Classes for the panel. */
  className?: string;
}

const GAP = 10; // trigger to panel, arrow included
const EDGE = 8; // kept free at the viewport edge
const spring = { type: "spring", stiffness: 520, damping: 34 } as const;
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The kit's rounded tip in the panel colour, with the panel's 1 px edge on its two sides. */
function Arrow({ side, x }: { side: PopoverPlacement; x: number }) {
  const up = side === "bottom"; // panel under the trigger: the tip points up
  return (
    <svg
      aria-hidden
      width="16"
      height="8"
      viewBox="0 0 16 8"
      style={{ left: x - 8 }}
      className={`pointer-events-none absolute ${up ? "-top-[7px]" : "-bottom-[7px] rotate-180"}`}
    >
      <path d="M0 8 6.3 1.2c.9-1 2.5-1 3.4 0L16 8Z" className="fill-surface dark:fill-raised" />
      <path d="M0 8 6.3 1.2c.9-1 2.5-1 3.4 0L16 8" fill="none" stroke="var(--edge)" strokeWidth="1" />
    </svg>
  );
}

export function Popover({
  trigger,
  children,
  title,
  description,
  showClose = false,
  placement = "bottom",
  align = "center",
  avoidCollisions = true,
  width = 320,
  arrow = true,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  initialFocus,
  autoFocus = true,
  "aria-label": ariaLabel,
  disabled = false,
  className = "",
}: PopoverProps) {
  const id = useId();
  const reduce = useReduce();
  const [inner, setInner] = useState(defaultOpen);
  const open = !disabled && (openProp ?? inner);
  // `y` is the gap from the wrapper's top (panel below) or bottom (panel above) edge to the panel,
  // measured from the trigger, so a wrapper stretched by its parent still places it right.
  const [pos, setPos] = useState({ side: placement, left: 0, y: GAP, arrow: width / 2, ready: false });
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const [engaged, setEngaged] = useState(false); // opened from the trigger: focus moves in and Escape belongs to it
  const [restoreOnExit, setRestoreOnExit] = useState(false);

  const triggerEl = () => wrap.current?.firstElementChild as HTMLElement | null;

  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setInner(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange]
  );

  /** Closes; `restore` sends focus back to the trigger once the panel has faded. */
  const close = useCallback(
    (restore: boolean) => {
      setEngaged(false);
      setRestoreOnExit(restore);
      setOpen(false);
    },
    [setOpen]
  );

  // Preferred side unless only the other has room, aligned to the trigger and shifted to stay
  // on screen; the arrow keeps pointing at the trigger's centre.
  const place = useCallback(() => {
    const w = wrap.current;
    const c = panel.current;
    const t0 = w?.firstElementChild;
    if (!w || !c || !t0) return;
    const t = t0.getBoundingClientRect();
    const box = w.getBoundingClientRect();
    const k = w.offsetWidth ? box.width / w.offsetWidth : 1; // a zoomed or scaled parent
    const cw = c.offsetWidth * k;
    const ch = c.offsetHeight * k;
    const below = window.innerHeight - t.bottom - GAP;
    const above = t.top - GAP;
    const flip = avoidCollisions && (placement === "bottom" ? below < ch && above > below : above < ch && below > above);
    const side: PopoverPlacement = flip ? (placement === "bottom" ? "top" : "bottom") : placement;
    const want = align === "start" ? t.left : align === "end" ? t.right - cw : t.left + t.width / 2 - cw / 2;
    const vw = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth);
    const max = Math.max(EDGE, vw - EDGE - cw);
    const left = ((avoidCollisions ? Math.min(Math.max(want, EDGE), max) : want) - box.left) / k;
    const arrowX = Math.min(Math.max((t.left + t.width / 2 - box.left) / k - left, 18), c.offsetWidth - 18);
    const y = side === "bottom" ? (t.bottom - box.top) / k + GAP : (box.bottom - t.top) / k + GAP;
    setPos((p) =>
      p.side === side && Math.abs(p.left - left) < 0.5 && Math.abs(p.y - y) < 0.5 && Math.abs(p.arrow - arrowX) < 0.5 && p.ready ? p : { side, left, y, arrow: arrowX, ready: true }
    );
  }, [placement, align, avoidCollisions]);

  const panelRef = useCallback(
    (node: HTMLDivElement | null) => {
      panel.current = node;
      if (node) place();
    },
    [place]
  );

  // Escape closes it when someone opened it or focus is inside (a popover opened by `open` alone
  // leaves the key to the page); a press outside both the trigger and the panel closes it too.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    const inside = !!wrap.current?.contains(document.activeElement);
    if (!inside && !engaged) return;
    e.preventDefault();
    close(inside);
  });
  const onOutside = useEffectEvent((e: PointerEvent) => {
    const target = e.target as Element | null;
    if (!target || wrap.current?.contains(target)) return;
    // Clicking another control lets it keep the focus; clicking empty page sends focus home.
    const inside = !!panel.current?.contains(document.activeElement);
    close(inside && !target.closest(FOCUSABLE));
  });
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => onKey(e);
    const down = (e: PointerEvent) => onOutside(e);
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", down, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  // The panel can change height (a row added, a message shown): keep it placed.
  useEffect(() => {
    const c = panel.current;
    if (!open || !c || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => place());
    ro.observe(c);
    return () => ro.disconnect();
  }, [open, place]);

  // Opened from the trigger: move focus in once the panel is on screen.
  useEffect(() => {
    if (!open || !engaged || !autoFocus) return;
    const raf = requestAnimationFrame(() => {
      const c = panel.current;
      if (!c) return;
      const target = initialFocus?.current ?? c.querySelector<HTMLElement>(FOCUSABLE) ?? c;
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [open, engaged, autoFocus, initialFocus]);

  const restore = () => {
    if (!restoreOnExit) return;
    setRestoreOnExit(false);
    const t = triggerEl();
    if (t?.isConnected) t.focus({ preventScroll: true });
  };

  // Tab past the last control (or Shift+Tab out of the trigger) closes it without pulling focus back.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (open && next && !wrap.current?.contains(next)) close(false);
  };

  // Clicks on the trigger bubble here, after its own onClick (which can preventDefault to keep it shut).
  const toggle = (e: MouseEvent<HTMLDivElement>) => {
    if (!triggerEl()?.contains(e.target as Node) || e.defaultPrevented || disabled) return;
    if (open) close(true);
    else {
      setEngaged(true);
      setPos((p) => ({ ...p, ready: false }));
      setOpen(true);
    }
  };

  const top = pos.side === "top";
  const from = reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: top ? 6 : -6 };
  const api: PopoverApi = { close: () => close(true) };

  return (
    <div ref={wrap} onBlur={onBlur} onClick={toggle} className="relative inline-flex">
      {cloneElement(trigger, {
        "aria-haspopup": "dialog",
        "aria-expanded": open,
        "aria-controls": open ? id : undefined,
      })}
      <AnimatePresence onExitComplete={restore}>
        {open && (
          <motion.div
            ref={panelRef}
            id={id}
            role="dialog"
            aria-labelledby={title ? `${id}-title` : undefined}
            aria-describedby={description ? `${id}-desc` : undefined}
            aria-label={title ? undefined : ariaLabel}
            tabIndex={-1}
            initial={from}
            animate={{ opacity: pos.ready ? 1 : 0, scale: 1, y: 0 }}
            exit={{ ...from, transition: { duration: 0.12 } }}
            transition={spring}
            style={{ width, maxWidth: `calc(100vw - ${EDGE * 2}px)`, left: pos.left, [top ? "bottom" : "top"]: pos.y, transformOrigin: `${pos.arrow}px ${top ? "100%" : "0%"}` }}
            className={`absolute z-50 rounded-[16px] bg-surface text-left text-[14px] leading-5 text-fg shadow-[var(--shadow-overlay)] outline-none dark:bg-raised ${className}`}
          >
            {arrow && <Arrow side={pos.side} x={pos.arrow} />}
            {(title || description) && (
              <div className={`px-4 pt-4 ${showClose ? "pr-12" : ""}`}>
                {title && (
                  <h2 id={`${id}-title`} className="text-[15px] font-medium leading-[22px] tracking-[-0.005em] text-fg">
                    {title}
                  </h2>
                )}
                {description && (
                  <p id={`${id}-desc`} className="mt-0.5 text-[13px] leading-5 text-fg-muted">
                    {description}
                  </p>
                )}
              </div>
            )}
            <div className={title || description ? "px-4 pb-4 pt-3" : "p-4"}>{typeof children === "function" ? children(api) : children}</div>
            {/* Last in the DOM, so the first field gets focus when it opens. */}
            {showClose && (
              <button
                type="button"
                aria-label="Close"
                onClick={() => close(true)}
                className={`absolute right-3 top-3 grid size-8 place-items-center rounded-full text-fg-muted transition-colors hover:bg-muted hover:text-fg ${focusRing}`}
              >
                <X size={20} strokeWidth={1.5} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
