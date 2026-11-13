"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { Minus, Plus } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type NumberInputSize = "sm" | "md";
/** split: − value +, with the value centred. end: the value on the left and both steppers on the right. */
export type NumberInputVariant = "split" | "end";

export interface NumberInputProps {
  value?: number;
  defaultValue?: number;
  /** Called with the clamped, rounded number: on each step, and when typing is committed (Enter or blur). */
  onValueChange?: (value: number) => void;
  min?: number;
  max?: number;
  /** One press of a stepper or an arrow key. Shift, Page Up and Page Down move ten steps. */
  step?: number;
  /** Text after the number, e.g. "seats", "%" or "kg". */
  unit?: ReactNode;
  /** Text before the number, e.g. "$". */
  prefix?: ReactNode;
  /** How the number reads when not being typed. Defaults to en-US grouping (1,250) with the step's decimals. */
  formatOptions?: Intl.NumberFormatOptions;
  locale?: string;
  variant?: NumberInputVariant;
  size?: NumberInputSize;
  label?: ReactNode;
  /** Helper text under the field. An error takes its place. */
  hint?: ReactNode;
  /** Error text under the field; turns the edge red. */
  error?: ReactNode;
  disabled?: boolean;
  /** Adds a hidden input so the number posts with a form. */
  name?: string;
  id?: string;
  /** Names the field when there is no label. */
  "aria-label"?: string;
  className?: string;
}

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;
const ring = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

const SIZES: Record<NumberInputSize, { box: string; btn: string; icon: number; text: string; pad: string }> = {
  sm: { box: "h-8 p-1 rounded-[12px]", btn: "size-6", icon: 16, text: "text-[13px] leading-5", pad: "px-2" },
  md: { box: "h-10 p-1 rounded-[14px]", btn: "size-8", icon: 20, text: "text-[15px] leading-[22px]", pad: "px-2.5" },
};

// A one-character prefix or a %, ° unit sits tight against the number ($1,250, 80%); words get a space.
const symbol = (n: ReactNode) => typeof n === "string" && (n.length === 1 || /^[%°]/.test(n));

const decimalsOf = (n: number) => {
  const s = String(n);
  if (s.includes("e-")) return Number(s.split("e-")[1]);
  return s.includes(".") ? s.split(".")[1].length : 0;
};

