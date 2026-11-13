"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type ReactNode,
  type Ref,
} from "react";
import { animate, AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Bell } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type BellButtonBadge = "count" | "dot";
export type BellButtonSize = "sm" | "md" | "lg";

/** Handed to a `panel` function, e.g. for a row that opens a page and should close the panel. */
export interface BellButtonApi {
  /** Closes the panel and hands focus back to the bell. */
  close: () => void;
}

/** Drive the bell from code (tours, demos). None of these move focus or clear the badge. */
export interface BellButtonHandle {
  /** Plays the arrival: the bell tips, rings back and settles. */
  ring: () => void;
  open: () => void;
  close: () => void;
}

export interface BellButtonProps {
  /** Unread count. 0 hides the badge; when it goes up the bell rings and the badge pops in. */
  count?: number;
  /** "count" shows the number in a red pill, "dot" a red dot for news with no number to read. */
  badge?: BellButtonBadge;
  /** Counts above it show as "99+". */
  max?: number;
  /** The button's name. The badge is added for screen readers: "Notifications, 3 unread". */
  label?: string;
  /** The glyph, 20 px. A bell by default. */
  icon?: ReactNode;
  /** 32, 36 or 40 px. */
  size?: BellButtonSize;
  /** A click hides the badge until the count goes up again (the "seen" moment). */
  clearOnOpen?: boolean;
  /** Ring whenever the count goes up. */
  ringOnIncrease?: boolean;
  /** A click cleared the badge: mark the notifications as seen here. */
  onClear?: () => void;
  onClick?: () => void;
  /** What the bell opens: an anchored panel (a dialog) under it. Pass a function to get `close`. */
  panel?: ReactNode | ((api: BellButtonApi) => ReactNode);
  /** Panel width in px, never wider than the viewport minus 16. */
  panelWidth?: number;
  /** Panel edge that lines up with the bell; it also shifts to stay 8 px inside the viewport. */
  align?: "start" | "end";
  /** Moves the panel sideways in px (positive is to the right), e.g. to line it up with the edge of a top bar. */
  alignOffset?: number;
  /** Gap between the bell and the panel in px. Raise it to clear a top bar's padding, e.g. 16 in a bar padded 8. */
  sideOffset?: number;
  /** Opens over the bell when it does not fit below and there is more room above. Turn it off when the bell's container keeps room below for the panel (a demo stage, a scroll box). */
  flip?: boolean;
  /** Names the panel. Defaults to `label`. */
  panelLabel?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  /** Replaces the computed name (label plus the badge). */
  "aria-label"?: string;
  ref?: Ref<BellButtonHandle>;
  className?: string;
}

const EDGE = 8; // kept free at the viewport edge
const quick = { type: "spring", stiffness: 520, damping: 30 } as const;
const spring = { type: "spring", stiffness: 520, damping: 34 } as const;
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

// The badge sits on the bell's top-right corner at every size; the dot hugs it a little closer.
const SIZES: Record<BellButtonSize, { box: string; count: string; dot: string }> = {
  sm: { box: "size-8", count: "left-[18px] top-0", dot: "left-[22px] top-1" },
  md: { box: "size-9", count: "left-5 top-0.5", dot: "left-6 top-1.5" },
  lg: { box: "size-10", count: "left-[22px] top-1", dot: "left-[26px] top-2" },
};

/**
 * A quiet ghost bell that wakes up when something arrives. The badge's 2 px ring takes `--bell-ring`
 * (the surface colour by default): set it on a parent to match a grey top bar.
 */
