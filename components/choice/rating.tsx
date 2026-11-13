"use client";

import { useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Star } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type RatingSize = "sm" | "md" | "lg";
export type RatingVariant = "stars" | "compact";

export interface RatingProps {
  /** The rating, 0 to `max`. Read-only ratings can carry any decimal (4.6); the stars round it to the nearest half. */
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  /** Number of stars (5). */
  max?: number;
  /** 0.5 allows half stars: the left half of a star picks .5. */
  step?: 0.5 | 1;
  /** Shows the rating without letting anyone change it. */
  readOnly?: boolean;
  disabled?: boolean;
  /** Clicking the current value again clears it to 0. */
  allowClear?: boolean;
  /** Stars: a row of stars. Compact: one star with the number, for lists and tables. */
  variant?: RatingVariant;
  /** Star size: 16, 20 or 24 px. */
  size?: RatingSize;
  /** The number beside the stars (4.6). It follows the hover preview when interactive. */
  showValue?: boolean;
  /** Reviews behind the rating; shows “4.6 · 2,184 reviews”. */
  count?: number;
  /** Noun after the count (reviews). */
  countLabel?: string;
  /** A word per whole star, e.g. ["Poor", "Fair", "Good", "Great", "Excellent"]; shown beside the stars. */
  labels?: string[];
  /** Posts the value with a form. */
  name?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
}

const spring = { type: "spring", stiffness: 520, damping: 34 } as const;
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
const SIZE: Record<RatingSize, { px: number; gap: number; text: string }> = {
  sm: { px: 16, gap: 2, text: "text-[13px] leading-5" },
  md: { px: 20, gap: 4, text: "text-[14px] leading-5" },
  lg: { px: 24, gap: 4, text: "text-[16px] leading-6" },
};
const nf = new Intl.NumberFormat("en-US");
const PAD = 4; // the slider row's padding, which keeps the focus ring off the stars
const one = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const clampTo = (v: number, max: number, step: number) => Math.min(max, Math.max(0, Math.round(v / step) * step));

/** One star: an empty star with a filled copy on top, cut to `fill` (0, 0.5 or 1). */
function StarCell({ px, fill, tone, pop, reduce }: { px: number; fill: number; tone: string; pop: number; reduce: boolean }) {
  return (
    <motion.span
      aria-hidden
      className="relative block shrink-0"
      style={{ width: px, height: px }}
      // A star that just got picked pops once; `pop` changes on each pick.
      key={pop}
      initial={reduce || !pop ? false : { scale: 0.7 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 600, damping: 18 }}
    >
      <Star size={px} strokeWidth={1.5} strokeLinejoin="round" className="absolute inset-0 fill-current text-[color-mix(in_srgb,var(--fg)_13%,transparent)]" />
      <motion.span
        className="absolute inset-y-0 left-0 overflow-hidden"
        initial={false}
        animate={{ width: `${fill * 100}%` }}
        transition={reduce ? { duration: 0 } : spring}
      >
        <Star size={px} strokeWidth={1.5} strokeLinejoin="round" className="block max-w-none fill-current" style={{ color: tone }} />
      </motion.span>
    </motion.span>
  );
}

