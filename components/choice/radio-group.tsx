"use client";

import { useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CircleAlert } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export interface RadioOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  /** Right side of a card, e.g. a price. */
  meta?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  options: RadioOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** The question above the options. */
  label?: ReactNode;
  description?: ReactNode;
  /** Error message under the options. Setting it turns the radios red. */
  error?: ReactNode;
  /** Mark the group without a message. `error` wins over this. */
  validation?: "none" | "error";
  size?: "md" | "sm";
  /** List: a radio with its text. Cards: one bordered card per option. */
  layout?: "list" | "cards";
  orientation?: "vertical" | "horizontal";
  /** Adds a hidden input so the value posts with a form. */
  name?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** Name the group when there is no visible label. */
  "aria-label"?: string;
}

const spring = { type: "spring", stiffness: 520, damping: 34 } as const;
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

export function RadioGroup({
  options,
  value,
  defaultValue,
  onValueChange,
  label,
  description,
  error,
  validation = "none",
  size = "md",
  layout = "list",
  orientation = "vertical",
  name,
  required,
  disabled = false,
  className = "",
  "aria-label": ariaLabel,
}: RadioGroupProps) {
  const id = useId();
  const [own, setOwn] = useState(defaultValue);
  const current = value ?? own;
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const reduce = useReduce();

  const invalid = Boolean(error) || validation === "error";
  const cards = layout === "cards";
  const md = size === "md";
  const enabled = options.flatMap((o, i) => (disabled || o.disabled ? [] : [i]));
  const checkedIndex = options.findIndex((o) => o.value === current);
  // roving tabindex: only the checked radio (or the first enabled one) is in the tab order
  const tabStop = enabled.includes(checkedIndex) ? checkedIndex : enabled[0];

  const select = (i: number) => {
    const next = options[i].value;
    if (value === undefined) setOwn(next);
    if (next !== current) onValueChange?.(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const at = enabled.indexOf(i);
    const n = enabled.length;
    const target =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? enabled[(at + 1) % n]
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? enabled[(at - 1 + n) % n]
          : e.key === "Home"
            ? enabled[0]
            : e.key === "End"
              ? enabled[n - 1]
              : undefined;
    if (e.key === "Enter") e.preventDefault(); // radios don't check on Enter
    if (target === undefined) return;
    e.preventDefault();
    items.current[target]?.focus();
    select(target);
  };

  const gap = cards ? (orientation === "horizontal" ? "gap-3" : "gap-2") : orientation === "horizontal" ? "gap-x-6 gap-y-3" : "gap-3";

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {(label || description) && (
        <div className="flex flex-col gap-0.5">
          {label && (
            <p id={`${id}-label`} className={`font-medium text-fg ${md ? "text-sm leading-5" : "text-[13px] leading-5"}`}>
              {label}
            </p>
          )}
          {description && (
            <p id={`${id}-description`} className="text-[13px] leading-5 text-fg-muted">
              {description}
            </p>
          )}
        </div>
      )}

      <div
        role="radiogroup"
        aria-label={label ? undefined : ariaLabel}
        aria-labelledby={label ? `${id}-label` : undefined}
        aria-describedby={[description && `${id}-description`, error && `${id}-error`].filter(Boolean).join(" ") || undefined}
        aria-orientation={orientation}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        aria-disabled={disabled || undefined}
        className={`flex ${orientation === "horizontal" ? "flex-row flex-wrap" : "flex-col"} ${gap}`}
      >
        {options.map((o, i) => {
          const on = i === checkedIndex;
          const off = disabled || o.disabled;
          // inside cards the message carries the error and the cards keep their look
          const red = invalid && !cards;
          return (
            <button
              key={o.value}
              ref={(el) => {
                items.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-labelledby={`${id}-${i}-label`}
              aria-describedby={[o.description && `${id}-${i}-description`, o.meta && `${id}-${i}-meta`].filter(Boolean).join(" ") || undefined}
              tabIndex={i === tabStop ? 0 : -1}
              disabled={off}
              onClick={() => select(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`group flex text-left disabled:cursor-not-allowed disabled:opacity-50 ${
                cards
                  ? `items-center gap-3 rounded-[16px] transition-[background-color,box-shadow] duration-150 ${md ? "p-4" : "p-3"} ${orientation === "horizontal" ? "min-w-0 flex-1" : "w-full"} ${
                      on ? "bg-select-soft shadow-[inset_0_0_0_1px_var(--select)]" : "bg-surface shadow-[inset_0_0_0_1px_var(--border)] enabled:hover:bg-subtle"
                    } ${FOCUS}`
                  : "items-start gap-2 outline-none"
              }`}
            >
              <span className="flex h-5 shrink-0 items-center">
                <span
                  aria-hidden
                  className={`grid aspect-square shrink-0 place-items-center rounded-full transition-[background-color,box-shadow] duration-150 ${md ? "size-[18px]" : "size-4"} ${
                    on
                      ? `${red ? "bg-danger" : "bg-select"}`
                      : `bg-surface ${red ? "shadow-[inset_0_0_0_1px_var(--danger)]" : "shadow-[inset_0_0_0_1px_var(--fg-subtle)]"} ${off ? "" : "group-hover:bg-subtle"}`
                  } ${
                    cards
                      ? ""
                      : `group-focus-visible:ring-2 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-[var(--bg)] ${
                          red ? "group-focus-visible:ring-[var(--danger)]" : "group-focus-visible:ring-[var(--select)]"
                        }`
                  }`}
                >
                  <AnimatePresence initial={false}>
                    {on && (
                      // An SVG circle stays perfectly round at any zoom (a 6 px box could round to an oval when scaled).
                      <motion.svg
                        key="dot"
                        viewBox="0 0 6 6"
                        className="size-1.5 overflow-visible text-white"
                        initial={reduce ? { opacity: 0 } : { scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={reduce ? { opacity: 0 } : { scale: 0 }}
                        transition={spring}
                      >
                        <circle cx="3" cy="3" r="3" fill="currentColor" />
                      </motion.svg>
                    )}
                  </AnimatePresence>
                </span>
              </span>

              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span id={`${id}-${i}-label`} className={`text-fg ${cards ? "font-medium" : ""} ${md ? "text-sm leading-5" : "text-[13px] leading-5"}`}>
                  {o.label}
                </span>
                {o.description && (
                  <span id={`${id}-${i}-description`} className={`text-fg-muted ${md ? "text-[13px] leading-5" : "text-xs leading-4"}`}>
                    {o.description}
                  </span>
                )}
              </span>

              {o.meta && (
                <span id={`${id}-${i}-meta`} className={`shrink-0 font-medium tabular-nums text-fg ${md ? "text-sm leading-5" : "text-[13px] leading-5"}`}>
                  {o.meta}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {error && (
          <motion.div
            key="error"
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={spring}
            className="-mt-3 overflow-hidden"
          >
            <p id={`${id}-error`} className="flex items-center gap-1.5 pt-2 text-[13px] leading-5 text-danger-text">
              <CircleAlert size={16} strokeWidth={1.5} className="shrink-0" />
              {error}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {name && <input type="hidden" name={name} value={current ?? ""} />}
    </div>
  );
}
