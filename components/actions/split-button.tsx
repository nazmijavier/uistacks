"use client";

import {
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

/** One row in the menu behind the chevron. */
export interface SplitButtonAction {
  id: string;
  label: string;
  /** A second, muted line under the label, e.g. "Tomorrow at 8:00 AM". */
  description?: string;
  /** A 20 px icon before the label. */
  icon?: ReactNode;
  /** Keys shown on the right, e.g. "⌘⇧↵". */
  shortcut?: string;
  /** Red label for actions that delete or can't be undone. A line separates it from the rows above. */
  destructive?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

/** Drive the menu from code, e.g. in a product tour. None of these move focus. */
export interface SplitButtonHandle {
  open: () => void;
  close: () => void;
  /** Highlights a row as if the pointer were over it; null clears it. */
  highlight: (id: string | null) => void;
}

export type SplitButtonVariant = "primary" | "secondary";
export type SplitButtonSize = "sm" | "md" | "lg";

export interface SplitButtonProps {
  /** The main action's label. */
  children: ReactNode;
  /** An icon before the label: 16 px at sm, 20 px from md. */
  icon?: ReactNode;
  /** The main action. */
  onClick?: () => void;
  /** The related actions behind the chevron. */
  actions: SplitButtonAction[];
  /** Called with the id of the row that was picked, after its own onSelect. */
  onAction?: (id: string) => void;
  variant?: SplitButtonVariant;
  /** 32, 36 or 40 px tall. */
  size?: SplitButtonSize;
  disabled?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Which edge of the button the menu lines up with. */
  align?: "start" | "end";
  /** Where the menu prefers to open. It flips when there is no room on that side. */
  side?: "bottom" | "top";
  /** Set false to always open on `side`, e.g. when the menu must stay inside a fixed card. */
  flip?: boolean;
  /** Names the chevron for screen readers. */
  menuLabel?: string;
  /** Menu width in px. */
  menuWidth?: number;
  ref?: Ref<SplitButtonHandle>;
  className?: string;
}

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;
const snappy = { type: "spring", stiffness: 520, damping: 34 } as const;

const SIZES: Record<SplitButtonSize, { h: string; main: string; chevron: string; divider: string }> = {
  sm: { h: "h-8", main: "gap-1.5 pl-3 pr-2.5 text-[13px] leading-[18px]", chevron: "w-8", divider: "my-2" },
  md: { h: "h-9", main: "gap-2 pl-3.5 pr-3 text-[14px] leading-5", chevron: "w-9", divider: "my-2" },
  lg: { h: "h-10", main: "gap-2 pl-4 pr-3.5 text-[15px] leading-5", chevron: "w-10", divider: "my-2.5" },
};

// One fill and shadow for the whole pill; each half tints its own ::before layer on hover and press.
const VARIANTS: Record<SplitButtonVariant, { pill: string; half: string; divider: string }> = {
  primary: {
    pill: "bg-[image:var(--grad-primary)] text-[var(--inverse-fg)] shadow-[var(--shadow-btn-primary)]",
    half: "before:bg-[var(--inverse-fg)] hover:before:opacity-[0.08] active:before:opacity-[0.14]",
    divider: "bg-[color-mix(in_srgb,var(--inverse-fg)_24%,transparent)]",
  },
  secondary: {
    pill: "bg-surface text-fg shadow-[var(--shadow-btn-secondary)]",
    half: "before:bg-fg hover:before:opacity-[0.04] active:before:opacity-[0.08]",
    divider: "bg-border",
  },
};

const half =
  "relative isolate inline-flex h-full select-none items-center justify-center whitespace-nowrap font-medium outline-none before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:opacity-0 before:transition-opacity before:duration-150 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:cursor-not-allowed";

/** The box that clips the menu: the nearest ancestor that hides or scrolls its overflow, else the viewport. Screen px. */
function boundaryOf(el: HTMLElement) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p);
    // Only a vertical clip matters (a page that clips x alone leaves y visible).
    if (s.overflowY !== "visible") {
      const r = p.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    }
  }
  return { top: 0, bottom: window.innerHeight };
}