export function BellButton({
  count = 0,
  badge = "count",
  max = 99,
  label = "Notifications",
  icon,
  size = "md",
  clearOnOpen = true,
  ringOnIncrease = true,
  onClear,
  onClick,
  panel,
  panelWidth = 360,
  align = "end",
  alignOffset = 0,
  sideOffset = 8,
  flip = true,
  panelLabel,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  "aria-label": ariaLabel,
  ref,
  className = "",
}: BellButtonProps) {
  const reduce = useReduce();
  const panelId = useId();
  const s = SIZES[size];
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const open = !!panel && (openProp ?? innerOpen);
  const [cleared, setCleared] = useState(false);
  // Each rise in the count: a new tick, and whether the badge was already showing (then it pops).
  const [ring, setRing] = useState({ tick: 0, pop: false });
  const [said, setSaid] = useState("");
  // `shift` is only the nudge that keeps the panel on screen: the default spot is anchored in CSS, so it can't go stale.
  const [pos, setPos] = useState({ side: "bottom" as "bottom" | "top", shift: 0, origin: 0, ready: false });
  const [engaged, setEngaged] = useState(false); // opened by a click: focus moves in and comes back on Escape
  const [restoreOnExit, setRestoreOnExit] = useState(false);
  // Closed by any path (a controlled parent too): the next open from code must not pull focus in.
  if (!open && engaged) setEngaged(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const swing = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const panelEl = useRef<HTMLDivElement | null>(null);

  // A rise in the count: the badge comes back (even after a click cleared it), the bell rings,
  // and screen readers hear how many arrived. Never on mount, so a still frame stays still.
  const [prevCount, setPrevCount] = useState(count);
  if (prevCount !== count) {
    setPrevCount(count);
    if (count > prevCount) {
      const added = count - prevCount;
      const showing = prevCount > 0 && !cleared;
      setCleared(false);
      if (ringOnIncrease) setRing((r) => ({ tick: r.tick + 1, pop: showing }));
      setSaid(`${added} new ${added === 1 ? "notification" : "notifications"}${said.endsWith(" ") ? "" : " "}`);
    }
  }

  const visible = count > 0 && !cleared;
  const text = count > max ? `${max}+` : String(count);
  const name = ariaLabel ?? (visible ? `${label}, ${badge === "dot" ? "new activity" : `${text} unread`}` : label);

  // Tip −14°, ring back +10°, then a small bounce to rest. The badge pops if it was already showing.
  const play = useCallback(
    (withPop: boolean) => {
      if (reduce) return () => {};
      const runs = [
        swing.current &&
          animate(swing.current, { rotate: [0, -14, 10, -4, 1.5, 0] }, { duration: 0.72, times: [0, 0.17, 0.34, 0.56, 0.78, 1], ease: "easeInOut" }),
        withPop && pop.current && animate(pop.current, { scale: [1, 1.22, 1] }, { duration: 0.36, times: [0, 0.4, 1], ease: "easeOut" }),
      ];
      return () => runs.forEach((r) => r && r.stop());
    },
    [reduce]
  );
  const ringNow = useEffectEvent((withPop: boolean) => play(withPop));
  useEffect(() => {
    if (!ring.tick) return;
    return ringNow(ring.pop);
  }, [ring]);

  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setInnerOpen(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange]
  );

  const close = useCallback(
    (restore: boolean) => {
      setEngaged(false);
      setRestoreOnExit(restore);
      setOpen(false);
    },
    [setOpen]
  );

  useImperativeHandle(
    ref,
    () => ({
      ring: () => play(visible),
      open: () => {
        setPos((p) => ({ ...p, ready: false }));
        setOpen(true);
      },
      close: () => close(false),
    }),
    [play, visible, setOpen, close]
  );

  // Under the bell (over it when it does not fit below and there is more room above), lined up with its edge and shifted to
  // stay on screen. Measured in screen px with the zoom factor, so it lands right inside scaled previews.
  const place = useCallback(() => {
    const w = wrap.current;
    const c = panelEl.current;
    if (!w || !c) return;
    const t = w.getBoundingClientRect();
    const k = w.offsetWidth ? t.width / w.offsetWidth : 1;
    const cw = c.offsetWidth * k;
    const ch = c.offsetHeight * k;
    const below = window.innerHeight - t.bottom - sideOffset * k;
    const above = t.top - sideOffset * k;
    const side = flip && below < ch && above > below ? "top" : "bottom";
    const want = (align === "start" ? t.left : t.right - cw) + alignOffset * k;
    const vw = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth);
    const at = Math.min(Math.max(want, EDGE), Math.max(EDGE, vw - EDGE - cw));
    const shift = (at - want) / k;
    // The panel grows from the point under the bell.
    const origin = (t.left + t.width / 2 - at) / k;
    setPos((p) => (p.ready && p.side === side && Math.abs(p.shift - shift) < 0.5 && Math.abs(p.origin - origin) < 0.5 ? p : { side, shift, origin, ready: true }));
  }, [align, alignOffset, sideOffset, flip]);

  const panelRef = useCallback(
    (node: HTMLDivElement | null) => {
      panelEl.current = node;
      if (node) place();
    },
    [place]
  );

  // Escape closes it when focus is inside or a click opened it; a press outside the bell and the panel closes it too.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    const inside = !!wrap.current?.contains(document.activeElement);
    if (!inside && !engaged) return;
    e.preventDefault();
    close(inside || engaged);
  });
  const onOutside = useEffectEvent((e: PointerEvent) => {
    const target = e.target as Node | null;
    if (!target || wrap.current?.contains(target)) return;
    close(false);
  });
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => onKey(e);
    const down = (e: PointerEvent) => onOutside(e);
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    // The panel's own size, the bell's row and the page: styles, fonts or content that arrive after it
    // opened can move the bell, and the panel follows.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => place()) : null;
    for (const el of [panelEl.current, wrap.current, wrap.current?.parentElement, wrap.current?.offsetParent, document.documentElement]) if (el) ro?.observe(el);
    let live = true;
    let raf = requestAnimationFrame(() => place());
    document.fonts?.ready.then(() => {
      if (!live) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => place());
    });
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", down, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      ro?.disconnect();
    };
  }, [open, place]);

  // Opened by a click: focus moves to the panel, so a screen reader names it and Tab walks its rows.
  useEffect(() => {
    if (!open || !engaged) return;
    const raf = requestAnimationFrame(() => panelEl.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(raf);
  }, [open, engaged]);

  const restore = () => {
    if (!restoreOnExit) return;
    setRestoreOnExit(false);
    if (button.current?.isConnected) button.current.focus({ preventScroll: true });
  };

  // Tabbing out of the panel closes it without pulling focus back.
  const onBlur = (e: FocusEvent<HTMLSpanElement>) => {
    const next = e.relatedTarget as Node | null;
    if (open && next && !wrap.current?.contains(next)) close(false);
  };

  const press = () => {
    if (disabled) return;
    onClick?.();
    if (panel && open) {
      close(false);
      return;
    }
    if (visible && clearOnOpen) {
      setCleared(true);
      onClear?.();
    }
    if (panel) {
      setEngaged(true);
      setPos((p) => ({ ...p, ready: false }));
      setOpen(true);
    }
  };

  const top = pos.side === "top";
  const from = reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: top ? 6 : -6 };
  const dot = badge === "dot";

  return (
    <span ref={wrap} onBlur={onBlur} className={`relative inline-flex shrink-0 ${className}`}>
      <motion.button
        ref={button}
        type="button"
        aria-label={name}
        aria-haspopup={panel ? "dialog" : undefined}
        aria-expanded={panel ? open : undefined}
        aria-controls={panel && open ? panelId : undefined}
        disabled={disabled}
        onClick={press}
        whileTap={reduce || disabled ? undefined : { scale: 0.92 }}
        transition={spring}
        className={`relative isolate grid shrink-0 select-none place-items-center rounded-full outline-none transition-[color,opacity] duration-200 ease-out before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-full before:bg-fg before:opacity-0 before:transition-opacity before:duration-150 hover:text-fg hover:before:opacity-[0.04] active:before:opacity-[0.1] aria-expanded:text-fg disabled:pointer-events-none disabled:opacity-[0.45] ${focusRing} ${s.box} ${
          visible ? "text-fg" : "text-fg-muted"
        }`}
      >
        <span ref={swing} aria-hidden className="grid size-5 place-items-center [transform-origin:50%_12%] [&_svg]:size-5">
          {icon ?? <Bell size={20} strokeWidth={1.5} />}
        </span>
        <AnimatePresence initial={false}>
          {visible && (
            <motion.span
              key="badge"
              aria-hidden
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? { opacity: 0, transition: { duration: 0.18 } } : { opacity: 0, scale: 0.6, transition: { duration: 0.18, ease: "easeOut" } }}
              transition={quick}
              className={`pointer-events-none absolute ${dot ? s.dot : s.count}`}
            >
              <span
                ref={pop}
                className={`flex items-center justify-center overflow-hidden rounded-full bg-danger text-white shadow-[0_0_0_2px_var(--bell-ring,var(--surface))] dark:bg-[var(--danger-solid)] ${
                  dot ? "size-2" : "h-4 min-w-4 px-1 text-[11px] font-semibold leading-4 tabular-nums"
                }`}
              >
                {!dot && (
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={text}
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                      transition={quick}
                    >
                      {text}
                    </motion.span>
                  </AnimatePresence>
                )}
              </span>
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
      {/* Says how many arrived; the trailing space makes a repeat read again. */}
      <span className="sr-only" role="status" aria-live="polite">
        {said}
      </span>
      <AnimatePresence onExitComplete={restore}>
        {open && (
          <motion.div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={panelLabel ?? label}
            tabIndex={-1}
            initial={from}
            animate={{ opacity: pos.ready ? 1 : 0, scale: 1, y: 0 }}
            exit={{ ...from, transition: { duration: 0.12 } }}
            transition={spring}
            style={{
              width: panelWidth,
              maxWidth: `calc(100vw - ${EDGE * 2}px)`,
              ...(align === "start" ? { left: alignOffset + pos.shift } : { right: -alignOffset - pos.shift }),
              [top ? "bottom" : "top"]: `calc(100% + ${sideOffset}px)`,
              transformOrigin: `${pos.origin}px ${top ? "100%" : "0%"}`,
            }}
            className="absolute z-50 rounded-[16px] bg-surface text-left text-[14px] leading-5 text-fg shadow-[var(--shadow-overlay)] outline-none dark:bg-raised"
          >
            {typeof panel === "function" ? panel({ close: () => close(true) }) : panel}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
