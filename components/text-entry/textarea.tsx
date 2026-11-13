"use client";

import { useId, useImperativeHandle, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CircleAlert, CircleCheck } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type TextareaSize = "md" | "lg";
export type TextareaVariant = "outline" | "filled";
export type TextareaValidation = "none" | "error" | "success";

export interface TextareaProps extends Omit<ComponentProps<"textarea">, "size"> {
  label?: ReactNode;
  /** Helper text under the field. An error message takes its place. */
  hint?: ReactNode;
  /** Error message under the field. Setting it turns the field red. */
  error?: ReactNode;
  /** Mark the field without a message. `error` wins over this. */
  validation?: TextareaValidation;
  /** Outline: surface with a 1 px border. Filled: a grey well that turns white on focus. */
  variant?: TextareaVariant;
  size?: TextareaSize;
  /** Grow with the text from `minRows` up to `maxRows`, then scroll. Default true. */
  autoGrow?: boolean;
  /** Visible lines when empty. Default 3 (md) or 4 (lg). */
  minRows?: number;
  maxRows?: number;
  /** Show "used/limit" in the corner when `maxLength` is set. Default true. */
  counter?: boolean;
  /** Buttons on the left of the footer, e.g. bold, italic, list, link. */
  toolbar?: ReactNode;
  /** Called with the text on every change. */
  onValueChange?: (value: string) => void;
  /** Class for the wrapper that holds the label, the field and the message. */
  className?: string;
}

const spring = { type: "spring", stiffness: 520, damping: 34 } as const;

const SIZES: Record<TextareaSize, { box: string; text: string; count: string; rows: number }> = {
  md: { box: "p-1", text: "text-sm leading-5", count: "text-xs leading-4", rows: 3 },
  lg: { box: "p-1.5", text: "text-[15px] leading-[22px]", count: "text-[13px] leading-5", rows: 4 },
};

export function Textarea({
  label,
  hint,
  error,
  validation = "none",
  variant = "outline",
  size = "md",
  autoGrow = true,
  minRows,
  maxRows = 8,
  counter = true,
  toolbar,
  onValueChange,
  className = "",
  id,
  ref,
  value,
  defaultValue,
  onChange,
  disabled,
  readOnly,
  maxLength,
  "aria-describedby": describedBy,
  ...rest
}: TextareaProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const msgId = `${fieldId}-message`;
  const countId = `${fieldId}-count`;
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement, []);
  const [own, setOwn] = useState(String(defaultValue ?? ""));
  const current = value !== undefined ? String(value) : own;
  const reduce = useReduce();

  const s = SIZES[size];
  const rows = minRows ?? s.rows;
  const state: TextareaValidation = error ? "error" : validation;
  const message = error || hint;
  const showCount = counter && maxLength !== undefined;
  const footer = Boolean(toolbar) || showCount || state !== "none";

  // grow with the text, then scroll past maxRows
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el || !autoGrow) return;
    el.style.height = "auto";
    const cs = getComputedStyle(el);
    const max = parseFloat(cs.lineHeight) * maxRows + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [current, autoGrow, maxRows, rows]);

  const filled = variant === "filled" && !readOnly;
  const fill = readOnly
    ? "bg-subtle"
    : filled
      ? `bg-muted focus-within:bg-surface ${disabled ? "" : "hover:not-focus-within:bg-track"}`
      : `bg-surface ${disabled ? "" : "hover:not-focus-within:bg-subtle"}`;
  const edge =
    state === "error" ? "shadow-[0_0_0_1px_var(--danger)]" : filled ? "focus-within:shadow-[var(--shadow-control)]" : "shadow-[var(--shadow-control)]";
  const ring = `has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-offset-2 has-[textarea:focus-visible]:ring-offset-[var(--bg)] ${
    state === "error" ? "has-[textarea:focus-visible]:ring-[var(--danger)]" : "has-[textarea:focus-visible]:ring-[var(--select)]"
  }`;
  const pop = reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 };

  return (
    <div className={`flex w-full flex-col ${className}`}>
      {label && (
        <label htmlFor={fieldId} className="mb-1.5 w-fit text-sm font-medium leading-5 text-fg">
          {label}
        </label>
      )}

      <div
        className={`flex flex-col rounded-[14px] transition-[background-color,box-shadow] duration-150 ${s.box} ${fill} ${edge} ${ring} ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-text"
        }`}
        onMouseDown={(e) => {
          // a click on the padding or the footer focuses the text
          if (e.target === e.currentTarget && !disabled) {
            e.preventDefault();
            inner.current?.focus();
          }
        }}
      >
        <textarea
          ref={inner}
          id={fieldId}
          rows={rows}
          value={current}
          disabled={disabled}
          readOnly={readOnly}
          maxLength={maxLength}
          aria-invalid={state === "error" || undefined}
          aria-describedby={[describedBy, message ? msgId : undefined, showCount ? countId : undefined].filter(Boolean).join(" ") || undefined}
          onChange={(e) => {
            if (value === undefined) setOwn(e.target.value);
            onChange?.(e);
            onValueChange?.(e.target.value);
          }}
          className={`block w-full resize-none bg-transparent px-2 pt-2 text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed ${
            footer ? "pb-1" : "pb-2"
          } ${s.text}`}
          {...rest}
        />

        {footer && (
          <div className="pointer-events-none flex h-8 shrink-0 items-center gap-2">
            {toolbar && <div className="pointer-events-auto flex items-center gap-0.5">{toolbar}</div>}
            <div className={`ml-auto flex items-center gap-1 pr-2 tabular-nums ${s.count} ${state === "error" ? "text-danger" : "text-fg-subtle"}`}>
              <AnimatePresence initial={false} mode="popLayout">
                {state !== "none" && (
                  <motion.span
                    key={state}
                    aria-hidden
                    initial={pop}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={pop}
                    transition={spring}
                    className={`flex ${state === "error" ? "text-danger" : "text-success"}`}
                  >
                    {state === "error" ? <CircleAlert size={16} strokeWidth={1.5} /> : <CircleCheck size={16} strokeWidth={1.5} />}
                  </motion.span>
                )}
              </AnimatePresence>
              {showCount && (
                // Amber in the last 10% before the limit, red at it.
                <span id={countId} className={current.length >= maxLength ? "text-danger-text" : current.length >= maxLength * 0.9 ? "text-warning-text" : undefined}>
                  {current.length}/{maxLength}
                  <span className="sr-only"> characters used</span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

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
            <p id={msgId} className={`pt-1.5 text-[13px] leading-5 ${state === "error" ? "text-danger-text" : "text-fg-muted"}`}>
              {message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      {/* The counter is read with the field; only reaching the limit is announced, never each keystroke. */}
      {showCount && (
        <span className="sr-only" role="status" aria-live="polite">
          {current.length >= maxLength ? "Character limit reached" : ""}
        </span>
      )}
    </div>
  );
}
