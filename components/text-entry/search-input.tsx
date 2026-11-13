"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState, useSyncExternalStore, type KeyboardEvent, type Ref } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Clock, LoaderCircle, Search, X } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}
/** Apple keyboards show ⌘; others show Ctrl. The server renders ⌘ and the client corrects it after hydration. */
function useIsMac() {
  return useSyncExternalStore(
    noSubscribe,
    () => /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent),
    () => true
  );
}

export type SearchInputSize = "sm" | "md" | "lg";

export interface SearchInputHandle {
  focus: () => void;
  /** Opens or closes the Recent list without moving focus (for a scripted tour). */
  setOpen: (open: boolean) => void;
  /** Highlights a Recent row by index (-1 for none), as the arrow keys do. */
  setActive: (index: number) => void;
}

export interface SearchInputProps {
  value?: string;
  defaultValue?: string;
  /** Every keystroke. */
  onValueChange?: (value: string) => void;
  /** Enter, or a pick from Recent. The query is added to the top of Recent. */
  onSearch?: (query: string) => void;
  /** Past searches, newest first. */
  recent?: string[];
  defaultRecent?: string[];
  onRecentChange?: (recent: string[]) => void;
  /** How many searches Recent keeps (5). */
  maxRecent?: number;
  /** Swaps the search glyph for a spinner while results load. */
  loading?: boolean;
  /** The letter that focuses the field with ⌘ or Ctrl (k). False turns the shortcut and its keycap off. */
  shortcut?: string | false;
  placeholder?: string;
  size?: SearchInputSize;
  disabled?: boolean;
  /** The list's heading. */
  recentLabel?: string;
  /** Imperative focus / setOpen / setActive. */
  ref?: Ref<SearchInputHandle>;
  name?: string;
  id?: string;
  /** Names the field (Search). */
  "aria-label"?: string;
  className?: string;
}

const spring = { type: "spring", stiffness: 520, damping: 34 } as const;

const SIZES: Record<SearchInputSize, { field: string; text: string; icon: number; kbd: string }> = {
  sm: { field: "h-8 gap-2 rounded-[12px] pl-2.5 pr-1.5", text: "text-[13px] leading-5", icon: 16, kbd: "h-5 text-[12px]" },
  md: { field: "h-9 gap-2 rounded-[14px] pl-3 pr-2", text: "text-sm leading-5", icon: 16, kbd: "h-5 text-[12px]" },
  lg: { field: "h-10 gap-2 rounded-[14px] pl-3 pr-2", text: "text-[15px] leading-[22px]", icon: 20, kbd: "h-6 text-[12px]" },
};

/** Bolds the typed text inside a recent search. */
function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-medium text-fg">{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  );
}

