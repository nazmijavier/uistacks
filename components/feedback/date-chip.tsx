"use client";

import { useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type DateChipState = "upcoming" | "due-soon" | "overdue" | "done";
export type DateInput = Date | string;

export interface DateChipProps extends Omit<ComponentProps<"span">, "children"> {
  /**
   * The due or target date: a Date, or "YYYY-MM-DD" (read as a local date, never shifted by time zone). A value that
   * does not parse renders nothing (or `children`, in the plain upcoming tone) instead of throwing.
   */
  date: DateInput;
  /** When the item was closed. The chip then reads "Done Oct 20", whatever the due date was. */
  doneAt?: DateInput | null;
  /** Today. Defaults to the viewer's clock, read after hydration and rolled over at midnight. */
  now?: DateInput;
  /** How many days before the date count as due soon: "In 2 days", "Tomorrow", "Today". */
  dueSoonDays?: number;
  /** Force a state instead of working it out from the dates. */
  state?: DateChipState;
  /** Plain sits in dense rows and board cards; Pill in property panels. */
  variant?: "plain" | "pill";
  size?: "sm" | "md";
  /** The pill's fill: muted on white cards, surface on grey panels. */
  fill?: "muted" | "surface";
  /** The glyph before the words. */
  icon?: boolean;
  /** What the date is, read before it by screen readers: "Due Friday, October 31". */
  label?: string;
  /** Replace the words; the state still sets the glyph and the tone. */
  children?: ReactNode;
}

const DAY = 86_400_000;

/** A Date or "YYYY-MM-DD" as local midnight; null when it does not parse ("", "TBD", a bad ISO string). */
function toDay(v: DateInput): Date | null {
  if (typeof v === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!v.trim()) return null;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole days from `a` to `b` (rounded, so a daylight-saving day still counts as one). */
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);

/**
 * The state the chip shows for a date: Upcoming until `dueSoonDays` before it, then Due soon; Overdue from the day
 * after until the item is closed; Done once it has a close date.
 */
export function getDateChipState(date: DateInput, { now, doneAt, dueSoonDays = 2 }: { now: DateInput; doneAt?: DateInput | null; dueSoonDays?: number }): DateChipState {
  // Only a close date that parses closes the item; a bad one is ignored.
  if (doneAt && toDay(doneAt)) return "done";
  const today = toDay(now);
  const due = toDay(date);
  // An unparseable date (or today) has nothing to count from: it reads as upcoming.
  if (!today || !due) return "upcoming";
  const left = daysBetween(today, due);
  return left < 0 ? "overdue" : left <= dueSoonDays ? "due-soon" : "upcoming";
}

const formats = new Map<string, Intl.DateTimeFormat>();
function format(d: Date, opts: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify(opts);
  let f = formats.get(key);
  if (!f) formats.set(key, (f = new Intl.DateTimeFormat("en-US", opts)));
  return f.format(d);
}
/** "Oct 31", with the year only when it is not this year's. */
const short = (d: Date, today: Date | null) => format(d, today && d.getFullYear() !== today.getFullYear() ? { month: "short", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" });
const long = (d: Date) => format(d, { weekday: "long", month: "long", day: "numeric" });

// The viewer's day, after hydration only (the server and the first client render show the plain date).
function subscribeDay(onChange: () => void) {
  let timer = 0;
  const arm = () => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    timer = window.setTimeout(() => {
      onChange();
      arm();
    }, midnight - now.getTime() + 50);
  };
  arm();
  return () => window.clearTimeout(timer);
}
const todayKey = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

const TEXT: Record<DateChipState, string> = {
  upcoming: "text-fg-muted",
  "due-soon": "text-warning-text",
  overdue: "text-danger-text",
  done: "text-fg-subtle",
};
const SIZES = {
  sm: { plain: "h-4 gap-1 text-[12px] leading-4", pill: "h-5 gap-1 pl-1.5 pr-2 text-[12px] leading-4" },
  md: { plain: "h-5 gap-1.5 text-[13px] leading-5 tracking-[-0.003em]", pill: "h-6 gap-1.5 pl-2 pr-2.5 text-[13px] leading-5 tracking-[-0.003em]" },
} as const;
const spring = { type: "spring", stiffness: 420, damping: 34 } as const;

/** The kit's 16 px glyphs at 1.3 px: a calendar, a calendar with a clock when it is close, a check when done. */
function Glyph({ state }: { state: DateChipState }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
  if (state === "done")
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.2" />
        <path d="M5.53 8.263 7.263 9.996 10.53 6.53" />
      </svg>
    );
  if (state === "due-soon")
    return (
      <svg {...common} className="text-fg">
        <rect x="1.55" y="2.67" width="12.905" height="11.614" rx="2.19" />
        <path d="M4.77 3.63V1.71M11.23 3.63V1.71" />
        <circle cx="8" cy="8.62" r="3.19" fill="currentColor" stroke="none" />
        <path d="M8 7.42v1.2l.95.55" stroke="var(--surface)" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="2.11" y="3.08" width="11.78" height="10.6" rx="2" />
      <path d="M5.05 4.06V2.31M10.95 4.06V2.31" />
      {/* The header line stays in ink, as on the kit's calendar. */}
      <path d="M2.11 7.1h11.78" className="text-fg" />
    </svg>
  );
}

export function DateChip({
  date,
  doneAt,
  now,
  dueSoonDays = 2,
  state: forced,
  variant = "plain",
  size = "sm",
  fill = "muted",
  icon = true,
  label = "Due",
  children,
  className = "",
  style,
  ...rest
}: DateChipProps) {
  const reduce = useReduce();
  const clock = useSyncExternalStore(now ? noSubscribe : subscribeDay, () => (now ? 0 : todayKey()), () => 0);
  const today = now ? toDay(now) : clock ? new Date(clock) : null;
  const due = toDay(date);
  const closed = doneAt ? toDay(doneAt) : null;
  const left = today && due ? daysBetween(today, due) : null;
  // Before the clock is known (server render, first paint) an open item shows its plain date.
  const state: DateChipState = forced ?? (closed ? "done" : today && due ? getDateChipState(due, { now: today, dueSoonDays }) : "upcoming");

  // A due date that does not parse: nothing to show, unless children give the words (in the plain tone).
  if (!due) {
    if (children === undefined) return null;
    return (
      <span data-state="upcoming" {...rest} style={style} className={`inline-flex shrink-0 items-center whitespace-nowrap font-medium ${SIZES[size][variant === "pill" ? "pill" : "plain"]} ${TEXT.upcoming} ${variant === "pill" ? `rounded-full ${fill === "surface" ? "bg-surface" : "bg-muted"}` : ""} ${className}`}>
        {children}
      </span>
    );
  }

  // The words, and what a screen reader hears in their place.
  const lower = label.charAt(0).toLowerCase() + label.slice(1);
  let words: string;
  let spoken: string;
  if (state === "done") {
    const d = closed ?? due;
    words = `Done ${short(d, today)}`;
    spoken = `Done ${long(d)}`;
  } else if (state === "overdue") {
    const late = left !== null && left < 0 ? -left : 0;
    words = late ? `${short(due, today)} · ${late}d late` : short(due, today);
    spoken = `Overdue: ${lower} ${long(due)}${late ? `, ${late} ${late === 1 ? "day" : "days"} late` : ""}`;
  } else if (state === "due-soon" && left !== null && left >= 0) {
    const rel = left === 0 ? "Today" : left === 1 ? "Tomorrow" : `In ${left} days`;
    words = rel;
    spoken = `${label} ${rel.toLowerCase()}, ${long(due)}`;
  } else {
    words = short(due, today);
    spoken = `${label} ${long(due)}`;
  }

  const pill = variant === "pill";
  const box = SIZES[size][pill ? "pill" : "plain"];
  const enter = reduce ? { opacity: 0 } : { opacity: 0, y: 8 };

  return (
    // The box eases to the new width (layout="size") while the label and glyph keep their shape (layout="position").
    <motion.span
      data-state={state}
      {...(rest as ComponentProps<typeof motion.span>)}
      layout={reduce ? false : "size"}
      transition={spring}
      style={pill ? { borderRadius: 999, ...style } : style}
      className={`relative inline-flex shrink-0 items-center whitespace-nowrap font-medium motion-safe:transition-colors motion-safe:duration-200 ${box} ${TEXT[state]} ${
        pill ? `rounded-full ${fill === "surface" ? "bg-surface" : "bg-muted"}` : ""
      } ${className}`}
    >
      {icon && (
        <motion.span layout={reduce ? false : "position"} transition={spring} className="relative grid size-4 shrink-0 place-items-center" aria-hidden>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={state}
              className="grid place-items-center"
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
              transition={reduce ? { duration: 0.12 } : spring}
            >
              <Glyph state={state} />
            </motion.span>
          </AnimatePresence>
        </motion.span>
      )}
      {children !== undefined ? (
        <span>
          {state !== "upcoming" && <span className="sr-only">{state === "due-soon" ? "Due soon: " : state === "overdue" ? "Overdue: " : "Done: "}</span>}
          {children}
        </span>
      ) : (
        <>
          {/* A new phrase slides in, like a badge's label (clipped only top and bottom, so a longer outgoing word is
              never cut at the pill's new edge); screen readers get the full sentence. */}
          <motion.span layout={reduce ? false : "position"} transition={spring} aria-hidden className="relative inline-flex overflow-x-visible overflow-y-clip">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={words}
                initial={enter}
                animate={{ opacity: 1, y: 0, transition: { ...spring, delay: reduce ? 0 : 0.04 } }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, transition: { duration: 0.12 } }}
              >
                {words}
              </motion.span>
            </AnimatePresence>
          </motion.span>
          <span className="sr-only">{spoken}</span>
        </>
      )}
    </motion.span>
  );
}
