"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown, CircleAlert } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export interface ComboboxOption {
  value: string;
  label: string;
  /** A muted line under the label. */
  description?: string;
  /** Right-aligned text, such as a GMT offset, a count or a code. */
  meta?: string;
  /** Extra words that should match the search (abbreviations, other cities). */
  keywords?: string[];
  icon?: ReactNode;
  disabled?: boolean;
}

export interface ComboboxGroup {
  label: string;
  options: ComboboxOption[];
}

export interface ComboboxProps {
  /** Options, or groups of options with a heading. */
  options: (ComboboxOption | ComboboxGroup)[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  label?: ReactNode;
  /** Helper text under the field. An error message takes its place. */
  hint?: ReactNode;
  /** Error message under the field. Setting it turns the field red. */
  error?: ReactNode;
  placeholder?: string;
  /** Glyph at the start of the field, 16 px. */
  icon?: ReactNode;
  /** Shown when nothing matches; gets the typed text. */
  emptyText?: (query: string) => ReactNode;
  disabled?: boolean;
  /** Adds a hidden input so the value posts with a form. */
  name?: string;
  id?: string;
  "aria-label"?: string;
  /** The list's max height in px before it scrolls. Default 300. */
  listMaxHeight?: number;
  /** Wrapper class (label, field and message). */
  className?: string;
}

const isGroup = (o: ComboboxOption | ComboboxGroup): o is ComboboxGroup => "options" in o;
const spring = { type: "spring", stiffness: 520, damping: 34 } as const;

const matches = (o: ComboboxOption, q: string) =>
  [o.label, o.description, o.meta, ...(o.keywords ?? [])].some((t) => t?.toLowerCase().includes(q));

function Check({ reduce }: { reduce: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <motion.path d="M20 6 9 17l-5-5" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.22, ease: "easeOut" }} />
    </svg>
  );
}

/** Opens the list upward when it would run past the bottom of the viewport and fits above. */
function flipMenu(menu: HTMLDivElement | null) {
  const field = menu?.parentElement;
  if (!menu || !field) return;
  const anchor = field.getBoundingClientRect();
  const h = menu.offsetHeight + 6;
  menu.toggleAttribute("data-up", anchor.bottom + h > window.innerHeight - 8 && anchor.top - h >= 8);
}

/** Bolds the typed text inside a label. */
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