/** A number whose changed characters roll up when it grows and down when it shrinks. */
function Rolling({ text, dir, reduce }: { text: string; dir: number; reduce: boolean }) {
  // keyed from the right so the ones digit stays put while the number grows a digit
  const chars = text.split("").map((c, i) => ({ c, key: text.length - i }));
  return (
    // The mask fades the line box's top and bottom edge, so a digit rolling out never peeks above or below the text.
    <span aria-hidden className="inline-flex overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,#000_18%,#000_82%,transparent)]">
      {chars.map(({ c, key }) => (
        <span key={key} className="relative inline-flex justify-center">
          <AnimatePresence initial={false} mode="popLayout" custom={dir}>
            <motion.span
              key={c}
              custom={dir}
              variants={{
                enter: (d: number) => (reduce ? { opacity: 0 } : { y: d > 0 ? "70%" : "-70%", opacity: 0 }),
                center: { y: 0, opacity: 1 },
                exit: (d: number) => (reduce ? { opacity: 0 } : { y: d > 0 ? "-70%" : "70%", opacity: 0, transition: { ...spring, opacity: { duration: 0.12 } } }),
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
  );
}

export function NumberInput({
  value,
  defaultValue,
  onValueChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  unit,
  prefix,
  formatOptions,
  locale = "en-US",
  variant = "split",
  size = "md",
  label,
  hint,
  error,
  disabled = false,
  name,
  id,
  "aria-label": ariaLabel,
  className = "",
}: NumberInputProps) {
  const uid = useId();
  const inputId = id ?? `${uid}-input`;
  const msgId = `${uid}-message`;
  const reduce = useReduce();
  const s = SIZES[size];
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const decimals = decimalsOf(step);
  const round = (n: number) => Number(n.toFixed(Math.min(20, decimals)));

  const [own, setOwn] = useState(() => clamp(defaultValue ?? (Number.isFinite(min) ? Math.max(0, min) : 0)));
  const current = clamp(value ?? own);
  // The text being typed; null while the field shows the formatted number.
  const [draft, setDraft] = useState<string | null>(null);
  const [dir, setDir] = useState(1);
  const input = useRef<HTMLInputElement>(null);
  const nudge = useAnimationControls();

  const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: Math.max(decimals, 0), minimumFractionDigits: 0, ...formatOptions });
  const text = fmt.format(current);
  const parts = new Intl.NumberFormat(locale).formatToParts(11111.1);
  const group = parts.find((p) => p.type === "group")?.value ?? ",";
  const point = parts.find((p) => p.type === "decimal")?.value ?? ".";

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

  /** A small sideways nudge when a value hits the limit. */
  const bump = () => {
    if (!reduce) nudge.start({ x: [0, -3, 3, -1.5, 0], transition: { duration: 0.32 } });
  };

  const set = (n: number) => {
    const next = round(clamp(n));
    if (next !== n && next === latest.current) bump();
    if (next === latest.current) return false;
    setDir(next > latest.current ? 1 : -1);
    latest.current = next;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    return true;
  };

  const parse = (t: string) => {
    const clean = t.split(group).join("").replace(point, ".").replace(/[^\d.-]/g, "");
    if (!clean || clean === "-" || clean === ".") return null;
    const n = Number(clean);
    return Number.isFinite(n) ? n : null;
  };

  /** Typed text becomes the value (clamped and rounded); empty or junk puts the old value back. */
  const commit = () => {
    if (draft === null) return latest.current;
    const n = parse(draft);
    setDraft(null);
    if (n === null) return latest.current;
    set(n);
    if (round(clamp(n)) !== n) bump();
    return latest.current;
  };

  const stepBy = (count: number) => {
    const base = commit();
    return set(base + count * step);
  };

  /** One step now, then repeat while the pointer stays down. */
  const press = (d: 1 | -1, shift: boolean) => {
    if (disabled) return;
    const count = d * (shift ? 10 : 1);
    stepBy(count);
    stopHold();
    hold.current.t = setTimeout(() => {
      hold.current.i = setInterval(() => {
        if (!set(latest.current + count * step)) stopHold();
      }, 70);
    }, 420);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const k = e.key;
    const big = e.shiftKey ? 10 : 1;
    if (k === "ArrowUp" || k === "ArrowDown") {
      e.preventDefault();
      stepBy((k === "ArrowUp" ? 1 : -1) * big);
    } else if (k === "PageUp" || k === "PageDown") {
      e.preventDefault();
      stepBy(k === "PageUp" ? 10 : -10);
    } else if ((k === "Home" && Number.isFinite(min)) || (k === "End" && Number.isFinite(max))) {
      e.preventDefault();
      setDraft(null);
      set(k === "Home" ? min : max);
    } else if (k === "Enter") {
      commit();
    } else if (k === "Escape" && draft !== null) {
      e.preventDefault();
      setDraft(null);
    }
  };

  const invalid = Boolean(error);
  const message = error || hint;
  const atMin = current <= min;
  const atMax = current >= max;
  const shown = draft ?? text;
  const tap = reduce || disabled ? undefined : { scale: 0.9 };
  const btn = `grid ${s.btn} shrink-0 place-items-center rounded-full bg-surface text-fg shadow-[var(--shadow-btn-secondary)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40 ${ring}`;
  const edge = invalid ? "shadow-[0_0_0_1px_var(--danger)]" : "shadow-[var(--shadow-control)]";
  const focus = `has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-offset-2 has-[input:focus-visible]:ring-offset-[var(--bg)] ${
    invalid ? "has-[input:focus-visible]:ring-[var(--danger)]" : "has-[input:focus-visible]:ring-[var(--select)]"
  }`;

  const stepper = (d: 1 | -1) => (
    <motion.button
      type="button"
      tabIndex={-1}
      aria-label={d > 0 ? "Increase" : "Decrease"}
      disabled={disabled || (d > 0 ? atMax : atMin)}
      whileTap={tap}
      // keeps focus (and the caret) in the field
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (e.button === 0) press(d, e.shiftKey);
      }}
      onClick={(e) => {
        // pointer presses were handled on pointer down; this is a keyboard or assistive click
        if (e.detail === 0) stepBy(d);
      }}
      className={btn}
    >
      {d > 0 ? <Plus size={s.icon} strokeWidth={1.5} /> : <Minus size={s.icon} strokeWidth={1.5} />}
    </motion.button>
  );

  // The visible number sits in a span that sizes the box; the real input lies on top with clear text,
  // so the caret and selection line up while the digits can roll.
  const field = (
    <motion.span animate={nudge} className={`flex min-w-0 items-center ${variant === "split" ? "flex-1 justify-center" : "flex-1"} ${s.pad}`}>
      {prefix && <span className={`pointer-events-none shrink-0 text-fg-muted ${symbol(prefix) ? "mr-px" : "mr-1"} ${s.text}`}>{prefix}</span>}
      <span className={`relative inline-grid min-w-[1ch] max-w-full font-medium tabular-nums text-fg ${s.text}`}>
        <span aria-hidden className="truncate whitespace-pre">
          {draft === null ? <Rolling text={text} dir={dir} reduce={reduce} /> : shown || " "}
        </span>
        <input
          ref={input}
          id={inputId}
          type="text"
          inputMode={decimals > 0 || min < 0 ? "decimal" : "numeric"}
          autoComplete="off"
          spellCheck={false}
          role="spinbutton"
          aria-valuenow={current}
          aria-valuemin={Number.isFinite(min) ? min : undefined}
          aria-valuemax={Number.isFinite(max) ? max : undefined}
          aria-valuetext={typeof unit === "string" ? `${text} ${unit}` : text}
          aria-label={label ? undefined : ariaLabel}
          aria-invalid={invalid || undefined}
          aria-describedby={message ? msgId : undefined}
          disabled={disabled}
          value={shown}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          onFocus={(e) => e.target.select()}
          className={`absolute inset-y-0 left-0 w-[calc(100%+2px)] bg-transparent p-0 text-transparent caret-[var(--fg)] outline-none selection:bg-[var(--select-soft)] disabled:cursor-not-allowed ${
            variant === "split" ? "text-center" : ""
          }`}
        />
      </span>
      {unit && <span className={`pointer-events-none shrink-0 truncate text-fg-muted ${symbol(unit) ? "ml-px" : "ml-1"} ${s.text}`}>{unit}</span>}
    </motion.span>
  );

  return (
    <div className={`flex w-full flex-col ${className}`}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 w-fit text-sm font-medium leading-5 text-fg">
          {label}
        </label>
      )}
      <div
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        onMouseDown={(e) => {
          // a press on the padding focuses the number
          if (disabled || e.target === input.current) return;
          if (!(e.target as HTMLElement).closest("button")) {
            e.preventDefault();
            input.current?.focus();
          }
        }}
        className={`flex w-full items-center gap-1 bg-surface transition-[background-color,box-shadow] duration-150 ${s.box} ${edge} ${focus} ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-text hover:not-focus-within:bg-subtle"
        }`}
      >
        {variant === "split" ? (
          <>
            {stepper(-1)}
            {field}
            {stepper(1)}
          </>
        ) : (
          <>
            {field}
            {stepper(-1)}
            {stepper(1)}
          </>
        )}
      </div>
      {name && <input type="hidden" name={name} value={current} />}
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
            <p id={msgId} className={`pt-1.5 text-[13px] leading-5 ${invalid ? "text-danger-text" : "text-fg-muted"}`}>
              {message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
