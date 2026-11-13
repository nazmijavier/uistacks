"use client";

import { useSyncExternalStore, type ComponentProps } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type WorkflowStatus = "backlog" | "todo" | "in-progress" | "in-review" | "ready" | "done" | "canceled" | "blocked";
export type StatusIconSize = 14 | 16;

/** The workflow order, Backlog to Done, then the two side exits. */
export const WORKFLOW_STATUSES: WorkflowStatus[] = ["backlog", "todo", "in-progress", "in-review", "ready", "done", "canceled", "blocked"];

export const STATUS_LABELS: Record<WorkflowStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  "in-progress": "In progress",
  "in-review": "In review",
  ready: "Ready",
  done: "Done",
  canceled: "Canceled",
  blocked: "Blocked",
};

export interface StatusIconProps extends Omit<ComponentProps<"svg">, "children"> {
  status?: WorkflowStatus;
  /** 16 for rows, menus and boards; 14 for badges, chips and mentions. */
  size?: StatusIconSize;
  /**
   * The accessible name and hover tooltip, "Status: In review" by default. Pass `null` when a visible label already
   * says it; the glyph is then hidden from assistive tech.
   */
  label?: string | null;
}

// The kit's glyphs on their own grids (Figma UI / Status icon): every state has its own shape (dashed, empty, quarter,
// arrow in, dashed check, check, cross, bar), so it reads without colour.
const GRID = {
  16: {
    c: 8,
    r: 6.4,
    ring: 1.2,
    mark: 1.5,
    disc: 7,
    pie: 2,
    backlogDash: "3.351 3.351",
    readyDash: "2.247 3.498",
    review: "M8 14.4C4.465 14.4 1.6 11.535 1.6 8C1.6 4.465 4.465 1.6 8 1.6M11.671 2.757C12.591 3.402 13.326 4.277 13.8 5.295M13.8 10.705C13.326 11.723 12.591 12.598 11.671 13.243",
    arrow: "M5.9 8H10.567M8.234 5.667 10.567 8 8.234 10.333",
    readyCheck: "M5.75 7.872 7.334 9.457 10.251 6.54",
    doneCheck: "M4.93 7.828 7.092 9.988 11.07 6.01",
    cross: "M5.67 5.67 10.337 10.337M10.337 5.67 5.67 10.337",
    bar: "M5.32 8H10.687",
  },
  14: {
    c: 7,
    r: 5.5,
    ring: 1,
    mark: 1.3,
    disc: 6,
    pie: 1.75,
    backlogDash: "2.88 2.88",
    readyDash: "1.962 2.975",
    review: "M7 12.5C3.961 12.5 1.5 10.038 1.5 7C1.5 3.961 3.961 1.5 7 1.5M10.154 2.495C10.945 3.047 11.576 3.801 11.984 4.676M11.984 9.323C11.576 10.198 10.945 10.952 10.154 11.505",
    arrow: "M5.2 7H9.2M7.2 5 9.2 7 7.2 9",
    readyCheck: "M5.07 6.891 6.428 8.25 8.928 5.75",
    doneCheck: "M4.37 6.847 6.223 8.7 9.633 5.29",
    cross: "M5 5 9 9M9 5 5 9",
    bar: "M4.7 7H9.3",
  },
} as const;

const TONE: Record<WorkflowStatus, string> = {
  backlog: "text-fg-subtle",
  todo: "text-fg-muted",
  "in-progress": "text-fg",
  "in-review": "text-fg",
  ready: "text-fg",
  done: "text-success",
  canceled: "text-fg-subtle",
  blocked: "text-danger",
};

