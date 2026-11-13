"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Minus, Plus, Trash2 } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type QuantityStepperSize = "sm" | "md";

export interface QuantityStepperProps {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: QuantityStepperSize;
  /** At the minimum, the minus button turns into a remove button that calls this (a cart line). */
  onRemove?: () => void;
  disabled?: boolean;
  /** Names the value for screen readers, e.g. "Quantity, Linen throw". */
  "aria-label"?: string;
  className?: string;
}

export interface RollingNumberProps {
  value: number;
  /** Turns the number into text; defaults to a plain integer. Every character rolls on its own. */
  format?: (value: number) => string;
  className?: string;
}

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;
const ring = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

/** A number whose changed characters roll up when it grows and down when it shrinks. */
export function RollingNumber({ value, format = (n) => String(n), className = "" }: RollingNumberProps) {
  const reduce = !!useReduce();
  const [prev, setPrev] = useState(value);
  const [dir, setDir] = useState(1);
  if (value !== prev) {
    setDir(value > prev ? 1 : -1);
    setPrev(value);
  }
  const text = format(value);
  // keyed from the right so units stay put while the number grows a digit
  const chars = text.split("").map((c, i) => ({ c, key: text.length - i }));
  return (
    <span className={`relative inline-flex tabular-nums ${className}`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex overflow-hidden">
        {chars.map(({ c, key }) => (
          <span key={key} className="relative inline-flex justify-center">
            <AnimatePresence initial={false} mode="popLayout" custom={dir}>
              <motion.span
                key={c}
                custom={dir}
                variants={{
                  enter: (d: number) => (reduce ? { opacity: 0 } : { y: d > 0 ? "70%" : "-70%", opacity: 0 }),
                  center: { y: 0, opacity: 1 },
                  exit: (d: number) => (reduce ? { opacity: 0 } : { y: d > 0 ? "-70%" : "70%", opacity: 0 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={reduce ? { duration: 0.12 } : spring}
                className="inline-block whitespace-pre"
              >
                {c}
              </motion.span>
            </AnimatePresence>
          </span>
        ))}
      </span>
    </span>
  );
}

const SIZES: Record<QuantityStepperSize, { box: string; btn: string; icon: number; num: string }> = {
  sm: { box: "h-8 gap-0.5 p-0.5", btn: "size-7", icon: 16, num: "min-w-7 text-[13px] leading-5" },
  md: { box: "h-10 gap-1 p-1", btn: "size-8", icon: 20, num: "min-w-8 text-[15px] leading-[22px]" },
};

export function QuantityStepper({
  value,
  defaultValue = 1,
  onValueChange,
  min = 0,
  max = 99,
  step = 1,
  size = "md",
  onRemove,
  disabled = false,
  "aria-label": ariaLabel = "Quantity",
  className = "",
}: QuantityStepperProps) {
  const reduce = !!useReduce();
  const [own, setOwn] = useState(defaultValue);
  const current = Math.min(max, Math.max(min, value ?? own));
  const s = SIZES[size];
  const removable = Boolean(onRemove) && current <= min;

  // The latest value for the press-and-hold repeat, which runs outside React renders.
  const latest = useRef(current);
  useEffect(() => {
    latest.current = current;
  });
  const hold = useRef<{ t?: ReturnType<typeof setTimeout>; i?: ReturnType<typeof setInterval> }>({});
  const stopHold = () => {
    clearTimeout(hold.current.t);
    clearInterval(hold.current.i);
    hold.current = {};
  };
  useEffect(() => stopHold, []);
  // Whether the minus button was already Remove when the pointer went down.
  const downRemovable = useRef(false);

  const set = (n: number) => {
    const next = Math.min(max, Math.max(min, n));
    if (next === latest.current) return false;
    latest.current = next;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    return true;
  };

  /** One step now, then repeat while the pointer stays down. */
  const press = (d: 1 | -1) => {
    if (disabled) return;
    if (d < 0 && removable) return;
    set(latest.current + d * step);
    stopHold();
    hold.current.t = setTimeout(() => {
      hold.current.i = setInterval(() => {
        if (!set(latest.current + d * step)) stopHold();
      }, 70);
    }, 420);
  };

  // Typing digits on the focused value replaces it (a short buffer joins keys typed together).
  const typed = useRef({ text: "", at: 0 });
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    const k = e.key;
    const map: Record<string, number> = {
      ArrowUp: current + step,
      ArrowRight: current + step,
      ArrowDown: current - step,
      ArrowLeft: current - step,
      PageUp: current + step * 10,
      PageDown: current - step * 10,
      Home: min,
      End: max,
    };
    if (k in map) {
      e.preventDefault();
      set(map[k]);
    } else if (/^\d$/.test(k)) {
      e.preventDefault();
      const now = Date.now();
      const text = now - typed.current.at < 700 ? typed.current.text + k : k;
      typed.current = { text, at: now };
      set(Number(text));
    } else if ((k === "Delete" || k === "Backspace") && onRemove && current <= min) {
      e.preventDefault();
      onRemove();
    }
  };

  const tap = reduce || disabled ? undefined : { scale: 0.92 };
  const btn = `grid ${s.btn} shrink-0 place-items-center rounded-full bg-surface text-fg shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_rgb(0_0_0/0.06),0_2px_4px_rgb(0_0_0/0.04)] transition-opacity dark:shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_1px_2px_rgb(0_0_0/0.4)] disabled:cursor-not-allowed disabled:opacity-40 ${ring}`;
  const swap = reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, rotate: -30 };
  const minusIcon: ReactNode = removable ? <Trash2 size={s.icon - 2} strokeWidth={1.5} /> : <Minus size={s.icon} strokeWidth={1.5} />;

  return (
    <div
      className={`inline-flex shrink-0 items-center rounded-full bg-muted ${s.box} ${disabled ? "opacity-50" : ""} ${className}`}
      onPointerUp={stopHold}
      onPointerLeave={stopHold}
      onPointerCancel={stopHold}
    >
      <motion.button
        type="button"
        tabIndex={-1}
        // Remove names what goes: "Quantity, Linen throw" reads "Remove Linen throw"; the bare default reads "Remove item".
        aria-label={removable ? `Remove ${ariaLabel.replace(/^quantity\b,?\s*/i, "") || "item"}` : "Decrease"}
        disabled={disabled || (!removable && current <= min)}
        whileTap={tap}
        onPointerDown={(e) => {
          downRemovable.current = removable;
          if (e.button === 0) press(-1);
        }}
        onClick={(e) => {
          // pointer presses were handled on pointer down; this is a keyboard or assistive click.
          // A press that only stepped down to the minimum must not also remove the line on release.
          if (removable) {
            if (e.detail === 0 || downRemovable.current) onRemove?.();
            return;
          }
          if (e.detail === 0) set(latest.current - step);
        }}
        className={btn}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span key={removable ? "remove" : "minus"} initial={swap} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={swap} transition={spring} className="flex">
            {minusIcon}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      <span
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-valuenow={current}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-disabled={disabled || undefined}
        onKeyDown={disabled ? undefined : onKeyDown}
        className={`grid h-full place-items-center rounded-full px-1 text-center font-medium text-fg ${s.num} ${ring}`}
      >
        <RollingNumber value={current} />
      </span>

      <motion.button
        type="button"
        tabIndex={-1}
        aria-label="Increase"
        disabled={disabled || current >= max}
        whileTap={tap}
        onPointerDown={(e) => {
          if (e.button === 0) press(1);
        }}
        onClick={(e) => {
          if (e.detail === 0) set(latest.current + step);
        }}
        className={btn}
      >
        <Plus size={s.icon} strokeWidth={1.5} />
      </motion.button>
    </div>
  );
}
