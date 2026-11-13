"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

/** `"mixed"` draws a dash: some of the items it controls are on. */
export type CheckedState = boolean | "mixed";

export interface CheckboxProps extends Omit<ComponentProps<"input">, "type" | "size" | "checked" | "defaultChecked"> {
  checked?: CheckedState;
  defaultChecked?: CheckedState;
  /** Called with the new value. A mixed box always turns on. */
  onCheckedChange?: (checked: boolean) => void;
  size?: "md" | "sm";
  /** Error turns the box and the description red. */
  validation?: "none" | "error";
  label?: ReactNode;
  description?: ReactNode;
  /** Error message in the description's place. Setting it turns the box red and announces the message. */
  error?: ReactNode;
  className?: string;
}

const CHECK = "M2.75 8.25 6.25 11.75 13.25 4.5";
const DASH = "M3.75 8h8.5";

export function Checkbox({
  checked,
  defaultChecked = false,
  onCheckedChange,
  size = "md",
  validation = "none",
  label,
  description: descriptionProp,
  error: errorMessage,
  className = "",
  id,
  ref,
  disabled,
  onChange,
  "aria-describedby": describedBy,
  ...rest
}: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const labelId = `${inputId}-label`;
  const descId = `${inputId}-description`;
  const inner = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLInputElement, []);
  const [own, setOwn] = useState<CheckedState>(defaultChecked);
  const state = checked ?? own;
  const reduce = useReduce();

  const on = state !== false;
  const error = Boolean(errorMessage) || validation === "error";
  const description = errorMessage || descriptionProp;
  const md = size === "md";

  // the native input carries "mixed" to assistive tech
  useEffect(() => {
    if (inner.current) inner.current.indeterminate = state === "mixed";
  }, [state]);

  const draw = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { pathLength: 0 }, animate: { pathLength: 1 }, exit: { pathLength: 0, transition: { duration: 0.1 } } };

  const box = on
    ? `${error ? "bg-danger" : "bg-select"} shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] ${
        disabled ? "" : error ? "group-hover:bg-[color-mix(in_oklab,var(--danger)_88%,white)]" : "group-hover:bg-[color-mix(in_oklab,var(--select)_88%,white)]"
      }`
    : `bg-surface ${error ? "shadow-[inset_0_0_0_1px_var(--danger)]" : "shadow-[inset_0_0_0_1px_var(--fg-subtle)]"} ${disabled ? "" : "group-hover:bg-subtle"}`;

  return (
    <label className={`group inline-flex items-start gap-2 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${className}`}>
      <span className="relative flex h-5 shrink-0 items-center">
        <input
          ref={inner}
          id={inputId}
          type="checkbox"
          checked={state === true}
          disabled={disabled}
          aria-labelledby={label ? labelId : undefined}
          aria-describedby={[describedBy, description ? descId : undefined].filter(Boolean).join(" ") || undefined}
          aria-invalid={error || undefined}
          onChange={(e) => {
            if (checked === undefined) setOwn(e.target.checked);
            onChange?.(e);
            onCheckedChange?.(e.target.checked);
          }}
          className="peer absolute inset-0 m-0 size-full cursor-[inherit] opacity-0"
          {...rest}
        />
        <span
          aria-hidden
          className={`grid shrink-0 place-items-center rounded-[6px] transition-[background-color,box-shadow,scale] duration-150 motion-safe:group-active:scale-95 ${
            md ? "size-[18px]" : "size-4"
          } ${box} peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--bg)] ${
            error ? "peer-focus-visible:ring-[var(--danger)]" : "peer-focus-visible:ring-[var(--select)]"
          }`}
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`text-white ${md ? "size-3.5" : "size-3"}`}
          >
            <AnimatePresence initial={false}>
              {state === true && <motion.path key="check" d={CHECK} {...draw} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} />}
              {state === "mixed" && <motion.path key="dash" d={DASH} {...draw} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }} />}
            </AnimatePresence>
          </svg>
        </span>
      </span>

      {(label || description) && (
        <span className="flex min-w-0 flex-col gap-0.5">
          {label && (
            <span id={labelId} className={`text-fg ${md ? "text-sm leading-5" : "text-[13px] leading-5"}`}>
              {label}
            </span>
          )}
          {description && (
            <span id={descId} className={`${md ? "text-[13px] leading-5" : "text-xs leading-4"} ${error ? "text-danger-text" : "text-fg-muted"}`}>
              {description}
            </span>
          )}
        </span>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {errorMessage || null}
      </span>
    </label>
  );
}