export function Rating({
  value: valueProp,
  defaultValue = 0,
  onValueChange,
  max = 5,
  step = 0.5,
  readOnly = false,
  disabled = false,
  allowClear = true,
  variant = "stars",
  size = "md",
  showValue,
  count,
  countLabel = "reviews",
  labels,
  name,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  className = "",
}: RatingProps) {
  const uid = useId();
  const reduce = useReduce();
  const [inner, setInner] = useState(defaultValue);
  const value = Math.min(max, Math.max(0, valueProp ?? inner));
  const [hover, setHover] = useState<number | null>(null);
  const [pop, setPop] = useState<{ at: number; n: number }>({ at: -1, n: 0 });
  const row = useRef<HTMLDivElement>(null);
  const s = SIZE[size];
  const interactive = !readOnly && !disabled;
  const shown = interactive && hover !== null ? hover : value;
  // Read-only decimals (4.6) draw as the nearest half star.
  const drawn = Math.round(shown * 2) / 2;
  const tone = interactive ? "var(--select)" : "var(--fg)";
  // A half star keeps the word of the whole star below it (3.5 is still "Good"), never rounds up.
  const wordFor = (v: number) => (labels && v > 0 ? labels[Math.min(labels.length, Math.max(1, Math.floor(v))) - 1] : undefined);
  const word = wordFor(shown);
  const valueText = `${one.format(value)} of ${max} stars${wordFor(value) ? `, ${wordFor(value)}` : ""}`;
  const withValue = showValue ?? (readOnly || count !== undefined);

  const commit = (next: number) => {
    const v = clampTo(next, max, step);
    const final = allowClear && v === value ? 0 : v;
    if (valueProp === undefined) setInner(final);
    onValueChange?.(final);
    setPop((p) => ({ at: Math.ceil(final) - 1, n: p.n + 1 }));
  };

  // Which value the pointer is over: the left half of a star is .5 when half steps are on.
  const fromPointer = (e: { clientX: number }) => {
    const el = row.current;
    if (!el) return 0;
    const box = el.getBoundingClientRect();
    const pitch = s.px + s.gap;
    const x = Math.min(max * pitch - s.gap - 0.01, Math.max(0, e.clientX - box.left - PAD));
    const i = Math.min(max - 1, Math.floor(x / pitch));
    const inStar = (x - i * pitch) / s.px;
    return step === 0.5 && inStar <= 0.5 ? i + 0.5 : i + 1;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const k = e.key;
    let next: number | null = null;
    if (k === "ArrowRight" || k === "ArrowUp") next = value + step;
    else if (k === "ArrowLeft" || k === "ArrowDown") next = value - step;
    else if (k === "Home") next = 0;
    else if (k === "End") next = max;
    else if (/^\d$/.test(k) && Number(k) <= max) next = Number(k);
    if (next === null) return;
    e.preventDefault();
    const v = clampTo(next, max, step);
    if (v === value) return;
    if (valueProp === undefined) setInner(v);
    onValueChange?.(v);
    if (v > value) setPop((p) => ({ at: Math.ceil(v) - 1, n: p.n + 1 }));
  };

  const meta = (
    <>
      {withValue && (
        <span className={`relative inline-grid font-medium tabular-nums ${hover !== null && interactive ? "text-fg-muted" : "text-fg"} ${s.text}`} aria-hidden>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={shown}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={reduce ? { duration: 0.1 } : spring}
            >
              {one.format(shown)}
            </motion.span>
          </AnimatePresence>
        </span>
      )}
      {word && (
        <span aria-hidden className={`whitespace-nowrap text-fg-muted ${size === "lg" ? "text-[15px] leading-6" : s.text}`}>
          {word}
        </span>
      )}
      {count !== undefined && withValue && (
        <span aria-hidden className={`-mx-0.5 text-fg-subtle ${s.text}`}>
          ·
        </span>
      )}
      {count !== undefined && (
        <span className={`whitespace-nowrap text-fg-muted ${s.text}`}>
          {nf.format(count)} {countLabel}
        </span>
      )}
    </>
  );

  if (variant === "compact") {
    return (
      <span
        role="img"
        aria-label={`${ariaLabel ? `${ariaLabel}: ` : ""}${one.format(value)} of ${max} stars${count !== undefined ? `, ${nf.format(count)} ${countLabel}` : ""}`}
        className={`inline-flex h-7 items-center gap-1 rounded-full bg-subtle pl-2 pr-2.5 ${className}`}
      >
        <Star aria-hidden size={16} strokeWidth={1.5} strokeLinejoin="round" className="shrink-0 fill-current text-fg" />
        <span aria-hidden className="text-[13px] font-medium leading-5 tabular-nums text-fg">
          {one.format(value)}
        </span>
        {count !== undefined && (
          <span aria-hidden className="text-[13px] leading-5 tabular-nums text-fg-muted">
            ({nf.format(count)})
          </span>
        )}
      </span>
    );
  }

  const stars = Array.from({ length: max }, (_, i) => (
    <StarCell key={i} px={s.px} fill={Math.min(1, Math.max(0, drawn - i))} tone={tone} pop={i <= pop.at ? pop.n : 0} reduce={reduce} />
  ));

  if (readOnly) {
    return (
      <div className={`inline-flex items-center gap-1.5 ${className}`}>
        <div role="img" aria-label={`${ariaLabel ? `${ariaLabel}: ` : ""}${one.format(value)} of ${max} stars`} className="flex items-center" style={{ gap: s.gap }}>
          {stars}
        </div>
        {meta}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 ${disabled ? "opacity-50" : ""} ${className}`}>
      <div
        ref={row}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabelledby ? undefined : (ariaLabel ?? "Rating")}
        aria-labelledby={ariaLabelledby}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        aria-describedby={count !== undefined ? `${uid}-count` : undefined}
        onKeyDown={onKeyDown}
        onPointerMove={(e) => interactive && e.pointerType === "mouse" && setHover(fromPointer(e))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => interactive && commit(fromPointer(e))}
        className={`-m-1 flex items-center rounded-[8px] p-1 ${interactive ? "cursor-pointer" : "cursor-not-allowed"} ${focusRing}`}
        style={{ gap: s.gap }}
      >
        {stars}
      </div>
      <span id={`${uid}-count`} className="contents">
        {meta}
      </span>
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  );
}
