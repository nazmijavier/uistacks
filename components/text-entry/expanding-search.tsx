"use client";

import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type KeyboardEvent,
  type Ref,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { LoaderCircle, Search, X } from "lucide-react";

export type ExpandingSearchSize = "sm" | "md";
/** field: a soft grey pill with a hairline (for white cards). surface: a white pill (for grey toolbars). ghost: a bare icon until it opens. */
export type ExpandingSearchVariant = "field" | "surface" | "ghost";

export interface ExpandingSearchHandle {
  /** Opens the field and puts the caret in it. */
  focus: () => void;
  /** Opens or folds the field without moving focus (tours, demos). */
  setOpen: (open: boolean) => void;
  /** Replaces the text without moving focus (tours, demos). */
  setText: (text: string) => void;
}

export interface ExpandingSearchProps {
  value?: string;
  defaultValue?: string;
  /** Every keystroke. Closing the search clears the text. */
  onValueChange?: (value: string) => void;
  /** Enter in the field, with the trimmed query. */
  onSearch?: (query: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Width of the open field in px (280). It never grows past its container. */
  width?: number;
  /** The edge that stays put: start grows to the right, end grows to the left (a toolbar's right end). */
  side?: "start" | "end";
  /** 32 or 36 px tall. */
  size?: ExpandingSearchSize;
  variant?: ExpandingSearchVariant;
  placeholder?: string;
  /** A key that opens it from anywhere on the page, shown as a keycap while the field is empty ("/"). False turns it off. */
  shortcut?: string | false;
  /** How many matches the query has. Shown in the field while there is text, and read out once typing pauses. */
  results?: number;
  /** Words for the count (No results, 1 result, 14 results). */
  resultsLabel?: (count: number) => string;
  /** Swaps the glyph for a spinner while results load. */
  loading?: boolean;
  disabled?: boolean;
  name?: string;
  id?: string;
  /** Names the button and the field (Search). */
  "aria-label"?: string;
  className?: string;
  ref?: Ref<ExpandingSearchHandle>;
}

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

const spring = { type: "spring", stiffness: 420, damping: 36 } as const;
const pop = { type: "spring", stiffness: 520, damping: 34 } as const;

// h: height and folded width; glyph: the search icon (16 in every state, as in the kit); inset: where the text
// starts; close: the round close button.
const SIZES: Record<ExpandingSearchSize, { h: number; glyph: number; inset: number; text: string; close: string }> = {
  sm: { h: 32, glyph: 16, inset: 30, text: "text-[13px] leading-5", close: "size-6" },
  md: { h: 36, glyph: 16, inset: 34, text: "text-[14px] leading-5", close: "size-7" },
};

// Open, the pill takes a 1.5 px grey edge (as in the kit), so a live search reads apart from the folded button.
const OPEN_EDGE = "shadow-[0_0_0_1.5px_var(--fg-subtle)]";
const LOOKS: Record<ExpandingSearchVariant, { folded: string; open: string; glyph: string }> = {
  field: { folded: "bg-subtle shadow-[var(--shadow-control)]", open: `bg-subtle ${OPEN_EDGE}`, glyph: "text-fg" },
  surface: { folded: "bg-surface shadow-[var(--shadow-control)]", open: `bg-surface ${OPEN_EDGE}`, glyph: "text-fg" },
  ghost: { folded: "bg-transparent", open: `bg-subtle ${OPEN_EDGE}`, glyph: "text-fg-muted" },
};

const plural = (n: number) => (n === 0 ? "No results" : `${n.toLocaleString("en-US")} ${n === 1 ? "result" : "results"}`);

/**
 * A search that waits as a round icon button and opens into a field where it stands: the circle stretches into a
 * pill (the glyph stays put when it grows to the right), the text fades in and takes the caret. The close button or Escape clears
 * the text and folds it back; leaving it empty folds it too.
 */
export function ExpandingSearch({
  value,
  defaultValue = "",
  onValueChange,
  onSearch,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  width = 280,
  side = "start",
  size = "md",
  variant = "field",
  placeholder = "Search",
  shortcut = "/",
  results,
  resultsLabel = plural,
  loading = false,
  disabled = false,
  name,
  id,
  "aria-label": ariaLabel = "Search",
  className = "",
  ref,
}: ExpandingSearchProps) {
  const reduce = useReduce();
  const uid = useId();
  const inputId = id ?? `${uid}-input`;
  const s = SIZES[size];
  const look = LOOKS[variant];
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const open = openProp ?? ownOpen;
  const [ownText, setOwnText] = useState(defaultValue);
  const text = value ?? ownText;
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  // Set when focus should land on the button once the field has folded (close button, Escape).
  const backToButton = useRef(false);

  const setOpen = (next: boolean) => {
    if (next === open) return;
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };
  const setText = (next: string) => {
    if (value === undefined) setOwnText(next);
    onValueChange?.(next);
  };
  // Opening focuses the field in the same event, so touch keyboards come up.
  const openAndFocus = () => {
    if (disabled) return;
    setOpen(true);
    input.current?.focus({ preventScroll: true });
  };
  // Close button and Escape: clear the query, fold, and hand focus back to the round button.
  const close = () => {
    if (text) setText("");
    backToButton.current = true;
    setOpen(false);
  };

  // Folding while focus is inside (close, Escape, or `open` turned off from outside) moves focus to the button.
  useEffect(() => {
    if (open) return;
    if (backToButton.current || root.current?.contains(document.activeElement)) button.current?.focus({ preventScroll: true });
    backToButton.current = false;
  }, [open]);

  useImperativeHandle(ref, () => ({
    focus: openAndFocus,
    setOpen,
    setText,
  }));

  // The shortcut opens it from anywhere, unless the person is typing somewhere else.
  const latest = useRef(openAndFocus);
  useEffect(() => {
    latest.current = openAndFocus;
  });
  useEffect(() => {
    if (!shortcut || disabled) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== shortcut || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
      if (!root.current?.getClientRects().length) return; // not on screen
      e.preventDefault();
      latest.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shortcut, disabled]);

  // The count is read out once typing pauses, not on every key.
  const [said, setSaid] = useState("");
  const query = text.trim();
  const label = useRef(resultsLabel);
  useEffect(() => {
    label.current = resultsLabel;
  });
  useEffect(() => {
    if (!open || !query || results === undefined) {
      setSaid(""); // eslint-disable-line react-hooks/set-state-in-effect -- empties the live region so the next count is announced
      return;
    }
    setSaid("");
    // Only while focus is in the search: a query set from outside (a scripted demo, a saved filter) is not read out.
    const t = window.setTimeout(() => {
      if (root.current?.contains(document.activeElement)) setSaid(label.current(results));
    }, 600);
    return () => window.clearTimeout(t);
  }, [open, query, results]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (query) onSearch?.(query);
    }
  };
  // Escape works from anywhere inside the open search: the field or the close button.
  const onRootKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape" || !open) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  // An empty field folds when focus leaves the whole search (moving to the close button keeps it open).
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!open || text) return;
    if (root.current?.contains(e.relatedTarget as Node | null)) return;
    setOpen(false);
  };

  const glyphLeft = (s.h - s.glyph) / 2;
  const showKey = open && !text && Boolean(shortcut) && !disabled;
  const showCount = open && Boolean(query) && results !== undefined;

  return (
    <div ref={root} role="search" aria-busy={loading || undefined} onBlur={onBlur} onKeyDown={onRootKeyDown} className={`relative flex min-w-0 ${side === "end" ? "justify-end" : "justify-start"} ${className}`} style={{ height: s.h }}>
      <motion.div
        initial={false}
        animate={{ width: open ? width : s.h }}
        transition={reduce ? { duration: 0 } : spring}
        style={{ width: open ? width : s.h }}
        // The pill clips the field while it is narrow; its own focus ring (a box shadow) is not clipped.
        className={`relative h-full max-w-full shrink-0 overflow-hidden rounded-full transition-[background-color,box-shadow,scale] duration-200 ${
          reduce ? "" : "has-[>button:active]:scale-[0.94]"
        } has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--select)] has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-[var(--bg)] ${
          open ? look.open : look.folded
        } ${disabled ? "opacity-50" : ""}`}
      >
        {/* The glyph keeps its place: it rides the start edge, which only moves when the field grows to the left. */}
        <span
          aria-hidden
          style={{ left: glyphLeft, top: glyphLeft, width: s.glyph, height: s.glyph }}
          className={`pointer-events-none absolute grid place-items-center transition-colors duration-200 ${open ? "text-fg-subtle" : look.glyph}`}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {loading ? (
              <motion.span key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="flex">
                <LoaderCircle size={s.glyph} strokeWidth={1.5} className="motion-safe:animate-spin" />
              </motion.span>
            ) : (
              <motion.span key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="flex">
                <Search size={s.glyph} strokeWidth={1.5} />
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        {/* The field is always there, so opening can focus it in the same tap; folded, it is out of reach. */}
        <motion.div
          initial={false}
          animate={{ opacity: open ? 1 : 0 }}
          transition={reduce ? { duration: 0.1 } : { duration: open ? 0.18 : 0.08, delay: open ? 0.06 : 0 }}
          style={{ paddingLeft: s.inset }}
          className={`absolute inset-0 flex items-center gap-2 pr-1 ${open ? "" : "pointer-events-none"}`}
        >
          <input
            ref={input}
            id={inputId}
            name={name}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            value={text}
            placeholder={placeholder}
            aria-label={ariaLabel}
            aria-keyshortcuts={shortcut || undefined}
            aria-describedby={`${uid}-hint`}
            tabIndex={open ? 0 : -1}
            aria-hidden={open ? undefined : true}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => {
              if (!open) setOpen(true);
            }}
            className={`h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden ${s.text}`}
          />
          <AnimatePresence initial={false} mode="popLayout">
            {showKey && (
              <motion.kbd
                key="key"
                aria-hidden
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
                transition={pop}
                className="inline-grid h-5 min-w-5 shrink-0 place-items-center rounded-[8px] bg-surface shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--fg)_10%,transparent)] px-1 font-sans text-[12px] font-medium leading-4 text-fg-muted"
              >
                {shortcut}
              </motion.kbd>
            )}
            {showCount && (
              <motion.span
                key="count"
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="shrink-0 whitespace-nowrap text-[12px] leading-4 text-fg-subtle tabular-nums"
              >
                {resultsLabel(results ?? 0)}
              </motion.span>
            )}
          </AnimatePresence>
          {open && (
            <motion.button
              type="button"
              aria-label="Close search"
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={pop}
              onMouseDown={(e) => e.preventDefault()}
              onClick={close}
              className={`grid shrink-0 place-items-center rounded-full text-fg-muted outline-none transition-colors hover:bg-fg/[0.06] hover:text-fg focus-visible:bg-fg/[0.08] focus-visible:text-fg active:bg-fg/10 ${s.close}`}
            >
              <X size={16} strokeWidth={1.5} aria-hidden />
            </motion.button>
          )}
        </motion.div>

        {!open && (
          <button
            ref={button}
            type="button"
            aria-label={ariaLabel}
            aria-keyshortcuts={shortcut || undefined}
            disabled={disabled}
            onClick={openAndFocus}
            className="absolute inset-0 rounded-full outline-none before:absolute before:inset-0 before:rounded-full before:bg-fg before:opacity-0 before:transition-opacity enabled:hover:before:opacity-[0.04] enabled:active:before:opacity-[0.08] disabled:cursor-not-allowed"
          />
        )}
      </motion.div>
      <span id={`${uid}-hint`} className="sr-only">
        Escape closes the search.
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {said}
      </span>
    </div>
  );
}
