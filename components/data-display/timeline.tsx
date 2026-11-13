"use client";

import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown, Paperclip } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type TimelineTone = "neutral" | "select" | "success" | "warning" | "danger";

export interface TimelineAttachment {
  name: string;
  /** Small text after the name, e.g. "240 KB". */
  meta?: string;
  /** 16 px icon; a paperclip by default. */
  icon?: ReactNode;
  /** Makes the chip a link. */
  href?: string;
}

export interface TimelineEvent {
  id: string;
  title: ReactNode;
  /** Shown on the right, e.g. "10:42 AM". */
  time?: string;
  /** Machine-readable time for the <time> element. */
  dateTime?: string;
  /** Events in a row with the same day share one day label ("Today", "Nov 6"). */
  day?: string;
  /** 16 px lucide icon in the dot. Without one the dot is a small filled circle. */
  icon?: ReactNode;
  /** Colours the dot; keep it neutral unless the event means something (paid, failed). */
  tone?: TimelineTone;
  body?: ReactNode;
  attachments?: TimelineAttachment[];
}

export interface TimelineProps {
  /** In display order, newest first or oldest first. */
  events: TimelineEvent[];
  /** Events shown before the "Show N more" fold. Leave it out to show them all. */
  visible?: number;
  /** Whether the fold is open. */
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Fold button text for the hidden count. */
  moreLabel?: (hidden: number) => string;
  lessLabel?: string;
  "aria-label"?: string;
  className?: string;
}

const spring = { type: "spring", stiffness: 420, damping: 38 } as const;
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

const TONES: Record<TimelineTone, string> = {
  neutral: "bg-surface text-fg-muted shadow-[var(--shadow-control)]",
  select: "bg-select-soft text-select-text",
  success: "bg-success-soft text-success-text",
  warning: "bg-warning-soft text-warning-text",
  danger: "bg-danger-soft text-danger-text",
};

type Group = { day?: string; events: TimelineEvent[] };

/** Runs of events with the same day label. */
function groupByDay(events: TimelineEvent[]) {
  const groups: Group[] = [];
  for (const e of events) {
    const last = groups[groups.length - 1];
    if (last && last.day === e.day) last.events.push(e);
    else groups.push({ day: e.day, events: [e] });
  }
  return groups;
}

