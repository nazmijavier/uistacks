"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

export interface LeaderboardRow {
  id: string;
  name: string;
  /** Photo URL; without one the first letter shows. */
  avatar?: string;
  /** Under the name, e.g. "Enterprise · West". */
  meta?: string;
  score: number;
  /** Places moved since the last period: 2 is up two, -1 down one, 0 the same. Left out, no arrow. */
  delta?: number;
}

export interface LeaderboardPeriod {
  id: string;
  /** Segmented control text, e.g. "Week". */
  label: string;
  /** In any order; ranked by score, high to low. */
  rows: LeaderboardRow[];
}

export interface LeaderboardProps {
  /** One or more periods; with more than one a segmented control switches them and the rows re-order. */
  periods: LeaderboardPeriod[];
  period?: string;
  defaultPeriod?: string;
  onPeriodChange?: (id: string) => void;
  /** Your row's id: it gets a "You" pill and stays pinned to the edge while it is scrolled out of view. */
  you?: string;
  /** Card title, e.g. "Top reps". */
  title?: string;
  /** Under the title, e.g. "Deals closed · Stacks CRM". */
  description?: string;
  /** Formats the scores (default 1,284). */
  format?: (value: number) => string;
  /** Read after each score by screen readers, e.g. "deals". */
  scoreLabel?: string;
  /** The list scrolls past this height in px (default 336, about seven rows). */
  maxHeight?: number;
  className?: string;
}

const ease = [0.22, 1, 0.36, 1] as const;
const spring = { type: "spring", stiffness: 420, damping: 34 } as const;
// Rows re-order on a stiffer, near-critically damped spring, so rows crossing each other overlap only briefly.
const glide = { type: "spring", stiffness: 600, damping: 46 } as const;
const ring = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
/** The top three: mono medals, darkest first. */
const MEDAL = [
  "bg-fg text-surface",
  "bg-[color-mix(in_srgb,var(--fg)_48%,var(--surface))] text-surface",
  "bg-[color-mix(in_srgb,var(--fg)_16%,var(--surface))] text-fg",
];

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

