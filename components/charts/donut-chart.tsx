"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { animate, motion, useInView, useReducedMotion } from "motion/react";

export interface DonutSlice {
  /** Legend and centre name, e.g. "Online store". */
  label: string;
  value: number;
}

export interface DonutChartProps {
  /** Three to six slices, in the order they run clockwise from the top. */
  slices: DonutSlice[];
  /** Card title, e.g. "Revenue by channel". */
  title?: string;
  /** Under the title, e.g. "Stacks Shop · October". */
  description?: string;
  /** Under the total in the centre while nothing is picked (default "Total"). */
  totalLabel?: string;
  /** Formats the values (default 1,284). */
  format?: (value: number) => string;
  /** The slice shown with the accent and in the centre (index). Hovering a slice or its legend row sets it too; clicking pins it until it is clicked again or Esc. */
  active?: number | null;
  defaultActive?: number | null;
  onActiveChange?: (index: number | null) => void;
  /** Ring box in px (default 168) and ring width (default 20). */
  size?: number;
  thickness?: number;
  className?: string;
}

const ease = [0.22, 1, 0.36, 1] as const;
const ring = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
const ink = "var(--series-1)";
/** Mono steps per slice; the picked slice (the first one by default) takes the accent instead. */
const MONO = [44, 32, 23, 16, 11, 7].map((p) => `color-mix(in srgb, var(--fg) ${p}%, var(--surface))`);
/** Space between slices in px, along the ring. */
const GAP = 3;
/** How much a picked slice thickens. */
const GROW = 4;
const r2 = (v: number) => Math.round(v * 1000) / 1000;
const pct = (v: number) => `${v >= 10 || v === 0 ? Math.round(v) : v.toFixed(1)}%`;

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

