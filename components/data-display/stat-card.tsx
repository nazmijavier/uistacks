"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { AnimatePresence, animate, motion, useInView, useReducedMotion } from "motion/react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type StatCardDirection = "up" | "down";

export interface StatCardProps {
  label: string;
  /** The headline number. It counts up the first time the card scrolls into view. */
  value: number;
  /** Formats the value and the scrubber readout, e.g. as currency. */
  format?: (value: number) => string;
  /** Change against the previous period, e.g. 12.4 or -0.4. Its sign picks the arrow. */
  delta?: number;
  /** Replaces the default delta text ("12.4%"), e.g. "0.4 pts". */
  deltaLabel?: string;
  /** Which way is good news: "up" for revenue, "down" for churn. Sets green or red. */
  goodDirection?: StatCardDirection;
  /** Muted text after the delta, e.g. "vs October". */
  comparison?: string;
  /** This period, one value per point (the solid line). */
  data?: number[];
  /** The previous period at the same spacing (the lighter grey line). Leave it out to hide the comparison. */
  previous?: number[];
  /** One label per point for the scrubber readout, e.g. "Nov 3". */
  labels?: string[];
  className?: string;
}

const ease = [0.22, 1, 0.36, 1] as const;
const spring = { type: "spring", stiffness: 520, damping: 34 } as const;
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
const HEIGHT = 56;
/** The previous period's grey line (and its key): about 2.5:1 against the card in Light and Dark. */
const PREV_OPACITY = 0.6;
// Room for the 4 px end dot and its 2 px ring, so nothing is clipped at the edges.
const PAD = { top: 7, right: 7, bottom: 7, left: 2 };

type Point = [number, number];
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Straight segments, so every move in the data shows. */
const straight = (points: Point[]) => points.map(([x, y], i) => `${i ? "L" : "M"}${r2(x)},${r2(y)}`).join("");
const ink = "var(--series-1)";

/** Width of an element that may mount later (the plot only shows with data), via a callback ref. */
function useWidth(fallback: number) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [setEl, width] as const;
}

