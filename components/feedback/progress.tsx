"use client";

import { useEffect, useId, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type ProgressType = "bar" | "segments" | "circle";
export type ProgressTone = "default" | "accent" | "success" | "danger";
export type ProgressSize = "sm" | "md" | "lg";

export interface ProgressProps extends Omit<ComponentProps<"div">, "children"> {
  /** From 0 to max. Changes animate. */
  value?: number;
  max?: number;
  /** Bar for lists and cards, Segments for a known number of steps, Circle for compact summaries. */
  type?: ProgressType;
  /** Default is monochrome. Accent for a highlighted task, Success when done, Danger when it failed. */
  tone?: ProgressTone;
  size?: ProgressSize;
  /** Unknown length: the fill loops until you pass a value. */
  indeterminate?: boolean;
  /** What is running, e.g. "Importing transactions". Also names the progressbar for screen readers. */
  label?: ReactNode;
  /** Show the percent (default true). */
  showValue?: boolean;
  /** Replaces the percent, e.g. "3 of 5 steps". Screen readers read it too. */
  valueText?: string;
  /** Number of segments for type="segments" (default 5). */
  segments?: number;
}

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;
// Fills are full width and revealed with a rounded clip, so they animate without re-laying out the bar.
const reveal = (share: number) => `inset(0 ${100 - share * 100}% 0 0 round 9999px)`;

const TONES: Record<ProgressTone, string> = {
  default: "var(--fg)",
  accent: "var(--select)",
  success: "var(--success)",
  danger: "var(--danger)",
};

const LINE: Record<ProgressSize, { track: string; gap: string; label: string; value: string }> = {
  sm: { track: "h-1", gap: "gap-1.5", label: "text-[12px] leading-4", value: "text-[12px]" },
  md: { track: "h-1.5", gap: "gap-2", label: "text-[13px] leading-5", value: "text-[12px]" },
  lg: { track: "h-2", gap: "gap-2.5", label: "text-[14px] leading-5", value: "text-[13px]" },
};

const RING: Record<ProgressSize, { px: number; stroke: number; value: string; label: string }> = {
  sm: { px: 48, stroke: 5, value: "text-[12px]", label: "text-[12px]" },
  md: { px: 64, stroke: 6, value: "text-[14px]", label: "text-[13px]" },
  lg: { px: 80, stroke: 7, value: "text-[16px]", label: "text-[14px]" },
};

/** The percent counts with the fill instead of jumping. */
function Percent({ value, reduce }: { value: number; reduce: boolean }) {
  const mv = useSpring(reduce ? value : 0, { stiffness: 420, damping: 34 });
  useEffect(() => {
    if (reduce) mv.jump(value);
    else mv.set(value);
  }, [mv, value, reduce]);
  // The spring overshoots a little; the label never reads past 0–100.
  const text = useTransform(mv, (v) => `${Math.min(100, Math.max(0, Math.round(v)))}%`);
  return <motion.span>{text}</motion.span>;
}

export function Progress({
  value = 0,
  max = 100,
  type = "bar",
  tone = "default",
  size = "md",
  indeterminate = false,
  label,
  showValue = true,
  valueText,
  segments = 5,
  className = "",
  ...rest
}: ProgressProps) {
  const reduce = Boolean(useReduce());
  const labelId = useId();
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const color = TONES[tone];
  const valueNode = showValue && !indeterminate ? valueText ?? <Percent value={pct} reduce={reduce} /> : null;
  const enter = reduce ? false : undefined;

  const aria = {
    role: "progressbar",
    "aria-valuemin": 0,
    "aria-valuemax": max,
    "aria-valuenow": indeterminate ? undefined : value,
    "aria-valuetext": indeterminate ? undefined : valueText,
    "aria-labelledby": label ? labelId : undefined,
    // A fallback name without a label; an aria-label or aria-labelledby passed in overrides it.
    "aria-label": label ? undefined : "Progress",
    "aria-busy": indeterminate || undefined,
  } as const;

  if (type === "circle") {
    const r = RING[size];
    const radius = (r.px - r.stroke) / 2;
    const c = r.px / 2;
    return (
      <div {...aria} {...rest} className={`inline-flex items-center gap-3 ${className}`}>
        <div className="relative shrink-0" style={{ width: r.px, height: r.px }}>
          <svg width={r.px} height={r.px} viewBox={`0 0 ${r.px} ${r.px}`} fill="none" aria-hidden className="absolute inset-0 -rotate-90">
            <circle cx={c} cy={c} r={radius} stroke="var(--track)" strokeWidth={r.stroke} />
            {/* Mounted only above 0, so the round cap never shows as a dot on an empty ring. */}
            {!indeterminate && pct > 0 && (
              <motion.circle
                cx={c}
                cy={c}
                r={radius}
                stroke={color}
                strokeWidth={r.stroke}
                strokeLinecap="round"
                initial={enter ?? { pathLength: 0 }}
                animate={{ pathLength: pct / 100 }}
                transition={reduce ? { duration: 0 } : spring}
              />
            )}
          </svg>
          {indeterminate && (
            <motion.svg
              width={r.px}
              height={r.px}
              viewBox={`0 0 ${r.px} ${r.px}`}
              fill="none"
              aria-hidden
              className="absolute inset-0"
              animate={reduce ? { opacity: [0.4, 1, 0.4] } : { rotate: 360 }}
              transition={reduce ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 1, repeat: Infinity, ease: "linear" }}
            >
              <circle cx={c} cy={c} r={radius} stroke={color} strokeWidth={r.stroke} strokeLinecap="round" pathLength={100} strokeDasharray="25 100" />
            </motion.svg>
          )}
          {valueNode && (
            <span className={`absolute inset-0 grid place-items-center font-medium tabular-nums text-fg ${r.value}`}>{valueNode}</span>
          )}
        </div>
        {label && (
          <span id={labelId} className={`font-medium leading-5 tracking-[-0.003em] text-fg ${r.label}`}>
            {label}
          </span>
        )}
      </div>
    );
  }

  const l = LINE[size];
  return (
    <div {...aria} {...rest} className={`flex w-full flex-col ${l.gap} ${className}`}>
      {(label || valueNode) && (
        <div className="flex items-baseline justify-between gap-3">
          {label && (
            <span id={labelId} className={`min-w-0 truncate font-medium tracking-[-0.003em] text-fg ${l.label}`}>
              {label}
            </span>
          )}
          {valueNode && <span className={`ml-auto shrink-0 tabular-nums text-fg-muted ${l.value}`}>{valueNode}</span>}
        </div>
      )}

      {type === "segments" ? (
        <div className={`flex w-full gap-1 ${l.track}`}>
          {Array.from({ length: segments }, (_, i) => {
            const fill = Math.min(1, Math.max(0, (pct / 100) * segments - i));
            return (
              <div key={i} className="relative h-full min-w-0 flex-1 overflow-hidden rounded-full bg-track">
                {indeterminate ? (
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{ background: color }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.14 }}
                  />
                ) : (
                  <motion.div
                    className="absolute inset-0"
                    style={{ background: color }}
                    initial={enter ?? { clipPath: reveal(0) }}
                    animate={{ clipPath: reveal(fill) }}
                    transition={reduce ? { duration: 0 } : { ...spring, delay: i * 0.04 }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className={`relative w-full overflow-hidden rounded-full bg-track ${l.track}`}>
          {indeterminate ? (
            <motion.div
              className={`absolute inset-y-0 w-2/5 rounded-full ${reduce ? "left-[30%]" : "left-0"}`}
              style={{ background: color }}
              animate={reduce ? { opacity: [0.35, 1, 0.35] } : { x: ["-100%", "250%"] }}
              transition={{ duration: reduce ? 1.6 : 1.3, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : (
            <motion.div
              className="absolute inset-0"
              style={{ background: color }}
              initial={enter ?? { clipPath: reveal(0) }}
              animate={{ clipPath: reveal(pct / 100) }}
              transition={reduce ? { duration: 0 } : spring}
            />
          )}
        </div>
      )}
    </div>
  );
}
