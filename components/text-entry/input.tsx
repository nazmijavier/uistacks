"use client";

import { useId, useImperativeHandle, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CircleAlert, CircleCheck, X } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type InputSize = "sm" | "md" | "lg" | "xl";
export type InputVariant = "outline" | "filled";
export type InputValidation = "none" | "error" | "success";

export interface InputProps extends Omit<ComponentProps<"input">, "size" | "prefix"> {
  label?: ReactNode;
  /** Helper text under the field. An error message takes its place. */
  hint?: ReactNode;
  /** Error message under the field. Setting it turns the field red. */
  error?: ReactNode;
  /** Mark the field without a message. `error` wins over this. */
  validation?: InputValidation;
  /** Outline: surface with a 1 px border. Filled: a grey well that turns white on focus. */
  variant?: InputVariant;
  size?: InputSize;
  /** Icon at the start, sized for you (16 px up to md, 20 px from lg). */
  leadingIcon?: ReactNode;
  /** Muted text before the value, e.g. "$". */
  prefix?: ReactNode;
  /** Muted text after the value, e.g. "USD". */
  suffix?: ReactNode;
  /** Anything at the end: a shortcut key, a unit picker, a button. */
  trailing?: ReactNode;
  /** Show a clear button while the field has a value. */
  clearable?: boolean;
  onClear?: () => void;
  /** Called with the text on every change, and with "" on clear. */
  onValueChange?: (value: string) => void;
  /** Class for the wrapper that holds the label, the field and the message. */
  className?: string;
}

const spring = { type: "spring", stiffness: 520, damping: 34 } as const;

// The status icon steps with the leading icon: 16 px up to md, 20 px from lg.
const SIZES: Record<InputSize, { field: string; text: string; icon: string; status: number }> = {
  sm: { field: "h-8 gap-2 rounded-[12px] px-2.5", text: "text-[13px] leading-5", icon: "[&_svg]:size-4", status: 16 },
  md: { field: "h-9 gap-2 rounded-[14px] px-3", text: "text-sm leading-5", icon: "[&_svg]:size-4", status: 16 },
  lg: { field: "h-10 gap-2 rounded-[14px] px-3", text: "text-[15px] leading-[22px]", icon: "[&_svg]:size-5", status: 20 },
  xl: { field: "h-12 gap-2.5 rounded-[14px] px-3.5", text: "text-base leading-6", icon: "[&_svg]:size-5", status: 20 },
};