export function SearchInput({
  value,
  defaultValue = "",
  onValueChange,
  onSearch,
  recent,
  defaultRecent = [],
  onRecentChange,
  maxRecent = 5,
  loading = false,
  shortcut = "k",
  placeholder = "Search",
  size = "md",
  disabled = false,
  recentLabel = "Recent",
  ref,
  name,
  id,
  "aria-label": ariaLabel = "Search",
  className = "",
}: SearchInputProps) {
  const uid = useId();
  const inputId = id ?? `${uid}-input`;
  const listId = `${uid}-list`;
  const reduce = useReduce();
  const mac = useIsMac();
  const s = SIZES[size];
  const input = useRef<HTMLInputElement>(null);
  const [ownQuery, setOwnQuery] = useState(defaultValue);
  const query = value ?? ownQuery;
  const [ownRecent, setOwnRecent] = useState(defaultRecent);
  const list = recent ?? ownRecent;
  const [open, setOpenRaw] = useState(false);
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const [said, setSaid] = useState("");

  const q = query.trim().toLowerCase();
  // While typing, Recent narrows to the searches that contain the text (and hides an exact repeat).
  const rows = list.filter((r) => !q || (r.toLowerCase().includes(q) && r.toLowerCase() !== q)).slice(0, maxRecent);
  const showList = open && rows.length > 0 && !disabled;
  const hot = active >= 0 && active < rows.length ? active : -1;

  const setOpen = (next: boolean) => {
    setOpenRaw(next);
    if (!next) setActive(-1);
  };
  const setQuery = (next: string) => {
    if (value === undefined) setOwnQuery(next);
    onValueChange?.(next);
  };
  const setRecent = (next: string[]) => {
    if (recent === undefined) setOwnRecent(next);
    onRecentChange?.(next);
  };

  const submit = (text: string) => {
    const t = text.trim();
    if (!t) return;
    if (t !== query) setQuery(t);
    setRecent([t, ...list.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, Math.max(maxRecent, list.length)));
    onSearch?.(t);
    setOpen(false);
  };
  const remove = (r: string) => {
    const i = rows.indexOf(r);
    setRecent(list.filter((x) => x !== r));
    setSaid(`Removed ${r} from ${recentLabel.toLowerCase()}`);
    // the highlight stays on the row that slides into its place
    if (hot >= 0) setActive(Math.min(i, rows.length - 2));
    input.current?.focus();
  };
  const clear = () => {
    setQuery("");
    setActive(-1);
    setOpenRaw(true);
    input.current?.focus();
  };

  useImperativeHandle(ref, () => ({
    focus: () => input.current?.focus(),
    setOpen,
    setActive: (i: number) => {
      setOpenRaw(true);
      setActive(i);
    },
  }));

  // ⌘K / Ctrl K focuses the field from anywhere on the page.
  useEffect(() => {
    if (!shortcut || disabled) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === shortcut.toLowerCase()) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
        setOpenRaw(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcut, disabled]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const k = e.key;
    if (k === "ArrowDown" || k === "ArrowUp") {
      e.preventDefault();
      if (!showList) {
        setOpenRaw(true);
        setActive(k === "ArrowUp" ? rows.length - 1 : 0);
        return;
      }
      const n = rows.length;
      setActive(hot < 0 ? (k === "ArrowDown" ? 0 : n - 1) : (hot + (k === "ArrowDown" ? 1 : -1) + n) % n);
    } else if (k === "Enter") {
      e.preventDefault();
      submit(hot >= 0 ? rows[hot] : query);
    } else if (k === "Escape") {
      // first Escape closes the list, the next clears the text, the next leaves the field
      if (showList) {
        e.preventDefault();
        setOpen(false);
      } else if (query) {
        e.preventDefault();
        setQuery("");
      } else input.current?.blur();
    } else if (k === "Delete" && hot >= 0 && (e.shiftKey || input.current?.selectionStart === query.length)) {
      // Delete at the end of the text (or Shift Delete) removes the highlighted recent search
      e.preventDefault();
      remove(rows[hot]);
    } else if (k === "Tab") setOpen(false);
  };

  const pop = reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 };
  const showKbd = Boolean(shortcut) && !query && !focused && !disabled;
  const keyName = shortcut ? shortcut.toUpperCase() : "";

  return (
    <div role="search" className={`relative w-full ${className}`}>
      <div
        onMouseDown={(e) => {
          if (disabled || e.target === input.current || (e.target as HTMLElement).closest("button")) return;
          e.preventDefault();
          input.current?.focus();
        }}
        className={`flex items-center bg-surface shadow-[var(--shadow-control)] transition-[background-color,box-shadow] duration-150 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-[var(--select)] has-[input:focus-visible]:ring-offset-2 has-[input:focus-visible]:ring-offset-[var(--bg)] ${s.field} ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-text hover:not-focus-within:bg-subtle"
        }`}
      >
        <span aria-hidden className="relative grid shrink-0 place-items-center text-fg-muted">
          <AnimatePresence initial={false} mode="popLayout">
            {loading ? (
              <motion.span key="loading" initial={pop} animate={{ opacity: 1, scale: 1 }} exit={pop} transition={spring} className="flex">
                <LoaderCircle size={s.icon} strokeWidth={1.75} className="motion-safe:animate-spin" />
              </motion.span>
            ) : (
              <motion.span key="search" initial={pop} animate={{ opacity: 1, scale: 1 }} exit={pop} transition={spring} className="flex">
                <Search size={s.icon} strokeWidth={1.5} />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <input
          ref={input}
          id={inputId}
          name={name}
          type="text"
          role="combobox"
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && hot >= 0 ? `${uid}-option-${hot}` : undefined}
          aria-keyshortcuts={shortcut ? `${mac ? "Meta" : "Control"}+${keyName}` : undefined}
          aria-busy={loading || undefined}
          disabled={disabled}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(-1);
            setOpenRaw(true);
          }}
          onFocus={() => {
            setFocused(true);
            setOpenRaw(true);
          }}
          onBlur={() => {
            setFocused(false);
            setOpen(false);
          }}
          onClick={() => setOpenRaw(true)}
          onKeyDown={onKeyDown}
          className={`h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed ${s.text}`}
        />
        <AnimatePresence initial={false} mode="popLayout">
          {query && !disabled ? (
            <motion.button
              key="clear"
              type="button"
              tabIndex={-1}
              aria-label="Clear search"
              initial={pop}
              animate={{ opacity: 1, scale: 1 }}
              exit={pop}
              transition={spring}
              onMouseDown={(e) => e.preventDefault()}
              onClick={clear}
              className="grid size-6 shrink-0 place-items-center rounded-full text-fg-subtle transition-colors hover:bg-muted hover:text-fg"
            >
              <X size={16} strokeWidth={1.5} />
            </motion.button>
          ) : showKbd ? (
            <motion.kbd
              key="kbd"
              aria-hidden
              initial={pop}
              animate={{ opacity: 1, scale: 1 }}
              exit={pop}
              transition={spring}
              className={`pointer-events-none inline-flex shrink-0 items-center gap-0.5 rounded-[8px] bg-muted px-1.5 font-sans font-medium leading-4 text-fg-muted ${s.kbd}`}
            >
              {mac ? <span className="text-[13px] leading-4">⌘</span> : <span>Ctrl</span>}
              <span>{keyName}</span>
            </motion.kbd>
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showList && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.12 } }}
            transition={spring}
            // keeps focus in the field while the pointer picks a search
            onMouseDown={(e) => e.preventDefault()}
            className="absolute inset-x-0 top-[calc(100%+6px)] z-30 origin-top rounded-[16px] bg-surface p-1.5 shadow-[var(--shadow-card)] dark:shadow-[var(--shadow-hairline)]"
          >
            <div id={`${uid}-heading`} className="px-2.5 pb-1 pt-1.5 text-xs font-medium leading-4 text-fg-subtle">
              {recentLabel}
            </div>
            <ul role="listbox" id={listId} aria-labelledby={`${uid}-heading`} className="flex flex-col gap-0.5">
              <AnimatePresence initial={false}>
                {rows.map((r, i) => (
                  <motion.li
                    key={r}
                    id={`${uid}-option-${i}`}
                    role="option"
                    aria-selected={i === hot}
                    layout={reduce ? false : "position"}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, x: -8, transition: { duration: 0.14 } }}
                    transition={spring}
                    onPointerMove={() => i !== hot && setActive(i)}
                    onClick={() => submit(r)}
                    className={`group/row flex h-9 cursor-pointer items-center gap-2.5 rounded-[12px] pl-2.5 pr-1 transition-colors ${i === hot ? "bg-fg/5" : ""}`}
                  >
                    <Clock aria-hidden size={16} strokeWidth={1.5} className="shrink-0 text-fg-subtle" />
                    <span className="min-w-0 flex-1 truncate text-sm leading-5 text-fg-muted">
                      <Highlight text={r} query={q} />
                    </span>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={`Remove ${r}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(r);
                      }}
                      className={`grid size-7 shrink-0 place-items-center rounded-full text-fg-subtle transition-[opacity,background-color,color] hover:bg-muted hover:text-fg [@media(hover:none)]:opacity-100 ${
                        i === hot ? "opacity-100" : "opacity-0 group-hover/row:opacity-100"
                      }`}
                    >
                      <X size={16} strokeWidth={1.5} />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            <p className="sr-only">Use the arrow keys to move, Enter to search, and Delete to remove a search.</p>
          </motion.div>
        )}
      </AnimatePresence>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
