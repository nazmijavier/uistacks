"use client";

import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface MessageBranch {
  id: string;
  /** The user's message as it was sent in this version. */
  prompt: ReactNode;
  /** The answer to this version. */
  reply?: ReactNode;
  /** The answer is still being written: the AI loader shows instead. */
  pending?: boolean;
  /** Small muted line under the message, e.g. "Edited · 2:14 PM". */
  meta?: string;
}

export interface BranchSwitcherProps {
  /** Every version of the message, oldest first. */
  branches: MessageBranch[];
  /** The index of the version on show. */
  value?: number;
  defaultValue?: number;
  onValueChange?: (index: number) => void;
  /** Shown above the reply, e.g. the AI mark and name. */
  assistant?: ReactNode;
  /** Shown while a version is pending (default "Writing a new answer"). */
  pendingLabel?: string;
  className?: string;
}

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;
const ring = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
// aria-disabled, not disabled: focus stays on the arrow when it reaches the first or last version.
const arrow = `grid size-7 place-items-center rounded-full text-fg-muted transition-colors not-aria-disabled:hover:bg-muted not-aria-disabled:hover:text-fg aria-disabled:cursor-default aria-disabled:opacity-40 ${ring}`;

const noSubscribe = () => () => {};

/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

/* The AI loader ("Glyph · AI"): a 5 × 5 dot grid whose lit pattern cycles diamond, X, ring and plus around a lit core. */
const AI_DOTS = [1.5, 5.75, 10, 14.25, 18.5];
const AI_GROUPS: [number, number][][] = [
  [[0, 2], [1, 1], [1, 3], [2, 0], [2, 4], [3, 1], [3, 3], [4, 2]],
  [[0, 0], [1, 1], [3, 3], [4, 4], [0, 4], [1, 3], [3, 1], [4, 0]],
  [[1, 1], [1, 2], [1, 3], [2, 1], [2, 3], [3, 1], [3, 2], [3, 3]],
  [[0, 2], [1, 2], [3, 2], [4, 2], [2, 0], [2, 1], [2, 3], [2, 4]],
];
// 800 ms a cycle: each group holds 140 ms, then crossfades into the next over 60 ms.
const AI_FADE = [
  { opacity: [1, 1, 0, 0, 1], times: [0, 0.175, 0.25, 0.925, 1] },
  { opacity: [0, 0, 1, 1, 0, 0], times: [0, 0.175, 0.25, 0.425, 0.5, 1] },
  { opacity: [0, 0, 1, 1, 0, 0], times: [0, 0.425, 0.5, 0.675, 0.75, 1] },
  { opacity: [0, 0, 1, 1, 0], times: [0, 0.675, 0.75, 0.925, 1] },
];
function AiLoader({ reduce, size = 16 }: { reduce: boolean; size?: number }) {
  const gid = `${useId().replace(/[^\w-]/g, "")}-ai`;
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 20 20" className="shrink-0">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8C59FF" />
          <stop offset="1" stopColor="#5DB7E1" />
        </linearGradient>
      </defs>
      <g fill="currentColor" className="opacity-[0.12] dark:opacity-10">
        {AI_DOTS.flatMap((y) => AI_DOTS.map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.5} />))}
      </g>
      {AI_GROUPS.map((g, i) => (
        <motion.g
          key={i}
          fill={`url(#${gid})`}
          initial={{ opacity: i ? 0 : 1 }}
          animate={reduce ? { opacity: i ? 0 : 1 } : { opacity: AI_FADE[i].opacity }}
          transition={reduce ? { duration: 0 } : { duration: 0.8, times: AI_FADE[i].times, ease: "linear", repeat: Infinity }}
        >
          {g.map(([r, c]) => (
            <circle key={`${r}-${c}`} cx={AI_DOTS[c]} cy={AI_DOTS[r]} r={1.5} />
          ))}
        </motion.g>
      ))}
      <circle cx={10} cy={10} r={1.5} fill={`url(#${gid})`} />
    </svg>
  );
}

/** Animates its height to fit whatever is inside, so a cross-fade between versions doesn't jump. */
function AutoHeight({ children, reduce }: { children: ReactNode; reduce: boolean }) {
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | "auto">("auto");
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div initial={false} animate={{ height: h }} transition={reduce ? { duration: 0 } : spring} className="relative overflow-hidden">
      <div ref={inner}>{children}</div>
    </motion.div>
  );
}

