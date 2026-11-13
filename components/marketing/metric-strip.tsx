"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export interface Metric {
  /** The number it counts up to. */
  value: number;
  label: ReactNode;
  /** Text before and after the number, e.g. "$" and "K". */
  prefix?: string;
  suffix?: string;
  /** Digits after the decimal point. Default 0. */
  decimals?: number;
  /** A small change line under the label, e.g. "+12.6% vs last month". `trend` picks the arrow and colour. */
  delta?: { text: string; trend?: "up" | "down" | "neutral" };
}

export interface MetricStripProps {
  /** 3 or 4 stats work best; 4 wrap to a 2 × 2 grid on narrow widths, 3 stack. */
  metrics: Metric[];
  /** Count-up length in ms. Default 1400. */
  duration?: number;
  /** Shows the final numbers without counting (also under reduced motion). */
  paused?: boolean;
  /** An accessible name for the list, e.g. "UI Stacks in numbers". */
  "aria-label"?: string;
  className?: string;
}

const noSubscribe = () => () => {};

/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

const fmt = (n: number, decimals = 0) => n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** The number itself: counts from 0 once `run` turns true; the screen reader always gets the final value. */
function Count({ m, run, still, duration, delay }: { m: Metric; run: boolean; still: boolean; duration: number; delay: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const final = `${m.prefix ?? ""}${fmt(m.value, m.decimals)}${m.suffix ?? ""}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const paint = (n: number) => (el.textContent = `${m.prefix ?? ""}${fmt(n, m.decimals)}${m.suffix ?? ""}`);
    if (still) return void paint(m.value);
    if (!run) return void paint(0);
    // Written straight to the DOM, so a count-up never re-renders the strip 60 times a second.
    const c = animate(0, m.value, { duration: duration / 1000, delay: delay / 1000, ease: [0.16, 1, 0.3, 1], onUpdate: paint });
    return () => c.stop();
  }, [run, still, duration, delay, m.value, m.decimals, m.prefix, m.suffix]);

  return (
    <>
      <span ref={ref} aria-hidden className="tabular-nums">
        {final}
      </span>
      <span className="sr-only">{final}</span>
    </>
  );
}

/**
 * A row of big stats with a label and an optional change line each. The numbers count up the first time the strip
 * scrolls into view, in tabular figures so nothing jitters; hairlines divide the stats in every layout.
 */
export function MetricStrip({ metrics, duration = 1400, paused = false, className = "", ...aria }: MetricStripProps) {
  const reduce = useReduce();
  const root = useRef<HTMLDListElement>(null);
  const inView = useInView(root, { once: true, amount: 0.4 });
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const still = paused || reduce || !mounted;
  const n = metrics.length;
  const cols = n >= 4 ? "grid-cols-1 @[18rem]:grid-cols-2 @3xl:grid-cols-4" : n === 3 ? "grid-cols-1 @xl:grid-cols-3" : n === 2 ? "grid-cols-1 @[18rem]:grid-cols-2" : "grid-cols-1";
  // Hairlines per layout: stacked rows get a top line, side-by-side cells a left line (1 × 4, 2 × 2 or stacked).
  const line = (i: number) => {
    if (i === 0) return "";
    if (n >= 4) return i === 1 ? "border-t @[18rem]:border-t-0 @[18rem]:border-l" : i === 3 ? "border-t @[18rem]:border-l @3xl:border-t-0" : "border-t @3xl:border-t-0 @3xl:border-l";
    if (n === 3) return "border-t @xl:border-t-0 @xl:border-l";
    return "border-t @[18rem]:border-t-0 @[18rem]:border-l";
  };

  return (
    <div className={`@container w-full rounded-[20px] shadow-[var(--shadow-card)] ${className}`}>
      <dl ref={root} {...aria} className={`grid overflow-hidden rounded-[20px] bg-surface ${cols}`}>
        {metrics.map((m, i) => (
          <div key={i} className={`flex flex-col border-[color-mix(in_srgb,var(--fg)_9%,transparent)] px-5 py-5 @3xl:px-6 @3xl:py-6 ${line(i)}`}>
            <dt className="order-2 mt-1 text-[14px] leading-5 text-fg-muted">{m.label}</dt>
            <dd className="order-1 text-[32px] font-medium leading-10 tracking-[-0.03em] text-fg @3xl:text-[36px] @3xl:leading-[44px]">
              <Count m={m} run={inView} still={still} duration={duration} delay={i * 90} />
            </dd>
            {m.delta && (
              <dd
                className={`order-3 mt-2 inline-flex items-center gap-1 text-[13px] leading-5 tabular-nums ${
                  m.delta.trend === "up" ? "text-success-text" : m.delta.trend === "down" ? "text-danger-text" : "text-fg-muted"
                }`}
              >
                {m.delta.trend === "up" && <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden className="shrink-0" />}
                {m.delta.trend === "down" && <ArrowDownRight size={14} strokeWidth={1.5} aria-hidden className="shrink-0" />}
                {m.delta.text}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}