export function StatCard({
  label,
  value,
  format = (v) => Math.round(v).toLocaleString("en-US"),
  delta,
  deltaLabel,
  goodDirection = "up",
  comparison,
  data = [],
  previous,
  labels,
  className = "",
}: StatCardProps) {
  const uid = useId();
  const reduce = !!useReduce();
  const [plotRef, width] = useWidth(240);
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.4 });

  // Count up from the last shown number (0 on mount) whenever the card is in view.
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(from.current, value, {
      duration: reduce ? 0 : 1,
      ease,
      onUpdate: (v) => {
        from.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [inView, value, reduce]);

  // Scrubber: the point under the pointer or the keyboard; null when idle.
  const [active, setActive] = useState<number | null>(null);
  const n = Math.max(data.length, previous?.length ?? 0);
  const last = Math.max(data.length - 1, 0);

  // A removed comparison stays drawn while it fades out.
  const [prevShown, setPrevShown] = useState(previous);
  if (previous && previous !== prevShown) setPrevShown(previous);
  const prevDrawn = previous ?? prevShown;

  // The y-range fits both periods. When the comparison comes or goes it tweens instead of jumping: on the way out it
  // waits for the previous line to fade, on the way in the previous line fades in once the scale has made room.
  const all = [...data, ...(previous ?? [])];
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 1;
  const comparing = Boolean(previous?.length);
  const [domain, setDomain] = useState({ lo, hi });
  const domainRef = useRef(domain);
  const wasComparing = useRef(comparing);
  useEffect(() => {
    const toggled = wasComparing.current !== comparing;
    const leaving = wasComparing.current && !comparing;
    wasComparing.current = comparing;
    const from = domainRef.current;
    if (from.lo === lo && from.hi === hi) return;
    // New data snaps; only the comparison toggle moves the scale.
    const controls = animate(0, 1, {
      duration: reduce || !toggled ? 0 : 0.5,
      delay: reduce || !leaving ? 0 : 0.18,
      ease,
      onUpdate: (t) => {
        domainRef.current = { lo: from.lo + (lo - from.lo) * t, hi: from.hi + (hi - from.hi) * t };
        setDomain(domainRef.current);
      },
    });
    return () => controls.stop();
  }, [lo, hi, comparing, reduce]);

  const span = domain.hi - domain.lo || 1;
  const plotW = Math.max(width - PAD.left - PAD.right, 1);
  const x = (i: number) => PAD.left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const y = (v: number) => PAD.top + (1 - (v - domain.lo) / span) * (HEIGHT - PAD.top - PAD.bottom);
  const line = straight(data.map((v, i) => [x(i), y(v)]));
  const area = data.length > 1 ? `${line}L${r2(x(last))},${HEIGHT}L${r2(x(0))},${HEIGHT}Z` : "";
  const prevLine = prevDrawn ? straight(prevDrawn.map((v, i) => [x(i), y(v)])) : "";

  const dir = delta === undefined ? null : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const good = dir === null || dir === "flat" ? null : dir === goodDirection;
  const tone = good === null ? "text-fg-muted" : good ? "text-[var(--success-text)]" : "text-danger-text";
  const Arrow = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : ArrowRight;
  const deltaText = deltaLabel ?? (delta === undefined ? "" : `${Math.abs(delta).toFixed(1)}%`);

  const pointText = (i: number) => {
    const name = labels?.[i] ?? `Point ${i + 1}`;
    const now = i < data.length ? format(data[i]) : null;
    const before = previous && i < previous.length ? `previous period ${format(previous[i])}` : null;
    return `${name}: ${[now, before].filter(Boolean).join(", ")}`;
  };
  const summary =
    data.length > 0
      ? `${label} trend: ${format(data[0])} to ${format(data[last])}${previous?.length ? `; previous period ${format(previous[0])} to ${format(previous[previous.length - 1])}` : ""}.`
      : label;

  // Measured on the plot box: the slider overlay reaches 4 px past it on each side for its focus ring.
  const indexAt = (e: PointerEvent<HTMLDivElement>) => {
    const r = (e.currentTarget.parentElement ?? e.currentTarget).getBoundingClientRect();
    const t = (e.clientX - r.left - PAD.left) / Math.max(r.width - PAD.left - PAD.right, 1);
    return Math.min(n - 1, Math.max(0, Math.round(t * (n - 1))));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = active ?? last;
    const next = e.key === "ArrowRight" ? at + 1 : e.key === "ArrowLeft" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (next === null) {
      if (e.key === "Escape") setActive(null);
      return;
    }
    e.preventDefault();
    setActive(Math.min(n - 1, Math.max(0, next)));
  };

  const fade = reduce ? { opacity: 0 } : { opacity: 0, y: 4 };
  const at = active ?? last;

  return (
    <div ref={rootRef} className={`flex w-full min-w-0 flex-col rounded-[20px] bg-surface p-5 shadow-[var(--shadow-card)] ${className}`}>
      <p className="truncate text-[13px] leading-5 text-fg-muted">{label}</p>
      {/* While scrubbing, the big number follows the solid line. */}
      <p className="mt-1 text-[28px] font-medium leading-9 tracking-[-0.02em] text-fg tabular-nums">
        <span aria-hidden>{active !== null && active < data.length ? format(data[active]) : format(shown)}</span>
        <span className="sr-only">{format(value)}</span>
      </p>

      {/* The delta line; while scrubbing it shows the point's label and the previous period's value. */}
      <div className="relative mt-0.5 h-5 text-[13px] leading-5">
        <AnimatePresence initial={false} mode="popLayout">
          {active === null ? (
            <motion.p key="delta" initial={fade} animate={{ opacity: 1, y: 0 }} exit={fade} transition={spring} className="flex items-center gap-1.5 whitespace-nowrap">
              {dir && (
                <span className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${tone}`}>
                  <Arrow size={16} strokeWidth={1.5} aria-hidden />
                  <span className="sr-only">{dir === "up" ? "Up" : dir === "down" ? "Down" : "No change,"}</span>
                  {deltaText}
                </span>
              )}
              {comparison && <span className="truncate text-fg-muted">{comparison}</span>}
            </motion.p>
          ) : (
            <motion.p
              key="readout"
              aria-hidden
              initial={fade}
              animate={{ opacity: 1, y: 0 }}
              exit={fade}
              transition={spring}
              className="flex items-center gap-2.5 whitespace-nowrap tabular-nums"
            >
              <span className="font-medium text-fg">{labels?.[active] ?? `Point ${active + 1}`}</span>
              {previous && active < previous.length && (
                <span className="inline-flex items-center gap-1.5 text-fg-muted">
                  <svg width="12" height="2" aria-hidden className="overflow-visible">
                    <line x1="0" y1="1" x2="12" y2="1" stroke="var(--fg-subtle)" strokeOpacity={PREV_OPACITY} strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  {format(previous[active])}
                </span>
              )}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {n > 0 && (
        <div ref={plotRef} className="relative mt-4 [contain:inline-size]" style={{ height: HEIGHT }}>
          <svg role="img" aria-label={summary} width={width} height={HEIGHT} className="block overflow-visible">
            <defs>
              <linearGradient id={`${uid}-area`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={ink} stopOpacity={0.18} />
                <stop offset="100%" stopColor={ink} stopOpacity={0} />
              </linearGradient>
            </defs>
            {area && (
              <motion.path
                d={area}
                fill={`url(#${uid}-area)`}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: inView || reduce ? 1 : 0 }}
                transition={{ duration: 0.6, delay: reduce ? 0 : 0.5 }}
              />
            )}
            {/* The previous period: a lighter solid line (no dashes), under the current one. */}
            {prevLine && (
              <motion.path
                d={prevLine}
                fill="none"
                stroke="var(--fg-subtle)"
                strokeOpacity={PREV_OPACITY}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ opacity: 0 }}
                animate={{ opacity: previous && (inView || reduce) ? 1 : 0 }}
                transition={reduce ? { duration: 0 } : previous ? { duration: 0.4, delay: 0.25 } : { duration: 0.18 }}
                onAnimationComplete={() => {
                  if (!previous) setPrevShown(undefined);
                }}
              />
            )}
            {data.length > 0 && (
              <motion.path
                d={line}
                fill="none"
                stroke={ink}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduce ? false : { pathLength: 0 }}
                animate={inView || reduce ? { pathLength: 1 } : { pathLength: 0 }}
                transition={{ duration: 1, ease }}
              />
            )}
            {data.length > 0 && (
              // The end dot lands once the line has drawn in.
              <motion.circle
                cx={x(last)}
                cy={y(data[last])}
                r={3.5}
                fill="var(--surface)"
                stroke={ink}
                strokeWidth={1.5}
                initial={reduce ? false : { scale: 0 }}
                animate={inView || reduce ? { scale: 1 } : { scale: 0 }}
                transition={{ ...spring, delay: reduce ? 0 : 0.85 }}
              />
            )}
            {active !== null && (
              <g aria-hidden>
                <line x1={x(active)} x2={x(active)} y1={0} y2={HEIGHT} stroke="var(--track-strong)" strokeWidth={1} />
                {previous && active < previous.length && (
                  <circle cx={x(active)} cy={y(previous[active])} r={3.5} fill="var(--surface)" stroke="var(--fg-subtle)" strokeWidth={1.5} />
                )}
                {active < data.length && <circle cx={x(active)} cy={y(data[active])} r={4} fill={ink} stroke="var(--surface)" strokeWidth={2} />}
              </g>
            )}
          </svg>

          {/* The scrubber: pointer or arrow keys move it, Home and End jump to the ends. */}
          <div
            role="slider"
            tabIndex={0}
            aria-label={`${label}, point by point`}
            aria-valuemin={0}
            aria-valuemax={n - 1}
            aria-valuenow={at}
            aria-valuetext={pointText(at)}
            aria-describedby={`${uid}-hint`}
            onPointerMove={(e) => setActive(indexAt(e))}
            onPointerDown={(e) => setActive(indexAt(e))}
            onPointerLeave={() => setActive(null)}
            onKeyDown={onKeyDown}
            onFocus={(e) => {
              if (e.currentTarget.matches(":focus-visible")) setActive((a) => a ?? last);
            }}
            onBlur={() => setActive(null)}
            className={`absolute -inset-x-1 -inset-y-1 cursor-crosshair touch-pan-y rounded-[10px] ${focusRing}`}
          />
          <span id={`${uid}-hint`} className="sr-only">
            Use the arrow keys to read each point.
          </span>
        </div>
      )}
    </div>
  );
}
