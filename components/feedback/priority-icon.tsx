"use client";

import { useSyncExternalStore, type ComponentProps } from "react";
import { motion, useReducedMotion } from "motion/react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type Priority = "none" | "low" | "medium" | "high" | "urgent";
export type PriorityIconSize = 14 | 16;

/** Highest first, the order of a Set priority menu. */
export const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low", "none"];

export const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
};

export interface PriorityIconProps extends Omit<ComponentProps<"svg">, "children"> {
  priority?: Priority;
  /** 16 in rows, cards and menus; 14 inside dense pills and chips. */
  size?: PriorityIconSize;
  /**
   * The accessible name and hover tooltip: "Priority: High" by default, "No priority" for none. Pass `null` when a
   * visible label already says it; the glyph is then hidden from assistive tech.
   */
  label?: string | null;
}

// The kit's two grids (Figma UI / Priority icon). Three slots: dashes on the midline for None, bars that rise to the
// right for Low to High, and a red disc with "!" for Urgent. Sizes are drawn for their grid, not scaled.
const GRID = {
  16: { x: [2, 6.5, 11], w: 3, mid: 7.5, h: [6, 9, 12], base: 14, r: 1.5, c: 8, disc: 7, stem: { x: 7, y: 3.5, h: 5.5 }, dot: 11.5 },
  14: { x: [1.5, 5.5, 9.5], w: 2.5, mid: 6.5, h: [5, 8, 11], base: 12.5, r: 1.25, c: 7, disc: 6, stem: { x: 6, y: 3, h: 4.5 }, dot: 10 },
} as const;

const LEVEL: Record<Priority, number> = { none: 0, low: 1, medium: 2, high: 3, urgent: 0 };
const spring = { type: "spring", stiffness: 520, damping: 34 } as const;
const pop = { type: "spring", stiffness: 520, damping: 24 } as const;

const n = (v: number) => Math.round(v * 1000) / 1000;
/** A rounded rectangle as a path with a fixed shape, so a dash can grow into a bar. */
function rounded(x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  return [
    `M${n(x + k)} ${n(y)}H${n(x + w - k)}`,
    `A${n(k)} ${n(k)} 0 0 1 ${n(x + w)} ${n(y + k)}V${n(y + h - k)}`,
    `A${n(k)} ${n(k)} 0 0 1 ${n(x + w - k)} ${n(y + h)}H${n(x + k)}`,
    `A${n(k)} ${n(k)} 0 0 1 ${n(x)} ${n(y + h - k)}V${n(y + k)}`,
    `A${n(k)} ${n(k)} 0 0 1 ${n(x + k)} ${n(y)}Z`,
  ].join("");
}

export function PriorityIcon({ priority = "none", size = 16, label, className = "", ...rest }: PriorityIconProps) {
  const reduce = useReduce();
  const g = GRID[size];
  const urgent = priority === "urgent";
  const level = LEVEL[priority];
  // None and Urgent keep the three slots as dashes: Urgent folds its bars to the midline as the disc pops in.
  const bars = level > 0;
  const name = label === undefined ? (priority === "none" ? PRIORITY_LABELS.none : `Priority: ${PRIORITY_LABELS[priority]}`) : label;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role={name ? "img" : undefined}
      aria-hidden={name ? undefined : true}
      data-priority={priority}
      className={`shrink-0 ${className}`}
      {...rest}
    >
      {name && <title>{name}</title>}
      <motion.g initial={false} animate={{ opacity: urgent ? 0 : 1 }} transition={{ duration: reduce ? 0 : 0.16 }}>
        {g.x.map((x, i) => {
          const d = bars ? rounded(x, g.base - g.h[i], g.w, g.h[i], g.r) : rounded(x, g.mid, g.w, 1.5, 0.75);
          const tone = !bars ? "fill-fg-subtle" : i < level ? "fill-fg" : "fill-track-strong";
          return (
            <motion.path
              key={x}
              initial={false}
              animate={{ d }}
              transition={reduce ? { duration: 0 } : { ...spring, delay: i * 0.035 }}
              // The fill eases with CSS (token colours resolve per mode), one slot after another.
              style={{ transitionDelay: reduce ? undefined : `${i * 35}ms` }}
              className={`motion-safe:transition-[fill] motion-safe:duration-200 ${tone}`}
            />
          );
        })}
      </motion.g>
      <motion.g
        initial={false}
        animate={{ opacity: urgent ? 1 : 0, scale: urgent || reduce ? 1 : 0.4 }}
        transition={reduce ? { duration: 0 } : urgent ? pop : { duration: 0.14 }}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        <circle cx={g.c} cy={g.c} r={g.disc} className="fill-[var(--danger-solid)]" />
        <motion.rect
          x={g.stem.x}
          y={g.stem.y}
          width={2}
          height={g.stem.h}
          rx={1}
          fill="#fff"
          initial={false}
          animate={{ scaleY: urgent || reduce ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : { ...pop, delay: urgent ? 0.06 : 0 }}
          style={{ transformBox: "fill-box", transformOrigin: "50% 0%" }}
        />
        <circle cx={g.c} cy={g.dot} r={1} fill="#fff" />
      </motion.g>
    </svg>
  );
}
