"use client";

import { useSyncExternalStore, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type SkeletonShape = "line" | "circle" | "block";

export interface SkeletonProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Line: a 12 px bar for text. Circle: an avatar. Block: an image, chart or button. */
  shape?: SkeletonShape;
  /** Number (px) or any CSS length. Lines and blocks fill their parent by default. */
  width?: number | string;
  /** Number (px) or any CSS length. Defaults: line 12, circle 40, block 96. */
  height?: number | string;
  /** The soft light sweep. Off, the shape stays still; reduced motion always stops it. */
  shimmer?: boolean;
  /** Seconds before the sweep starts, so rows can follow each other. */
  delay?: number;
  /** Corner radius (px or CSS length); a pill-shaped block for a button or badge is 999. */
  radius?: number | string;
}

const DEFAULTS: Record<SkeletonShape, { w: number | string; h: number | string; round: string }> = {
  line: { w: "100%", h: 12, round: "rounded-full" },
  circle: { w: 40, h: 40, round: "rounded-full" },
  block: { w: "100%", h: 96, round: "rounded-[12px]" },
};

/** One placeholder shape. It is decorative (aria-hidden); wrap a group in SkeletonGroup for the loading label. */
export function Skeleton({ shape = "line", width, height, shimmer = true, delay = 0, radius, className = "", style, ...rest }: SkeletonProps) {
  const reduce = useReduce();
  const d = DEFAULTS[shape];
  const w = width ?? (shape === "circle" ? (height ?? d.w) : d.w);
  const h = height ?? (shape === "circle" ? (width ?? d.h) : d.h);
  const sweep = shimmer && !reduce;
  return (
    <span
      aria-hidden
      {...rest}
      style={{ width: w, height: h, ...(radius !== undefined ? { borderRadius: radius } : null), ...style } as CSSProperties}
      className={`relative block shrink-0 overflow-hidden bg-muted dark:bg-[color-mix(in_srgb,var(--fg)_10%,var(--surface))] ${d.round} ${className}`}
    >
      {sweep && (
        <motion.span
          className="absolute inset-y-0 left-0 w-full bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--surface)_65%,transparent),transparent)] dark:bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--fg)_7%,transparent),transparent)]"
          initial={{ x: "-100%" }}
          animate={{ x: "100%" }}
          transition={{ duration: 1.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.3, delay }}
        />
      )}
    </span>
  );
}

export interface SkeletonGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** Read by screen readers while the content loads. */
  label?: string;
  children: ReactNode;
}

/** A live region around placeholder shapes: screen readers hear the label once, not every shape. */
export function SkeletonGroup({ label = "Loading", children, className = "", ...rest }: SkeletonGroupProps) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" {...rest} className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export type SkeletonLayoutKind = "list" | "card" | "table";

export interface SkeletonLayoutProps {
  /** List rows (avatar, two lines, a meta pill), a media card, or a table with a header row. */
  layout: SkeletonLayoutKind;
  /** Rows for list and table. */
  rows?: number;
  /** Columns for table. */
  columns?: number;
  shimmer?: boolean;
  label?: string;
  className?: string;
}

// Fixed, varied widths read like real text (and match on the server and the client).
const WIDTHS = ["62%", "48%", "71%", "55%", "66%", "44%", "58%", "69%"];
const SHORT = ["86%", "74%", "92%", "80%", "68%", "88%"];

function ListRows({ rows, shimmer }: { rows: number; shimmer: boolean }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`flex items-center gap-3 py-3 ${i > 0 ? "border-t border-border/70" : ""}`}>
          <Skeleton shape="circle" width={40} shimmer={shimmer} delay={i * 0.12} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton width={WIDTHS[i % WIDTHS.length]} shimmer={shimmer} delay={i * 0.12} />
            <Skeleton height={10} width={SHORT[i % SHORT.length]} shimmer={shimmer} delay={i * 0.12} />
          </div>
          <Skeleton shape="block" width={52} height={20} radius={999} shimmer={shimmer} delay={i * 0.12} />
        </div>
      ))}
    </div>
  );
}

// Bars sit in the line boxes of the text they stand in for (a 22 px title, 20 px body lines), so the swap doesn't jump.
function Card({ shimmer }: { shimmer: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton shape="block" height={148} radius={14} shimmer={shimmer} />
      <div className="flex flex-col gap-1">
        <div className="flex h-[22px] items-center">
          <Skeleton width="58%" height={14} shimmer={shimmer} delay={0.1} />
        </div>
        <div className="flex flex-col">
          <div className="flex h-5 items-center">
            <Skeleton width="92%" height={10} shimmer={shimmer} delay={0.15} />
          </div>
          <div className="flex h-5 items-center">
            <Skeleton width="76%" height={10} shimmer={shimmer} delay={0.2} />
          </div>
        </div>
      </div>
      <div className="flex h-7 items-center gap-2.5">
        <Skeleton shape="circle" width={28} shimmer={shimmer} delay={0.25} />
        <Skeleton width={96} height={10} shimmer={shimmer} delay={0.25} />
        <Skeleton width={64} className="ml-auto" shimmer={shimmer} delay={0.3} />
      </div>
    </div>
  );
}

function Table({ rows, columns, shimmer }: { rows: number; columns: number; shimmer: boolean }) {
  const cols = Math.max(2, columns);
  const grid = { gridTemplateColumns: `minmax(0,1.6fr) repeat(${cols - 1}, minmax(0,1fr))` };
  return (
    <div className="flex flex-col">
      <div style={grid} className="grid items-center gap-4 border-b border-border/70 pb-3">
        {Array.from({ length: cols }, (_, c) => (
          // An 18 px line box like 12 px header text; the last bar is right-aligned like a figures column.
          <div key={c} className="flex h-[18px] items-center">
            <Skeleton width={c === 0 ? "40%" : "56%"} height={10} shimmer={false} className={`opacity-70 ${c === cols - 1 ? "ml-auto" : ""}`} />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={grid} className={`grid items-center gap-4 py-3 ${r > 0 ? "border-t border-border/70" : ""}`}>
          {Array.from({ length: cols }, (_, c) =>
            c === 0 ? (
              <div key={c} className="flex min-w-0 items-center gap-2.5">
                <Skeleton shape="block" width={24} height={24} radius={8} shimmer={shimmer} delay={r * 0.1} />
                <Skeleton width={WIDTHS[(r + c) % WIDTHS.length]} shimmer={shimmer} delay={r * 0.1} />
              </div>
            ) : (
              <Skeleton key={c} width={SHORT[(r * cols + c) % SHORT.length]} className={c === cols - 1 ? "ml-auto" : ""} shimmer={shimmer} delay={r * 0.1} />
            )
          )}
        </div>
      ))}
    </div>
  );
}

/** Ready-made loading layouts built from Skeleton shapes, inside a status region. */
export function SkeletonLayout({ layout, rows = 3, columns = 4, shimmer = true, label, className = "" }: SkeletonLayoutProps) {
  const fallback = layout === "list" ? "Loading list" : layout === "card" ? "Loading card" : "Loading table";
  return (
    <SkeletonGroup label={label ?? fallback} className={className}>
      {layout === "list" && <ListRows rows={rows} shimmer={shimmer} />}
      {layout === "card" && <Card shimmer={shimmer} />}
      {layout === "table" && <Table rows={rows} columns={columns} shimmer={shimmer} />}
    </SkeletonGroup>
  );
}