const ease = [0.22, 1, 0.36, 1] as const;
// The glyph turns in; then its mark draws (check, cross, arrow, bar) or the quarter sweeps.
const glyph: Variants = {
  hidden: { opacity: 0, scale: 0.55, rotate: -50 },
  shown: { opacity: 1, scale: 1, rotate: 0, transition: { type: "spring", stiffness: 480, damping: 28 } },
  gone: { opacity: 0, scale: 0.7, transition: { duration: 0.12 } },
};
const drawIn: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  shown: { pathLength: 1, opacity: 1, transition: { delay: 0.07, duration: 0.26, ease } },
};
const sweepIn: Variants = {
  hidden: { pathLength: 0 },
  shown: { pathLength: 0.25, transition: { delay: 0.07, duration: 0.3, ease } },
};
const fade: Variants = { hidden: { opacity: 0 }, shown: { opacity: 1, transition: { duration: 0.12 } }, gone: { opacity: 0, transition: { duration: 0.08 } } };

function Marks({ status, g, still }: { status: WorkflowStatus; g: (typeof GRID)[StatusIconSize]; still: boolean }) {
  const { c, r } = g;
  // With reduced motion the marks are simply there (the glyph cross-fades).
  const draw = still ? undefined : drawIn;
  const sweep = still ? undefined : sweepIn;
  const stroke = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (status) {
    case "backlog":
      return <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth={g.ring} strokeDasharray={g.backlogDash} transform={`rotate(-105 ${c} ${c})`} />;
    case "todo":
      return <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth={g.ring} />;
    case "in-progress":
      return (
        <>
          <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth={g.ring} />
          {/* The quarter: a stroke as wide as the wedge's radius, drawn a quarter of the way round from 12 o'clock. */}
          {sweep ? (
            <motion.circle variants={sweep} cx={c} cy={c} r={g.pie} fill="none" stroke="currentColor" strokeWidth={g.pie * 2} transform={`rotate(-90 ${c} ${c})`} />
          ) : (
            <path d={`M${c} ${c}V${c - g.pie * 2}A${g.pie * 2} ${g.pie * 2} 0 0 1 ${c + g.pie * 2} ${c}Z`} fill="currentColor" />
          )}
        </>
      );
    case "in-review":
      return (
        <>
          <path d={g.review} fill="none" stroke="currentColor" strokeWidth={g.ring} />
          <motion.path variants={draw} d={g.arrow} strokeWidth={g.ring} {...stroke} />
        </>
      );
    case "ready":
      return (
        <>
          <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth={g.ring} strokeDasharray={g.readyDash} strokeLinecap="round" transform={`rotate(-100 ${c} ${c})`} />
          <motion.path variants={draw} d={g.readyCheck} strokeWidth={g.mark} {...stroke} />
        </>
      );
    case "done":
    case "canceled":
      // The mark is drawn in the surface colour (not a true cut-out), so it stays crisp on Light and Dark cards.
      return (
        <>
          <circle cx={c} cy={c} r={g.disc} fill="currentColor" />
          <motion.path variants={draw} d={status === "done" ? g.doneCheck : g.cross} strokeWidth={g.mark} {...stroke} stroke="var(--surface)" />
        </>
      );
    case "blocked":
      return (
        <>
          <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth={g.ring} />
          <motion.path variants={draw} d={g.bar} strokeWidth={g.mark} {...stroke} />
        </>
      );
  }
}

export function StatusIcon({ status = "backlog", size = 16, label, className = "", ...rest }: StatusIconProps) {
  const reduce = useReduce();
  const g = GRID[size];
  const name = label === undefined ? `Status: ${STATUS_LABELS[status]}` : label;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      role={name ? "img" : undefined}
      aria-hidden={name ? undefined : true}
      data-status={status}
      className={`shrink-0 ${className}`}
      {...rest}
    >
      {name && <title>{name}</title>}
      {/* No entrance on first paint; a new status turns in and draws its mark (a cross-fade with reduced motion). */}
      <AnimatePresence initial={false}>
        <motion.g
          key={status}
          variants={reduce ? fade : glyph}
          initial="hidden"
          animate="shown"
          exit="gone"
          className={TONE[status]}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        >
          <Marks status={status} g={g} still={reduce} />
        </motion.g>
      </AnimatePresence>
    </svg>
  );
}