export function Input({
  label,
  hint,
  error,
  validation = "none",
  variant = "outline",
  size = "md",
  leadingIcon,
  prefix,
  suffix,
  trailing,
  clearable = false,
  onClear,
  onValueChange,
  className = "",
  id,
  ref,
  value,
  defaultValue,
  onChange,
  disabled,
  readOnly,
  "aria-describedby": describedBy,
  ...rest
}: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const msgId = `${inputId}-message`;
  const okId = `${inputId}-ok`;
  const inner = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLInputElement, []);
  const [own, setOwn] = useState(String(defaultValue ?? ""));
  const current = value !== undefined ? String(value) : own;
  const reduce = useReduce();

  const state: InputValidation = error ? "error" : validation;
  const message = error || hint;
  const s = SIZES[size];
  const interactive = !disabled && !readOnly;
  const showClear = clearable && interactive && current.length > 0;
  const pop = reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 };

  const clear = () => {
    if (value === undefined) setOwn("");
    onValueChange?.("");
    onClear?.();
    inner.current?.focus();
  };

  const filled = variant === "filled" && !readOnly;
  const fill = readOnly
    ? "bg-subtle"
    : filled
      ? `bg-muted focus-within:bg-surface ${disabled ? "" : "hover:not-focus-within:bg-track"}`
      : `bg-surface ${disabled ? "" : "hover:not-focus-within:bg-subtle"}`;
  // the 1 px edge: red in error, hidden on a filled field until it has focus
  const edge =
    state === "error" ? "shadow-[0_0_0_1px_var(--danger)]" : filled ? "focus-within:shadow-[var(--shadow-control)]" : "shadow-[var(--shadow-control)]";
  const ring = `has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-offset-2 has-[input:focus-visible]:ring-offset-[var(--bg)] ${
    state === "error" ? "has-[input:focus-visible]:ring-[var(--danger)]" : "has-[input:focus-visible]:ring-[var(--select)]"
  }`;

  return (
    <div className={`flex w-full flex-col ${className}`}>
      {label && (
        <label htmlFor={inputId} className={`mb-1.5 w-fit font-medium text-fg ${size === "sm" ? "text-[13px] leading-5" : "text-sm leading-5"}`}>
          {label}
        </label>
      )}

      <div
        className={`flex items-center transition-[background-color,box-shadow] duration-150 ${s.field} ${fill} ${edge} ${ring} ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-text"
        }`}
        onMouseDown={(e) => {
          // a click on the padding or an icon focuses the text
          if (e.target === e.currentTarget && !disabled) {
            e.preventDefault();
            inner.current?.focus();
          }
        }}
      >
        {leadingIcon && <span className={`pointer-events-none flex shrink-0 text-fg-muted ${s.icon}`}>{leadingIcon}</span>}
        {prefix && <span className={`pointer-events-none shrink-0 text-fg-subtle ${s.text}`}>{prefix}</span>}

        <input
          ref={inner}
          id={inputId}
          value={current}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={state === "error" || undefined}
          aria-describedby={[describedBy, message ? msgId : undefined, state === "success" ? okId : undefined].filter(Boolean).join(" ") || undefined}
          onChange={(e) => {
            if (value === undefined) setOwn(e.target.value);
            onChange?.(e);
            onValueChange?.(e.target.value);
          }}
          className={`h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed ${s.text}`}
          // No spell-check squiggle under addresses (a spellCheck prop still wins).
          spellCheck={rest.type === "email" || rest.type === "url" ? false : undefined}
          {...rest}
        />

        {suffix && <span className={`pointer-events-none shrink-0 text-fg-subtle ${s.text}`}>{suffix}</span>}

        <AnimatePresence initial={false} mode="popLayout">
          {showClear && (
            <motion.button
              key="clear"
              type="button"
              aria-label="Clear"
              onClick={clear}
              initial={pop}
              animate={{ opacity: 1, scale: 1 }}
              exit={pop}
              transition={spring}
              className="grid size-6 shrink-0 place-items-center rounded-full text-fg-subtle transition-colors hover:bg-muted hover:text-fg outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
            >
              <X size={16} strokeWidth={1.5} />
            </motion.button>
          )}
          {state !== "none" && (
            <motion.span
              key={state}
              aria-hidden
              initial={pop}
              animate={{ opacity: 1, scale: 1 }}
              exit={pop}
              transition={spring}
              className={`pointer-events-none flex shrink-0 ${state === "error" ? "text-danger" : "text-success"}`}
            >
              {state === "error" ? <CircleAlert size={s.status} strokeWidth={1.5} /> : <CircleCheck size={s.status} strokeWidth={1.5} />}
            </motion.span>
          )}
        </AnimatePresence>

        {trailing && <span className="flex shrink-0 items-center">{trailing}</span>}
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
            <p id={msgId} className={`pt-1.5 ${size === "sm" ? "text-xs leading-4" : "text-[13px] leading-5"} ${state === "error" ? "text-danger-text" : "text-fg-muted"}`}>
              {message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      {/* The success icon is decorative, so the state is also given in words. */}
      {state === "success" && (
        <span id={okId} className="sr-only">
          Valid
        </span>
      )}
      {/* Announces an error when it appears (the visible message may already be mounted as a hint). */}
      <span className="sr-only" role="status" aria-live="polite">
        {state === "error" ? error : null}
      </span>
    </div>
  );
}