export function SplitButton({
  children,
  icon,
  onClick,
  actions,
  onAction,
  variant = "primary",
  size = "md",
  disabled = false,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  align = "end",
  side = "bottom",
  flip = true,
  menuLabel = "More options",
  menuWidth = 248,
  ref,
  className = "",
}: SplitButtonProps) {
  const uid = useId();
  const chevronId = `${uid}-chevron`;
  const menuId = `${uid}-menu`;
  const itemId = (i: number) => `${uid}-item-${i}`;
  const reduce = useReduce();
  const s = SIZES[size];
  const v = VARIANTS[variant];

  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const open = openProp ?? ownOpen;
  // The highlighted row. -1 means none: a pointer opened the menu and hasn't hovered a row yet.
  const [active, setActive] = useState(-1);
  // The side the menu actually opens on, after checking for room.
  const [placed, setPlaced] = useState(side);

  const root = useRef<HTMLDivElement>(null);
  const chevron = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // Whether opening should move focus into the menu (a click or a key), or leave it where it is (code).
  const takeFocus = useRef(false);
  const typed = useRef({ text: "", at: 0 });

  const enabled = actions.flatMap((a, i) => (a.disabled ? [] : [i]));
  const step = (from: number, dir: 1 | -1) => {
    if (!enabled.length) return -1;
    const at = enabled.indexOf(from);
    if (at === -1) return dir === 1 ? enabled[0] : enabled[enabled.length - 1];
    return enabled[(at + dir + enabled.length) % enabled.length];
  };

  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  /** Opens the menu with the first, the last or no row highlighted. */
  const show = (start: "first" | "last" | "none", focus = true) => {
    if (disabled) return;
    takeFocus.current = focus;
    setActive(start === "first" ? (enabled[0] ?? -1) : start === "last" ? (enabled[enabled.length - 1] ?? -1) : -1);
    setOpen(true);
  };

  // Escape, Tab and a pick send focus back to the chevron, so keyboard users land where they started.
  const close = (refocus = true) => {
    if (refocus) chevron.current?.focus({ preventScroll: true });
    setOpen(false);
  };

  const choose = (i: number) => {
    const action = actions[i];
    if (!action || action.disabled) return;
    close();
    action.onSelect?.();
    onAction?.(action.id);
  };

  useImperativeHandle(ref, () => ({
    open: () => show("none", false),
    close: () => setOpen(false),
    highlight: (id) => setActive(id === null ? -1 : actions.findIndex((a) => a.id === id)),
  }));

  // Focus moves into the menu as it opens, and stays there until it closes.
  useEffect(() => {
    if (open && takeFocus.current) menu.current?.focus({ preventScroll: true });
    takeFocus.current = false;
  }, [open]);

  // However the menu closed (a controlled `open`, say), focus still inside it goes back to the chevron.
  // The menu is still mounted here while it animates out.
  useEffect(() => {
    if (open) return;
    const el = document.activeElement;
    if (el && menu.current?.contains(el)) chevron.current?.focus({ preventScroll: true });
  }, [open]);

  // A press outside closes the menu without stealing focus back.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) {
        if (openProp === undefined) setOwnOpen(false);
        onOpenChange?.(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, openProp, onOpenChange]);

  // Flip to the other side when the preferred one has no room inside whatever clips the button.
  // Measured in screen px (getBoundingClientRect), which stays right inside zoomed or scaled previews.
  useLayoutEffect(() => {
    const el = root.current;
    const m = menu.current;
    if (!open || !el || !m) return;
    const r = el.getBoundingClientRect();
    const k = el.offsetHeight ? r.height / el.offsetHeight : 1;
    const need = (m.offsetHeight + 6) * k;
    const b = boundaryOf(el);
    const below = b.bottom - r.bottom;
    const above = r.top - b.top;
    const next = !flip ? side : side === "bottom" ? (below < need && above > below ? "top" : "bottom") : above < need && below > above ? "bottom" : "top";
    setPlaced(next);
  }, [open, side, flip]);

  // Keeps the highlighted row in view by scrolling the menu only (never the page).
  useEffect(() => {
    const box = menu.current;
    const el = active >= 0 ? document.getElementById(`${uid}-item-${active}`) : null;
    if (!open || !box || !el) return;
    if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop - 6;
    else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight + 6;
  }, [open, active, uid]);

  const onMainKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    // Alt + ↓ opens the menu from the main half too, like a native select.
    if (e.altKey && e.key === "ArrowDown") {
      e.preventDefault();
      show("first");
    }
  };

  const onChevronKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      show(e.key === "ArrowUp" ? "last" : "first");
    }
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case "Escape":
      case "Tab":
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      case "ArrowDown":
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => step(a, e.key === "ArrowDown" ? 1 : -1));
        return;
      case "Home":
      case "End":
        e.preventDefault();
        setActive((e.key === "Home" ? enabled[0] : enabled[enabled.length - 1]) ?? -1);
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        return;
    }
    // Type-ahead: jump to the next row whose label starts with what was typed in the last half second.
    if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = typed.current;
    t.text = e.timeStamp - t.at > 500 ? e.key.toLowerCase() : t.text + e.key.toLowerCase();
    t.at = e.timeStamp;
    const from = t.text.length === 1 ? active + 1 : Math.max(active, 0);
    for (let k = 0; k < actions.length; k++) {
      const i = (from + k) % actions.length;
      if (!actions[i].disabled && actions[i].label.toLowerCase().startsWith(t.text)) {
        setActive(i);
        return;
      }
    }
  };

  const up = placed === "top";
  // The menu grows out of the corner it is pinned to.
  const origin = `${align === "end" ? "right" : "left"} ${up ? "bottom" : "top"}`;

  return (
    <div ref={root} className={`relative inline-flex shrink-0 ${className}`}>
      <motion.div
        whileTap={reduce || disabled ? undefined : { scale: 0.98 }}
        transition={spring}
        className={`inline-flex items-stretch rounded-full ${s.h} ${v.pill} ${disabled ? "opacity-[0.45]" : ""}`}
      >
        <button type="button" disabled={disabled} onClick={onClick} onKeyDown={onMainKey} className={`${half} ${v.half} rounded-l-full ${s.main}`}>
          {icon && <span className="flex shrink-0">{icon}</span>}
          <span>{children}</span>
        </button>
        <span aria-hidden className={`w-px shrink-0 ${s.divider} ${v.divider}`} />
        <button
          ref={chevron}
          id={chevronId}
          type="button"
          disabled={disabled}
          aria-label={menuLabel}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={(e) => (open ? close(false) : show(e.detail === 0 ? "first" : "none"))}
          onKeyDown={onChevronKey}
          className={`${half} ${v.half} rounded-r-full ${s.chevron} ${open ? "before:opacity-[0.08]" : ""}`}
        >
          <motion.span aria-hidden initial={false} animate={{ rotate: open ? 180 : 0 }} transition={reduce ? { duration: 0 } : spring} className="flex">
            <ChevronDown size={16} strokeWidth={1.75} />
          </motion.span>
        </button>
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="menu"
            ref={menu}
            id={menuId}
            role="menu"
            tabIndex={-1}
            aria-labelledby={chevronId}
            aria-activedescendant={active >= 0 ? itemId(active) : undefined}
            onKeyDown={onMenuKey}
            onBlur={(e) => {
              const to = e.relatedTarget as Node | null;
              if (to && !root.current?.contains(to)) setOpen(false);
            }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: up ? 4 : -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: up ? 4 : -4, transition: { duration: 0.12 } }}
            transition={{ ...snappy, opacity: { duration: 0.12 } }}
            style={{ width: menuWidth, transformOrigin: origin }}
            className={`absolute z-50 flex max-h-[320px] flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-[16px] bg-surface p-1.5 text-left shadow-[var(--shadow-overlay)] outline-none dark:bg-raised ${
              up ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"
            } ${align === "end" ? "right-0" : "left-0"}`}
          >
            {actions.map((a, i) => {
              const hot = i === active;
              // A line above the first destructive row keeps it apart from the safe ones.
              const rule = a.destructive && i > 0 && !actions[i - 1].destructive;
              return (
                <div key={a.id} className="flex flex-col">
                  {rule && <div aria-hidden className="mx-1 my-1 h-px bg-border" />}
                  <div
                    id={itemId(i)}
                    role="menuitem"
                    aria-disabled={a.disabled || undefined}
                    // keeps focus on the menu while the pointer picks
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerMove={() => !a.disabled && !hot && setActive(i)}
                    onPointerLeave={() => setActive(-1)}
                    onClick={() => choose(i)}
                    className={`flex min-h-9 cursor-pointer items-center gap-2.5 rounded-[12px] px-2.5 py-2 transition-colors duration-100 ${
                      a.disabled ? "cursor-not-allowed opacity-50" : ""
                    } ${hot ? (a.destructive ? "bg-danger-soft" : "bg-fg/[0.06]") : ""}`}
                  >
                    {a.icon && <span className={`flex shrink-0 ${a.destructive ? "text-danger-text" : "text-fg-muted"}`}>{a.icon}</span>}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={`truncate text-[14px] leading-5 ${a.destructive ? "text-danger-text" : "text-fg"}`}>{a.label}</span>
                      {a.description && <span className="truncate text-[13px] leading-[18px] text-fg-muted">{a.description}</span>}
                    </span>
                    {a.shortcut && <span className="shrink-0 pl-2 text-[12px] leading-4 tracking-[0.04em] text-fg-subtle">{a.shortcut}</span>}
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
