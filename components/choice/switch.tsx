"use client";

import { useId, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export interface SwitchProps extends Omit<ComponentProps<"button">, "type" | "role" | "value" | "defaultValue"> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: "md" | "sm";
  /** Which side the label sits on. "left" stretches the row: label left, switch right. */
  side?: "right" | "left";
  label?: ReactNode;
  description?: ReactNode;
  /** Class for the row that holds the switch and its text. */
  className?: string;
}

const spring = { type: "spring", stiffness: 520, damping: 34 } as const;

export function Switch({
  checked,
  defaultChecked = false,
  onCheckedChange,
  size = "md",
  side = "right",
  label,
  description,
  className = "",
  id,
  disabled,
  onClick,
  "aria-describedby": describedBy,
  ...rest
}: SwitchProps) {
  const autoId = useId();
  const switchId = id ?? autoId;
  const descId = `${switchId}-description`;
  const [own, setOwn] = useState(defaultChecked);
  const on = checked ?? own;
  const reduce = useReduce();
  const md = size === "md";

  const control = (
    <span className="flex h-5 shrink-0 items-center">
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={on}
        // A fallback name when no label, aria-label or aria-labelledby is given (rest overrides it).
        aria-label={label ? undefined : "Toggle"}
        aria-describedby={[describedBy, description ? descId : undefined].filter(Boolean).join(" ") || undefined}
        disabled={disabled}
        onClick={(e) => {
          onClick?.(e);
          if (e.defaultPrevented) return;
          if (checked === undefined) setOwn(!on);
          onCheckedChange?.(!on);
        }}
        className={`flex shrink-0 items-center rounded-full p-0.5 transition-colors duration-150 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] ${
          md ? "h-5 w-9" : "h-4 w-7"
        } ${on ? "bg-select enabled:hover:bg-[color-mix(in_oklab,var(--select)_88%,white)]" : "bg-[var(--track-strong)] enabled:hover:bg-[color-mix(in_oklab,var(--track-strong)_86%,var(--fg))]"}`}
        {...rest}
      >
        <motion.span
          aria-hidden
          className={`block rounded-full bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.14),0_2px_6px_-2px_rgb(0_0_0/0.12)] ${md ? "size-4" : "size-3"}`}
          initial={false}
          animate={{ x: on ? (md ? 16 : 12) : 0 }}
          transition={reduce ? { duration: 0 } : spring}
        />
      </button>
    </span>
  );

  if (!label && !description) return <span className={`inline-flex ${disabled ? "opacity-50" : ""} ${className}`}>{control}</span>;

  const text = (
    <span className={`flex min-w-0 flex-col gap-0.5 ${side === "left" ? (md ? "pr-2.5" : "pr-2") : md ? "pl-2.5" : "pl-2"}`}>
      {label && (
        <label htmlFor={switchId} className={`w-fit text-fg ${md ? "text-sm leading-5" : "text-[13px] leading-5"} ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
          {label}
        </label>
      )}
      {description && (
        <span id={descId} className={`max-w-[520px] text-fg-muted ${md ? "text-[13px] leading-5" : "text-xs leading-4"}`}>
          {description}
        </span>
      )}
    </span>
  );

  return (
    <div className={`items-start ${side === "left" ? "flex w-full justify-between" : "inline-flex"} ${disabled ? "opacity-50" : ""} ${className}`}>
      {side === "left" ? text : control}
      {side === "left" ? control : text}
    </div>
  );
}