/** Counts from the last shown number to the new one. */
function Rolling({ value, format, reduce }: { value: number; format: (v: number) => string; reduce: boolean }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const controls = animate(from.current, value, {
      duration: reduce ? 0 : 0.6,
      ease,
      onUpdate: (v) => {
        from.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [value, reduce]);
  return <>{format(shown)}</>;
}

function Avatar({ row }: { row: LeaderboardRow }) {
  return row.avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={row.avatar} alt="" draggable={false} className="size-7 shrink-0 rounded-full object-cover @[360px]:size-8 @max-[340px]:size-6" />
  ) : (
    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[13px] font-medium text-fg @[360px]:size-8 @max-[340px]:size-6 @max-[340px]:text-[12px]">
      {row.name.trim()[0]?.toUpperCase()}
    </span>
  );
}

function Delta({ value }: { value?: number }) {
  if (value === undefined) return null;
  const Icon = value > 0 ? ArrowUp : value < 0 ? ArrowDown : Minus;
  const tone = value > 0 ? "text-[var(--success-text)]" : value < 0 ? "text-danger-text" : "text-fg-subtle";
  return (
    // Narrow cards keep the faces and drop the delta number (the arrow and the sr-only text stay).
    <span className={`inline-flex w-8 shrink-0 items-center justify-end @[360px]:w-9 @max-[340px]:w-3.5 gap-0.5 text-[12px] font-medium leading-4 tabular-nums ${tone}`}>
      <Icon size={14} strokeWidth={1.75} aria-hidden />
      {value !== 0 && <span className="@max-[340px]:hidden">{Math.abs(value)}</span>}
      <span className="sr-only">{value > 0 ? `, up ${value}` : value < 0 ? `, down ${-value}` : ", no change"}</span>
    </span>
  );
}

function RankBadge({ rank, children }: { rank: number; children?: ReactNode }) {
  return (
    <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-medium leading-4 tabular-nums ${rank <= 3 ? MEDAL[rank - 1] : "text-fg-muted"}`}>
      {children ?? rank}
    </span>
  );
}

/** One row's content; the list row and the pinned copy share it. In the list the visible rank is a static column
 * (see `Leaderboard`), so ranks don't ride along while the rows re-order; the row keeps a spacer and the sr-only rank. */
function RowBody({ row, rank, you, format, scoreLabel, reduce, rankColumn = false }: { row: LeaderboardRow; rank: number; you: boolean; format: (v: number) => string; scoreLabel?: string; reduce: boolean; rankColumn?: boolean }) {
  return (
    <>
      {rankColumn ? (
        <span className="size-6 shrink-0">
          <span className="sr-only">Rank {rank}</span>
        </span>
      ) : (
        <RankBadge rank={rank}>
          <span className="sr-only">Rank </span>
          {rank}
        </RankBadge>
      )}
      <Avatar row={row} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[14px] font-medium leading-5 text-fg">{row.name}</span>
          {you && <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-muted px-2 text-[12px] font-medium leading-4 text-fg">You</span>}
        </span>
        {row.meta && <span className="truncate text-[12px] leading-4 text-fg-muted">{row.meta}</span>}
      </span>
      <span className={`shrink-0 text-right text-[14px] leading-5 tabular-nums ${rank <= 3 ? "font-medium text-fg" : "text-fg"}`}>
        <Rolling value={row.score} format={format} reduce={reduce} />
        {scoreLabel && <span className="sr-only"> {scoreLabel}</span>}
      </span>
      <Delta value={row.delta} />
    </>
  );
}

export function Leaderboard({
  periods,
  period: periodProp,
  defaultPeriod,
  onPeriodChange,
  you,
  title,
  description,
  format = (v) => Math.round(v).toLocaleString("en-US"),
  scoreLabel,
  maxHeight = 336,
  className = "",
}: LeaderboardProps) {
  const uid = useId().replace(/[^\w-]/g, "");
  const reduce = useReduce();
  const [ownPeriod, setOwnPeriod] = useState(defaultPeriod ?? periods[0]?.id);
  const current = periods.find((p) => p.id === (periodProp ?? ownPeriod)) ?? periods[0];
  const pick = (id: string) => {
    if (periodProp === undefined) setOwnPeriod(id);
    onPeriodChange?.(id);
  };

  const ranked = current.rows.map((row, i) => ({ row, i })).sort((a, b) => b.row.score - a.row.score || a.i - b.i).map((d) => d.row);
  const yourIndex = you ? ranked.findIndex((r) => r.id === you) : -1;

  // A period change re-ranks the list: say who leads now (and your rank), not the whole list.
  const [said, setSaid] = useState("");
  const [seenPeriod, setSeenPeriod] = useState(current.id);
  if (seenPeriod !== current.id) {
    setSeenPeriod(current.id);
    const lead = ranked[0];
    setSaid(lead ? `${current.label}: ${lead.name} leads with ${format(lead.score)}${yourIndex >= 0 ? `. Your rank: ${yourIndex + 1}` : ""}.` : current.label);
  }

  // Your row pins to the top or bottom edge while it is out of the list's view.
  const scrollRef = useRef<HTMLDivElement>(null);
  const yourRef = useRef<HTMLLIElement>(null);
  const [pin, setPin] = useState<"top" | "bottom" | null>(null);
  useEffect(() => {
    const root = scrollRef.current;
    const el = yourRef.current;
    if (!root || !el) {
      setPin(null);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.98) return setPin(null);
        const top = entry.rootBounds?.top ?? root.getBoundingClientRect().top;
        setPin(entry.boundingClientRect.top < top ? "top" : "bottom");
      },
      { root, threshold: [0, 0.5, 0.98, 1] }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [you, yourIndex, current.id]);

  const jump = () => yourRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });

  return (
    <div className={`@container w-full min-w-0 rounded-[20px] bg-surface p-5 shadow-[var(--shadow-card)] ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {title && <p className="truncate text-[15px] font-medium leading-5 tracking-[-0.01em] text-fg">{title}</p>}
          {description && <p className="mt-0.5 truncate text-[13px] leading-5 text-fg-muted">{description}</p>}
        </div>
        {periods.length > 1 && (
          <div role="radiogroup" aria-label="Period" className="flex shrink-0 items-center gap-1">
            {periods.map((p, i) => {
              const on = p.id === current.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  data-id={p.id}
                  onClick={() => pick(p.id)}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                    e.preventDefault();
                    const next = periods[(i + (e.key === "ArrowRight" ? 1 : periods.length - 1)) % periods.length];
                    pick(next.id);
                    (e.currentTarget.parentElement?.querySelector(`[data-id="${next.id}"]`) as HTMLElement | null)?.focus();
                  }}
                  className={`relative h-7 min-w-11 rounded-full px-3 text-[13px] font-medium leading-5 transition-colors duration-150 ${ring} ${
                    on ? "text-[var(--select-text)]" : "text-fg-muted hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)] hover:text-fg"
                  }`}
                >
                  {on && <motion.span layoutId={`${uid}-period`} transition={reduce ? { duration: 0 } : spring} className="absolute inset-0 rounded-full bg-[var(--select-soft)]" />}
                  <span className="relative z-[1]">{p.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="relative -mx-2 mt-3">
        <motion.div
          ref={scrollRef}
          layoutScroll
          tabIndex={0}
          role="region"
          aria-label={`${title ?? "Leaderboard"}, ${current.label}`}
          className={`overflow-y-auto overscroll-contain rounded-[12px] px-2 py-1 [scrollbar-width:thin] ${ring}`}
          style={{ maxHeight }}
        >
          <ol className="relative flex flex-col">
            {ranked.map((row, i) => {
              const mine = row.id === you;
              return (
                <motion.li
                  key={row.id}
                  ref={mine ? yourRef : undefined}
                  layout={reduce ? false : "position"}
                  transition={glide}
                  aria-current={mine ? "true" : undefined}
                  className={`relative flex h-12 items-center gap-2 rounded-[12px] px-2 @[360px]:gap-3 ${mine ? "bg-subtle" : ""}`}
                >
                  <RowBody row={row} rank={i + 1} you={mine} format={format} scoreLabel={scoreLabel} reduce={reduce} rankColumn />
                </motion.li>
              );
            })}
            {/* The ranks stay put while the rows glide to their new places. */}
            <li aria-hidden className="pointer-events-none absolute left-2 top-0 flex flex-col">
              {ranked.map((_, i) => (
                <span key={i} className="flex h-12 items-center">
                  <RankBadge rank={i + 1} />
                </span>
              ))}
            </li>
          </ol>
        </motion.div>

        <AnimatePresence>
          {pin && yourIndex >= 0 && (
            <motion.button
              key="pin"
              type="button"
              onClick={jump}
              aria-label={`Your rank: ${yourIndex + 1}. Scroll to your row.`}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: pin === "top" ? -8 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: pin === "top" ? -8 : 8 }}
              transition={spring}
              whileTap={reduce ? undefined : { scale: 0.98 }}
              className={`absolute inset-x-2 z-10 flex h-12 items-center gap-2 rounded-[12px] @[360px]:gap-3 bg-surface px-2 text-left shadow-[var(--shadow-overlay)] ${pin === "top" ? "top-1" : "bottom-1"} ${ring}`}
            >
              <RowBody row={ranked[yourIndex]} rank={yourIndex + 1} you format={format} scoreLabel={scoreLabel} reduce={reduce} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {said}
      </span>
    </div>
  );
}