/**
 * An edited message with its versions: "‹ 2 / 3 ›" under the message switches between them and
 * cross-fades the message and its reply together, so earlier answers can be compared.
 */
export function BranchSwitcher({
  branches,
  value,
  defaultValue,
  onValueChange,
  assistant,
  pendingLabel = "Writing a new answer",
  className = "",
}: BranchSwitcherProps) {
  const reduce = useReduce();
  const [own, setOwn] = useState(defaultValue ?? Math.max(0, branches.length - 1));
  const count = branches.length;
  const index = Math.min(Math.max(0, value ?? own), Math.max(0, count - 1));
  const [dir, setDir] = useState(1);
  const branch = branches[index];

  const go = (next: number) => {
    if (next < 0 || next >= count || next === index) return;
    setDir(next > index ? 1 : -1);
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };
  const onKey = (e: KeyboardEvent) => {
    const to = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: count - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    go(to);
  };

  if (!branch) return null;
  const shift = reduce ? 0 : 8 * dir;
  // The old text leaves quickly (no blur) before the new one fades in, so the two never overlap at full ink.
  const fade = {
    initial: { opacity: 0, x: shift, filter: reduce ? "none" : "blur(2px)" },
    animate: { opacity: 1, x: 0, filter: "blur(0px)" },
    exit: { opacity: 0, x: -shift, transition: reduce ? { duration: 0 } : { duration: 0.1, ease: "easeOut" as const } },
    transition: reduce ? { duration: 0 } : { opacity: { duration: 0.2, delay: 0.08 }, filter: { duration: 0.2, delay: 0.08 }, x: spring },
  };

  return (
    <div className={`flex w-full max-w-[560px] flex-col gap-4 ${className}`}>
      <div className="flex flex-col items-end gap-1.5">
        <AutoHeight reduce={reduce}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={branch.id} {...fade} className="flex justify-end">
              <div className="max-w-[min(85%,440px)] text-pretty rounded-[18px] bg-muted px-3.5 py-2 text-[14px] leading-[22px] text-fg">{branch.prompt}</div>
            </motion.div>
          </AnimatePresence>
        </AutoHeight>
        {count > 1 && (
          <div role="group" aria-label="Message versions" onKeyDown={onKey} className="flex items-center gap-0.5 text-[12px] leading-4 text-fg-muted">
            {branch.meta && <span className="mr-1.5 truncate">{branch.meta}</span>}
            <button type="button" aria-label="Previous version" aria-disabled={index === 0 || undefined} onClick={() => go(index - 1)} className={arrow}>
              <ChevronLeft aria-hidden size={16} strokeWidth={1.5} />
            </button>
            <span aria-live="polite" className="flex min-w-[36px] items-center justify-center tabular-nums">
              <span className="sr-only">Version </span>
              <span className="relative inline-flex h-4 overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={index}
                    initial={{ y: reduce ? 0 : 10 * dir, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: reduce ? 0 : -10 * dir, opacity: 0 }}
                    transition={reduce ? { duration: 0 } : spring}
                    className="block font-medium text-fg"
                  >
                    {index + 1}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span aria-hidden>&nbsp;/&nbsp;</span>
              <span className="sr-only"> of </span>
              {count}
            </span>
            <button type="button" aria-label="Next version" aria-disabled={index === count - 1 || undefined} onClick={() => go(index + 1)} className={arrow}>
              <ChevronRight aria-hidden size={16} strokeWidth={1.5} />
            </button>
          </div>
        )}
        {count <= 1 && branch.meta && <span className="text-[12px] leading-4 text-fg-muted">{branch.meta}</span>}
      </div>

      <div className="flex flex-col gap-2">
        {assistant && <div className="flex items-center gap-2 text-[13px] font-medium leading-5 text-fg">{assistant}</div>}
        <AutoHeight reduce={reduce}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={`${branch.id}-${branch.pending ? "pending" : "reply"}`} {...fade} aria-live="polite" className="text-[14px] leading-[22px] text-fg">
              {branch.pending ? (
                <span className="inline-flex items-center gap-2 text-fg-muted">
                  <AiLoader reduce={reduce} />
                  {pendingLabel}
                </span>
              ) : (
                branch.reply
              )}
            </motion.div>
          </AnimatePresence>
        </AutoHeight>
      </div>
    </div>
  );
}