export function Combobox({
  options,
  value,
  defaultValue,
  onValueChange,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  label,
  hint,
  error,
  placeholder = "Search",
  icon,
  emptyText = (q) => `No matches for “${q}”`,
  disabled = false,
  name,
  id,
  "aria-label": ariaLabel,
  listMaxHeight = 300,
  className = "",
}: ComboboxProps) {
  const uid = useId();
  const inputId = id ?? `${uid}-input`;
  const listId = `${uid}-list`;
  const labelId = `${uid}-label`;
  const msgId = `${uid}-message`;
  const reduce = !!useReduce();
  const [own, setOwn] = useState(defaultValue);
  const current = value ?? own;
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const open = !disabled && (openProp ?? ownOpen);
  // null until the person types: the field then shows the chosen label and the list shows everything.
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const all = options.flatMap((o) => (isGroup(o) ? o.options : [o]));
  const selected = all.find((o) => o.value === current);
  const q = (query ?? "").trim().toLowerCase();
  const visibleGroups = options
    .map((o) => (isGroup(o) ? { label: o.label, options: o.options.filter((x) => !q || matches(x, q)) } : { label: "", options: !q || matches(o, q) ? [o] : [] }))
    .filter((g) => g.options.length > 0);
  const flat = visibleGroups.flatMap((g) => g.options);
  const indexOf = new Map(flat.map((o, i) => [o, i] as const));
  const selectedIndex = flat.findIndex((o) => o.value === current);
  const firstIndex = flat.findIndex((o) => !o.disabled);
  const lastIndex = flat.findLastIndex((o) => !o.disabled);
  const highlighted = active >= 0 && active < flat.length ? active : q ? firstIndex : selectedIndex >= 0 ? selectedIndex : firstIndex;
  const optionId = (i: number) => `${uid}-option-${i}`;
  const invalid = Boolean(error);
  const message = error || hint;

  const setOpen = (next: boolean) => {
    if (next === open) return;
    setOwnOpen(next);
    onOpenChange?.(next);
    if (!next) {
      setActive(-1);
      setQuery(null);
    }
  };
  const choose = (i: number) => {
    const o = flat[i];
    if (!o || o.disabled) return;
    setOwn(o.value);
    if (o.value !== current) onValueChange?.(o.value);
    setOpen(false);
    setQuery(null);
  };
  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < flat.length; i += dir) if (!flat[i].disabled) return i;
    return from;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const k = e.key;
    if (k === "ArrowDown" || k === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(e.altKey ? -1 : k === "ArrowUp" ? lastIndex : highlighted);
        return;
      }
      if (e.altKey && k === "ArrowUp") return setOpen(false);
      setActive(step(highlighted, k === "ArrowDown" ? 1 : -1));
    } else if ((k === "PageDown" || k === "PageUp") && open) {
      e.preventDefault();
      setActive(k === "PageDown" ? lastIndex : firstIndex);
    } else if (k === "Enter") {
      if (!open) return;
      e.preventDefault();
      choose(highlighted);
    } else if (k === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      } else if (query !== null) {
        e.preventDefault();
        setQuery(null);
      }
    } else if (k === "Tab") {
      setOpen(false);
    }
  };

  // Keep the highlighted option in view. On the first option, scroll to the top so its group heading shows too.
  // After opening, arrow keys scroll just enough.
  const wasOpen = useRef(false);
  useEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    if (!open || highlighted < 0) return;
    const box = list.current;
    const el = document.getElementById(`${uid}-option-${highlighted}`);
    if (!opening || !box || !el) {
      if (highlighted === firstIndex && box) box.scrollTop = 0;
      else el?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (box.scrollHeight <= box.clientHeight) return;
    // Right after opening, show only whole rows: the list starts on a row or group heading and ends on an option (its
    // height trimmed by less than a row), with the most rows that fit and the highlighted option nearest the middle.
    // offsetTop, not getBoundingClientRect: the list is still scaling in.
    const top = (n: HTMLElement) => n.offsetTop - box.offsetTop;
    const rows = [...box.querySelectorAll<HTMLElement>('[role="option"], [role="presentation"]')];
    const options = rows.filter((r) => r.getAttribute("role") === "option");
    const H = listMaxHeight;
    const mid = top(el) + el.offsetHeight / 2;
    const starts = highlighted === firstIndex ? [0] : rows.filter((r) => top(r) <= top(el) && top(r) + H >= top(el) + el.offsetHeight + 2).map((r) => Math.max(0, top(r) - 2));
    let best = { s: 0, fit: H, off: Infinity };
    for (const s0 of starts.length ? starts : [0]) {
      const last = options.filter((r) => top(r) + r.offsetHeight + 2 <= s0 + H).pop();
      const fit = last ? top(last) + last.offsetHeight + 2 - s0 : H;
      const off = Math.abs(mid - (s0 + fit / 2));
      if (fit > best.fit + 4 || best.off === Infinity || (Math.abs(fit - best.fit) <= 4 && off < best.off)) best = { s: s0, fit, off };
    }
    box.style.maxHeight = `${best.fit >= H * 0.6 ? best.fit : H}px`;
    box.scrollTop = best.s;
  }, [open, highlighted, firstIndex, uid, listMaxHeight]);

  // Typing reshapes the list, so give it its full height back.
  useEffect(() => {
    if (list.current) list.current.style.maxHeight = `${listMaxHeight}px`;
  }, [query, listMaxHeight]);

  const edge = invalid ? "shadow-[0_0_0_1px_var(--danger)]" : "shadow-[var(--shadow-control)]";
  const ring = `has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-offset-2 has-[input:focus-visible]:ring-offset-[var(--bg)] ${
    invalid ? "has-[input:focus-visible]:ring-[var(--danger)]" : "has-[input:focus-visible]:ring-[var(--select)]"
  }`;
  const pop = reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 };

  return (
    <div className={`flex w-full flex-col ${className}`}>
      {label && (
        <label id={labelId} htmlFor={inputId} className="mb-1.5 w-fit text-sm font-medium leading-5 text-fg">
          {label}
        </label>
      )}

      <div className="relative">
        <div
          className={`flex h-9 items-center gap-2 rounded-[14px] bg-surface px-3 transition-[background-color,box-shadow] duration-150 ${edge} ${ring} ${
            disabled ? "cursor-not-allowed opacity-50" : "cursor-text hover:not-focus-within:bg-subtle"
          }`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !disabled) {
              e.preventDefault();
              input.current?.focus();
              setOpen(!open);
            }
          }}
        >
          {(icon ?? selected?.icon) && <span className="pointer-events-none flex shrink-0 text-fg-muted [&_svg]:size-4">{icon ?? selected?.icon}</span>}
          <input
            ref={input}
            id={inputId}
            type="text"
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open && highlighted >= 0 ? optionId(highlighted) : undefined}
            aria-label={label ? undefined : ariaLabel}
            aria-invalid={invalid || undefined}
            aria-describedby={message ? msgId : undefined}
            disabled={disabled}
            placeholder={selected ? selected.label : placeholder}
            value={query ?? selected?.label ?? ""}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(-1);
              setOpen(true);
            }}
            onFocus={(e) => e.target.select()}
            onClick={() => setOpen(true)}
            onBlur={() => {
              setOpen(false);
              setQuery(null);
              setActive(-1);
            }}
            onKeyDown={onKeyDown}
            className="h-full min-w-0 flex-1 bg-transparent text-sm leading-5 text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed"
          />
          {selected?.meta && query === null && <span className="pointer-events-none shrink-0 text-[13px] leading-5 text-fg-subtle tabular-nums">{selected.meta}</span>}
          <AnimatePresence initial={false}>
            {invalid && (
              <motion.span key="error" aria-hidden initial={pop} animate={{ opacity: 1, scale: 1 }} exit={pop} transition={spring} className="flex shrink-0 text-danger">
                <CircleAlert size={20} strokeWidth={1.5} />
              </motion.span>
            )}
          </AnimatePresence>
          <button
            type="button"
            tabIndex={-1}
            aria-label={open ? "Hide options" : "Show options"}
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              input.current?.focus();
              setOpen(!open);
            }}
            className="-mr-1 flex shrink-0 rounded-full text-fg-subtle"
          >
            <motion.span aria-hidden initial={false} animate={{ rotate: open ? 180 : 0 }} transition={reduce ? { duration: 0 } : spring} className="flex">
              <ChevronDown size={20} strokeWidth={1.5} />
            </motion.span>
          </button>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              ref={flipMenu}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.12 } }}
              transition={spring}
              // keeps focus in the field while the pointer picks an option
              onMouseDown={(e) => e.preventDefault()}
              className="absolute left-0 top-[calc(100%+6px)] z-30 w-full min-w-[240px] max-w-[calc(100vw-32px)] origin-top rounded-[16px] bg-surface p-1.5 shadow-[var(--shadow-overlay)] data-[up]:top-auto data-[up]:bottom-[calc(100%+6px)] data-[up]:origin-bottom dark:bg-raised"
            >
              <div
                ref={list}
                role="listbox"
                id={listId}
                aria-labelledby={label ? labelId : undefined}
                aria-label={label ? undefined : ariaLabel}
                style={{ maxHeight: listMaxHeight }}
                className="flex flex-col gap-0.5 overflow-y-auto"
              >
                {flat.length === 0 && <div className="px-2.5 py-6 text-center text-[13px] leading-5 text-fg-muted">{emptyText(query ?? "")}</div>}
                {visibleGroups.map((g, gi) => {
                  const rows = g.options.map((o) => {
                    const i = indexOf.get(o) ?? -1;
                    const on = o.value === current;
                    const hot = i === highlighted;
                    // Found only through a keyword (an abbreviation, another city): show that keyword, so the match reads.
                    const keyword = q && ![o.label, o.description, o.meta].some((t) => t?.toLowerCase().includes(q)) ? o.keywords?.find((k) => k.toLowerCase().includes(q)) : undefined;
                    const detail = keyword ? (o.description ? `${o.description} · ${keyword}` : keyword) : o.description;
                    return (
                      <div
                        key={o.value}
                        id={optionId(i)}
                        role="option"
                        aria-selected={on}
                        aria-disabled={o.disabled || undefined}
                        onPointerMove={() => !o.disabled && i !== active && setActive(i)}
                        onClick={() => choose(i)}
                        className={`flex min-h-9 items-center gap-2.5 rounded-[12px] px-2.5 py-2 transition-colors ${o.disabled ? "opacity-50" : "cursor-pointer"} ${
                          on ? (hot ? "bg-fg/[0.07]" : "bg-fg/[0.045]") : hot && !o.disabled ? "bg-fg/[0.035]" : ""
                        }`}
                      >
                        <span className="flex size-4 shrink-0 text-fg">{on && <Check reduce={reduce} />}</span>
                        {o.icon && <span className="flex shrink-0 text-fg-muted [&_svg]:size-4">{o.icon}</span>}
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-sm leading-5 text-fg ${on ? "font-medium" : ""}`}>
                            <Highlight text={o.label} query={q} />
                          </span>
                          {detail && (
                            <span className="block truncate text-[13px] leading-[18px] text-fg-muted">
                              <Highlight text={detail} query={q} />
                            </span>
                          )}
                        </span>
                        {o.meta && (
                          <span className="shrink-0 text-[13px] leading-5 text-fg-muted tabular-nums">
                            <Highlight text={o.meta} query={q} />
                          </span>
                        )}
                      </div>
                    );
                  });
                  return g.label ? (
                    <div key={g.label} role="group" aria-labelledby={`${uid}-group-${gi}`} className={`flex flex-col gap-0.5 ${gi > 0 ? "mt-1 border-t border-border pt-1" : ""}`}>
                      <div role="presentation" id={`${uid}-group-${gi}`} className="px-2.5 pb-1 pt-1.5 text-xs font-medium leading-4 text-fg-subtle">
                        {g.label}
                      </div>
                      {rows}
                    </div>
                  ) : (
                    rows
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Always mounted, so the first count after a keystroke is read out. */}
        <span className="sr-only" aria-live="polite">
          {open && query !== null ? `${flat.length} ${flat.length === 1 ? "result" : "results"}` : ""}
        </span>
      </div>

      {name && <input type="hidden" name={name} value={current ?? ""} />}

      <AnimatePresence initial={false}>
        {message && (
          <motion.div
            key="message"
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            {/* Keyed so an error mounts fresh as an alert and is read out when it appears. */}
            <p key={invalid ? "error" : "hint"} id={msgId} role={invalid ? "alert" : undefined} className={`pt-1.5 text-[13px] leading-5 ${invalid ? "text-danger-text" : "text-fg-muted"}`}>
              {message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