function Chip({ a }: { a: TimelineAttachment }) {
  const inner = (
    <>
      <span aria-hidden className="flex shrink-0 text-fg-muted [&_svg]:size-4">
        {a.icon ?? <Paperclip strokeWidth={1.5} />}
      </span>
      <span className="min-w-0 truncate text-fg">{a.name}</span>
      {a.meta && <span className="shrink-0 text-fg-muted">{a.meta}</span>}
    </>
  );
  const cls = "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-surface px-2.5 text-[12px] leading-4 shadow-[var(--shadow-control)]";
  return a.href ? (
    <a href={a.href} className={`${cls} transition-colors hover:bg-subtle ${focusRing}`}>
      {inner}
    </a>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

export function Timeline({
  events,
  visible,
  expanded: expandedProp,
  defaultExpanded = false,
  onExpandedChange,
  moreLabel = (n) => `Show ${n} more`,
  lessLabel = "Show less",
  "aria-label": ariaLabel = "Activity",
  className = "",
}: TimelineProps) {
  const uid = useId();
  const reduce = useReduce();
  const [inner, setInner] = useState(defaultExpanded);
  const expanded = expandedProp ?? inner;
  const folds = visible !== undefined && events.length > visible;
  const shown = folds && !expanded ? events.slice(0, visible) : events;
  const hidden = events.length - (visible ?? events.length);
  const groups = groupByDay(shown);
  // Keyed by day, so a new event at the top of "Today" slides in without remounting the day.
  const seen = new Map<string, number>();
  const keys = groups.map((g) => {
    const k = g.day ?? "";
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return `${k}#${n}`;
  });
  const lastId = shown[shown.length - 1]?.id;

  // Events added after mount are read out once (string titles by name, others as a count).
  const ids = events.map((e) => e.id).join("|");
  const [known, setKnown] = useState(ids);
  const [said, setSaid] = useState("");
  if (known !== ids) {
    const before = known.split("|");
    setKnown(ids);
    const news = events.filter((e) => !before.includes(e.id));
    if (news.length) {
      const named = news.every((e) => typeof e.title === "string");
      setSaid(named ? news.map((e) => `New: ${e.title}${e.time ? `, ${e.time}` : ""}`).join(". ") : `${news.length} new ${news.length === 1 ? "event" : "events"}`);
    }
  }

  const setExpanded = (next: boolean) => {
    if (expandedProp === undefined) setInner(next);
    onExpandedChange?.(next);
  };

  // Height and fade in and out; the overflow is only clipped while it moves, so the dot's ring stays whole.
  const fold = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, height: 0, overflow: "hidden" },
        animate: { opacity: 1, height: "auto", transitionEnd: { overflow: "visible" } },
        exit: { opacity: 0, height: 0, overflow: "hidden" },
      };

  return (
    <div role="region" aria-label={ariaLabel} className={`flex min-w-0 flex-col ${className}`}>
      <AnimatePresence initial={false}>
        {groups.map((g, gi) => (
          <motion.section key={keys[gi]} {...fold} transition={spring} aria-labelledby={g.day ? `${uid}-d${gi}` : undefined}>
            {g.day && (
              // The pill sits on the rail and hides it; the gap above and below matches the dots.
              <h3 id={`${uid}-d${gi}`} className="flex pb-3">
                <span className="inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-[12px] font-medium leading-4 text-fg-muted">{g.day}</span>
              </h3>
            )}
            <ol className="flex flex-col">
              <AnimatePresence initial={false}>
                {g.events.map((e) => (
                  <motion.li key={e.id} {...fold} transition={spring} className="relative">
                    {e.id !== lastId && <span aria-hidden className="absolute bottom-1.5 left-[13.5px] top-[34px] w-px bg-border" />}
                    <div className={`grid grid-cols-[28px_minmax(0,1fr)] gap-3 ${e.id === lastId ? "" : "pb-5"}`}>
                      <span aria-hidden className={`grid size-7 place-items-center rounded-full [&_svg]:size-4 ${TONES[e.tone ?? "neutral"]}`}>
                        {e.icon ?? <span className="size-1.5 rounded-full bg-current" />}
                      </span>
                      <div className="min-w-0 pt-1">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <p className="min-w-0 text-[14px] leading-5 text-fg">{e.title}</p>
                          {e.time && (
                            <time dateTime={e.dateTime} className="shrink-0 whitespace-nowrap text-[12px] leading-5 tabular-nums text-fg-muted">
                              {e.time}
                            </time>
                          )}
                        </div>
                        {e.body && <div className="mt-1 text-[13px] leading-5 text-fg-muted">{e.body}</div>}
                        {e.attachments && e.attachments.length > 0 && (
                          <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
                            {e.attachments.map((a) => (
                              <Chip key={a.name} a={a} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          </motion.section>
        ))}
      </AnimatePresence>
      {folds && (
        <div className="mt-4 pl-10">
          <motion.button
            type="button"
            whileTap={reduce ? undefined : { scale: 0.97 }}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface pl-3 pr-2.5 text-[13px] font-medium leading-5 text-fg shadow-[var(--shadow-btn-secondary)] ${focusRing}`}
          >
            {expanded ? lessLabel : moreLabel(hidden)}
            <motion.span aria-hidden animate={{ rotate: expanded ? 180 : 0 }} transition={reduce ? { duration: 0 } : spring} className="flex text-fg-muted">
              <ChevronDown size={16} strokeWidth={1.5} />
            </motion.span>
          </motion.button>
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {said}
      </span>
    </div>
  );
}