/** Counts from the last shown number to the new one once `run` is true. */
function Rolling({ value, run, format, reduce }: { value: number; run: boolean; format: (v: number) => string; reduce: boolean }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!run) return;
    const controls = animate(from.current, value, {
      duration: reduce ? 0 : 0.6,
      ease,
      onUpdate: (v) => {
        from.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [value, run, reduce]);
  return <>{format(shown)}</>;
}

export function DonutChart({
  slices,
  title,
  description,
  totalLabel = "Total",
  format = (v) => Math.round(v).toLocaleString("en-US"),
  active: activeProp,
  defaultActive = null,
  onActiveChange,
  size = 168,
  thickness = 20,
  className = "",
}: DonutChartProps) {
  const reduce = useReduce();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const run = inView || reduce;
  const [own, setOwn] = useState<number | null>(defaultActive);
  const raw = activeProp === undefined ? own : activeProp;
  const n = slices.length;
  const active = raw !== null && raw >= 0 && raw < n ? raw : null;
  const setActive = (i: number | null) => {
    if (activeProp === undefined) setOwn(i);
    onActiveChange?.(i);
  };
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  // A click pins a slice: it stays picked after the pointer or focus leaves, until it is clicked again or Esc.
  const [ownPin, setPin] = useState<number | null>(null);
  const pinned = ownPin !== null && ownPin < n ? ownPin : null;
  const pin = (i: number) => {
    setPin(pinned === i ? null : i);
    setActive(i);
  };

  // One eased sweep from 12 o'clock round the ring; every slice draws its own part of it.
  const [swept, setSwept] = useState(0);
  useEffect(() => {
    if (!run || reduce) return;
    const controls = animate(0, 1, { duration: 1.1, ease, delay: 0.08, onUpdate: setSwept });
    return () => controls.stop();
  }, [run, reduce]);
  const sweep = reduce ? 1 : swept;

  const total = slices.reduce((a, s) => a + Math.max(0, s.value), 0);
  const share = (v: number) => (total > 0 ? (Math.max(0, v) / total) * 100 : 0);
  const c = size / 2;
  const r = c - thickness / 2 - GROW / 2;
  const gap = n > 1 ? GAP / (2 * Math.PI * r) : 0;
  const starts: number[] = [];
  slices.reduce((a, s, i) => {
    starts[i] = a;
    return a + (total > 0 ? Math.max(0, s.value) / total : 0);
  }, 0);
  const accent = active ?? 0;
  const color = (i: number) => (i === accent ? ink : MONO[Math.min(i, MONO.length - 1)]);
  const summary = `${title ?? "Donut chart"}: ${totalLabel.toLowerCase()} ${format(total)}. ${slices.map((s) => `${s.label} ${format(s.value)}, ${pct(share(s.value))}`).join("; ")}.`;

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const to = e.key === "ArrowDown" || e.key === "ArrowRight" ? i + 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (to !== null) {
      e.preventDefault();
      buttons.current[(to + n) % n]?.focus();
    } else if (e.key === "Escape") {
      setPin(null);
      setActive(null);
    }
  };

  const picked = active !== null ? slices[active] : null;

  return (
    <div ref={ref} className={`w-full min-w-0 rounded-[20px] bg-surface p-5 shadow-[var(--shadow-card)] ${className}`}>
      {(title || description) && (
        <div className="mb-4 min-w-0">
          {title && <p className="truncate text-[15px] font-medium leading-5 tracking-[-0.01em] text-fg">{title}</p>}
          {description && <p className="mt-0.5 truncate text-[13px] leading-5 text-fg-muted">{description}</p>}
        </div>
      )}
      <div className="@container">
        <div className="grid items-center gap-5 @[25rem]:grid-cols-[auto_minmax(0,1fr)]">
          <div className="relative justify-self-center" style={{ width: size, height: size }} onPointerLeave={() => setActive(pinned)}>
            <svg role="img" aria-label={summary} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
              <circle cx={c} cy={c} r={r} fill="none" stroke="color-mix(in srgb, var(--fg) 5%, transparent)" strokeWidth={thickness} />
              {slices.map((s, i) => {
                const f = total > 0 ? Math.max(0, s.value) / total : 0;
                const length = Math.min(f, Math.max(0, sweep - starts[i])) - (f > gap * 2 ? gap : 0);
                const on = active === i;
                return (
                  <g key={s.label} transform={`rotate(${r2((starts[i] + (f > gap * 2 ? gap / 2 : 0)) * 360 - 90)} ${c} ${c})`}>
                    <motion.circle
                      cx={c}
                      cy={c}
                      r={r}
                      fill="none"
                      stroke={color(i)}
                      strokeLinecap="butt"
                      style={{ transition: "stroke 160ms ease" }}
                      initial={false}
                      animate={{ pathLength: Math.max(0, length), strokeWidth: on ? thickness + GROW : thickness, opacity: length > 0 ? 1 : 0 }}
                      transition={{ pathLength: { duration: 0 }, opacity: { duration: 0 }, strokeWidth: reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 34 } }}
                      onPointerEnter={() => setActive(i)}
                      onClick={() => pin(i)}
                      className="cursor-pointer"
                    />
                  </g>
                );
              })}
            </svg>
            <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-7 text-center">
              <span className="text-[22px] font-medium leading-7 tracking-[-0.02em] text-fg tabular-nums">
                <Rolling value={picked ? picked.value : total} run={run} format={format} reduce={reduce} />
              </span>
              <span className="mt-0.5 max-w-full truncate text-[12px] leading-4 text-fg-muted">{picked ? picked.label : totalLabel}</span>
              {picked && <span className="text-[12px] leading-4 text-fg-subtle tabular-nums">{pct(share(picked.value))}</span>}
            </div>
          </div>

          <ul aria-label="Slices" className="flex min-w-0 flex-col gap-0.5" onPointerLeave={() => setActive(pinned)}>
            {slices.map((s, i) => {
              const on = active === i;
              return (
                <li key={s.label} className="min-w-0">
                  <motion.button
                    ref={(el: HTMLButtonElement | null) => {
                      buttons.current[i] = el;
                    }}
                    type="button"
                    aria-pressed={pinned === i}
                    aria-label={`${s.label}: ${format(s.value)}, ${pct(share(s.value))}`}
                    onPointerEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(pinned)}
                    onClick={() => pin(i)}
                    onKeyDown={(e) => onKeyDown(e, i)}
                    initial={false}
                    animate={{ opacity: run ? 1 : 0, x: run || reduce ? 0 : -4 }}
                    transition={reduce ? { duration: 0 } : { duration: 0.35, ease, delay: inView ? 0.25 + i * 0.06 : 0 }}
                    className={`flex h-9 w-full min-w-0 items-center gap-2.5 rounded-[10px] px-2 text-left text-[13px] leading-5 transition-colors duration-150 ${
                      pinned === i ? "bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]" : ""
                    } ${ring}`}
                  >
                    <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: color(i), transition: "background-color 160ms ease" }} />
                    <span className={`min-w-0 flex-1 truncate transition-colors duration-150 ${on ? "text-fg" : "text-fg-muted"}`}>{s.label}</span>
                    <span aria-hidden className="shrink-0 font-medium text-fg tabular-nums">
                      {format(s.value)}
                    </span>
                    <span aria-hidden className="w-11 shrink-0 text-right text-fg-subtle tabular-nums">
                      {pct(share(s.value))}
                    </span>
                  </motion.button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
