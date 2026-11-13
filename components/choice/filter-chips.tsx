"use client";

import { useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export interface FilterChipOption {
  value: string;
  label: string;
  /** Rows with this value, shown after the label. */
  count?: number;
  /** A 16 px glyph before the label. */
  icon?: ReactNode;
  disabled?: boolean;
}

export type FilterChipsSize = "sm" | "md";

export interface FilterChipsProps {
  options: FilterChipOption[];
  /** The selected values. Empty means everything (the All chip is on). */
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  /** Several chips at once (toggle buttons) or one at a time (a radio group). */
  multiple?: boolean;
  /** The chip that clears the selection. Pass a string to rename it, or false to hide it. */
  all?: boolean | string;
  /** The count on the All chip. Defaults to the sum of the option counts. */
  allCount?: number;
  /** The text link that clears the selection; it shows while something is selected. False hides it. */
  clearLabel?: string | false;
  size?: FilterChipsSize;
  disabled?: boolean;
  /** Names the group for screen readers, e.g. "Filter by stage". */
  "aria-label"?: string;
  className?: string;
}

const spring = { type: "spring", stiffness: 520, damping: 34 } as const;
const ring = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
const ALL = "\u0000all";

const SIZES: Record<FilterChipsSize, { chip: string; text: string; count: string; icon: string; check: number }> = {
  sm: { chip: "h-7 gap-1.5 px-2.5", text: "text-[13px] leading-5", count: "text-[12px] leading-4", icon: "[&_svg]:size-4", check: 14 },
  md: { chip: "h-8 gap-1.5 px-3", text: "text-[13px] leading-5", count: "text-[12px] leading-4", icon: "[&_svg]:size-4", check: 16 },
};

function Check({ size, reduce }: { size: number; reduce: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      <motion.path d="M3 8.5 6.5 12 13 4.5" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.22, ease: "easeOut", delay: reduce ? 0 : 0.05 }} />
    </svg>
  );
}

export function FilterChips({
  options,
  value,
  defaultValue,
  onValueChange,
  multiple = true,
  all = true,
  allCount,
  clearLabel = "Clear",
  size = "md",
  disabled = false,
  "aria-label": ariaLabel = "Filters",
  className = "",
}: FilterChipsProps) {
  const reduce = useReduce();
  const s = SIZES[size];
  const [own, setOwn] = useState<string[]>(defaultValue ?? []);
  const selected = value ?? own;
  const on = new Set(selected);
  const chips = useRef(new Map<string, HTMLButtonElement>());
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const commit = (next: string[]) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };
  const toggle = (v: string) => {
    if (v === ALL) return commit([]);
    // one at a time: a second click goes back to All, or keeps the choice when there is no All chip
    if (!multiple) return commit(on.has(v) ? (all === false ? selected : []) : [v]);
    commit(on.has(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };

  const allLabel = all === false ? null : typeof all === "string" ? all : "All";
  const total = allCount ?? (options.some((o) => o.count !== undefined) ? options.reduce((n, o) => n + (o.count ?? 0), 0) : undefined);
  const items: (FilterChipOption & { key: string })[] = [
    ...(allLabel ? [{ value: ALL, key: ALL, label: allLabel, count: total }] : []),
    ...options.map((o) => ({ ...o, key: o.value })),
  ];
  const isOn = (k: string) => (k === ALL ? selected.length === 0 : on.has(k));
  const enabled = items.filter((o) => !o.disabled && !disabled);
  // One chip is in the Tab order: the last focused, else the first selected, else the first.
  const tabKey =
    (focusKey && enabled.some((o) => o.key === focusKey) ? focusKey : null) ?? enabled.find((o) => isOn(o.key))?.key ?? enabled[0]?.key;

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, key: string) => {
    const i = enabled.findIndex((o) => o.key === key);
    const to =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? (i + 1) % enabled.length
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? (i - 1 + enabled.length) % enabled.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? enabled.length - 1
              : -1;
    if (to < 0) return;
    e.preventDefault();
    const next = enabled[to].key;
    setFocusKey(next);
    chips.current.get(next)?.focus();
    // a radio group selects as focus moves
    if (!multiple && next !== ALL) commit([next]);
    else if (!multiple && next === ALL) commit([]);
  };

  const showClear = clearLabel !== false && selected.length > 0 && !disabled;
  const pop = reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 };

  return (
    <div
      role={multiple ? "group" : "radiogroup"}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      className={`flex flex-wrap items-center gap-2 ${disabled ? "opacity-50" : ""} ${className}`}
    >
      {items.map((o) => {
        const active = isOn(o.key);
        const off = disabled || o.disabled;
        return (
          <motion.button
            key={o.key}
            ref={(el) => {
              if (el) chips.current.set(o.key, el);
              else chips.current.delete(o.key);
            }}
            type="button"
            layout={reduce ? false : "position"}
            transition={spring}
            role={multiple ? undefined : "radio"}
            aria-pressed={multiple ? active : undefined}
            aria-checked={multiple ? undefined : active}
            disabled={off}
            tabIndex={o.key === tabKey ? 0 : -1}
            whileTap={reduce || off ? undefined : { scale: 0.96 }}
            onFocus={() => setFocusKey(o.key)}
            onKeyDown={(e) => onKeyDown(e, o.key)}
            onClick={() => toggle(o.key)}
            className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-medium transition-[background-color,color,box-shadow] duration-150 disabled:cursor-not-allowed ${s.chip} ${s.text} ${s.icon} ${
              active
                ? "bg-select-soft text-select-text shadow-[inset_0_0_0_1px_var(--select)]"
                : `bg-surface text-fg shadow-[inset_0_0_0_1px_var(--border)] ${off ? "opacity-50" : "hover:bg-subtle"}`
            } ${ring}`}
          >
            {/* multi select: a check draws in on the chip; the row reflows around it */}
            <AnimatePresence initial={false}>
              {multiple && active && o.key !== ALL && (
                <motion.span
                  key="check"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, width: 0, marginRight: -6 }}
                  animate={{ opacity: 1, width: s.check, marginRight: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, width: 0, marginRight: -6 }}
                  transition={spring}
                  className="flex shrink-0"
                >
                  <Check size={s.check} reduce={reduce} />
                </motion.span>
              )}
            </AnimatePresence>
            {o.icon && <span className={`flex shrink-0 ${active ? "" : "text-fg-muted"}`}>{o.icon}</span>}
            <span>{o.label}</span>
            {o.count !== undefined && (
              <span className={`tabular-nums ${s.count} ${active ? "text-select-text/70" : "text-fg-subtle"}`}>{o.count.toLocaleString("en-US")}</span>
            )}
          </motion.button>
        );
      })}
      <AnimatePresence initial={false}>
        {showClear && (
          <motion.button
            key="clear"
            type="button"
            layout={reduce ? false : "position"}
            initial={pop}
            animate={{ opacity: 1, scale: 1 }}
            exit={pop}
            transition={spring}
            onClick={() => {
              commit([]);
              // focus goes to the All chip (or the first chip) so the keyboard stays in the group
              const first = items[0]?.key;
              if (first) {
                setFocusKey(first);
                requestAnimationFrame(() => chips.current.get(first)?.focus());
              }
            }}
            className={`inline-flex ${size === "sm" ? "h-7" : "h-8"} shrink-0 items-center rounded-full px-1.5 text-[13px] font-medium leading-5 text-fg-muted underline-offset-4 transition-colors hover:text-fg hover:underline ${ring}`}
          >
            {clearLabel}
            <span className="sr-only"> filters</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
