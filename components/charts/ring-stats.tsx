"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";

export interface RingStat {
  /** Legend name, e.g. "Calls". */
  label: string;
  value: number;
  /** The full ring. At or past the goal the ring closes and the row gets a check. */
  goal: number;
  /** Formats the value and the goal, e.g. (v) => `$${v}`. */
  format?: (value: number) => string;
  /** Any CSS colour or var(); by default the first ring takes the accent and the rest step down in mono. */
  color?: string;
}

export interface RingStatsProps {
  /** Two or three rings, outermost first. */
  rings: RingStat[];
  /** Card title, e.g. "Weekly goals". */
  title?: string;
  /** Under the title, e.g. "Nov 9 – 15 · Stacks CRM". */
  description?: string;
  /** The middle of the rings; by default the first ring's share of its goal. */
  center?: ReactNode;
  /** Ring box in px (default 148). */
  size?: number;
  /** Ring width in px (default 12) and the space between rings (default 4). */
  thickness?: number;
  gap?: number;
  className?: string;
}

const ease = [0.22, 1, 0.36, 1] as const;
const plain = (v: number) => Math.round(v).toLocaleString("en-US");
/** Accent first, then mono steps of the accent and the ink. */
const STEPS = ["var(--series-1)", "color-mix(in srgb, var(--series-1) 48%, var(--surface))", "color-mix(in srgb, var(--fg) 34%, var(--surface))"];

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
      duration: reduce ? 0 : 0.9,
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

export function RingStats({ rings, title, description, center, size = 148, thickness = 12, gap = 4, className = "" }: RingStatsProps) {
  const reduce = useReduce();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const run = inView || reduce;
  const [active, setActive] = useState<number | null>(null);
  const c = size / 2;
  const share = (r: RingStat) => (r.goal > 0 ? r.value / r.goal : 0);
  const first = rings[0];
  const summary = rings.map((r) => `${r.label}: ${(r.format ?? plain)(r.value)} of ${(r.format ?? plain)(r.goal)}`).join(", ");

  return (
    <div ref={ref} className={`w-full min-w-0 rounded-[20px] bg-surface p-5 shadow-[var(--shadow-card)] ${className}`}>
      {(title || description) && (
        <div className="mb-4 min-w-0">
          {title && <p className="truncate text-[15px] font-medium leading-5 tracking-[-0.01em] text-fg">{title}</p>}
          {description && <p className="mt-0.5 truncate text-[13px] leading-5 text-fg-muted">{description}</p>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg role="img" aria-label={summary} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block -rotate-90">
            {rings.map((r, i) => {
              const radius = c - thickness / 2 - i * (thickness + gap);
              if (radius <= thickness / 2) return null;
              const color = r.color ?? STEPS[Math.min(i, STEPS.length - 1)];
              const p = Math.min(1, Math.max(0, share(r)));
              return (
                <g key={r.label} onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)}>
                  <circle cx={c} cy={c} r={radius} fill="none" stroke="color-mix(in srgb, var(--fg) 7%, transparent)" strokeWidth={thickness} />
                  <motion.circle
                    cx={c}
                    cy={c}
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={thickness}
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: run ? Math.max(p, 0.001) : 0, opacity: run && p > 0 ? (active === null || active === i ? 1 : 0.32) : 0 }}
                    transition={
                      reduce
                        ? { duration: 0 }
                        : { pathLength: { duration: 1.1, ease, delay: inView ? 0.08 + i * 0.12 : 0 }, opacity: { duration: 0.2, delay: 0 } }
                    }
                  />
                </g>
              );
            })}
          </svg>
          <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {center ?? (
              <>
                <span className="text-[20px] font-medium leading-6 tracking-[-0.02em] text-fg tabular-nums">
                  <Rolling value={Math.round(share(first) * 100)} run={run} format={(v) => `${Math.round(v)}%`} reduce={reduce} />
                </span>
                <span className="max-w-[72px] truncate text-[12px] leading-4 text-fg-muted">{first.label}</span>
              </>
            )}
          </div>
        </div>

        <ul className="flex min-w-[108px] flex-1 flex-col gap-3">
          {rings.map((r, i) => {
            const f = r.format ?? plain;
            const met = r.value >= r.goal;
            return (
              <li
                key={r.label}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                className="flex min-w-0 flex-col transition-opacity duration-150"
                style={{ opacity: active === null || active === i ? 1 : 0.5 }}
              >
                <span className="flex items-center gap-2 text-[13px] leading-5 text-fg-muted">
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: r.color ?? STEPS[Math.min(i, STEPS.length - 1)] }} />
                  <span className="truncate">{r.label}</span>
                  {met && (
                    <span className="grid size-4 shrink-0 place-items-center rounded-full bg-[var(--select-soft)] text-[var(--select-text)]">
                      <Check size={12} strokeWidth={2} aria-hidden />
                      <span className="sr-only">Goal met</span>
                    </span>
                  )}
                </span>
                <span className="mt-0.5 flex items-baseline gap-1 whitespace-nowrap pl-4 tabular-nums">
                  <span className="text-[18px] font-medium leading-6 tracking-[-0.01em] text-fg">
                    <Rolling value={r.value} run={run} format={f} reduce={reduce} />
                  </span>
                  <span className="text-[13px] leading-5 text-fg-muted">/ {f(r.goal)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
