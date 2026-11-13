"use client";

import { useId, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type EmptyStateVariant = "first-use" | "no-results" | "error";

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  /** Renders the action as a link. */
  href?: string;
  /** A 16 px glyph before the label. */
  icon?: ReactNode;
  /** Shows a dot loader in place of the icon and ignores clicks, e.g. while Retry runs. */
  loading?: boolean;
}

export interface EmptyStateProps {
  /** First use invites the first action, no results offers a way out of the filter, error offers Retry. */
  variant?: EmptyStateVariant;
  /** A small pill above the title, e.g. "0 of 312 match" or "Error 503". Error turns it red. */
  meta?: ReactNode;
  title: ReactNode;
  /** One line that says why it is empty and what happens next. */
  description?: ReactNode;
  /** The main button (dark). */
  primaryAction?: EmptyStateAction;
  /** A quieter button next to it (white). */
  secondaryAction?: EmptyStateAction;
  /** Center for a panel or page; start for a column or a narrow sidebar. */
  align?: "center" | "start";
  /** Heading element for the title, to fit the page outline. */
  headingAs?: "h2" | "h3" | "h4";
  size?: "sm" | "md";
  /** Extra content under the actions, such as a help link. */
  children?: ReactNode;
  className?: string;
}

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
const ease = [0.22, 1, 0.36, 1] as const;

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

function ActionButton({ action, kind, size, reduce }: { action: EmptyStateAction; kind: "primary" | "secondary"; size: "sm" | "md"; reduce: boolean }) {
  const look =
    kind === "primary"
      ? "bg-[image:var(--grad-primary)] text-[var(--inverse-fg)] shadow-[var(--shadow-btn-primary)] hover:before:bg-[var(--inverse-fg)] hover:before:opacity-[0.08]"
      : "bg-surface text-fg shadow-[var(--shadow-btn-secondary)] hover:before:bg-fg hover:before:opacity-[0.04]";
  const box = `relative isolate inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:opacity-0 before:transition-opacity aria-busy:cursor-progress [&_svg]:size-4 ${
    size === "sm" ? "h-8 px-3 text-[13px] leading-[18px]" : "h-9 px-3.5 text-[14px] leading-5"
  } ${look} ${focusRing}`;
  const body = (
    <>
      {action.loading ? <AiLoader reduce={reduce} /> : action.icon}
      {action.label}
    </>
  );
  const tap = reduce || action.loading ? undefined : { scale: 0.97 };
  if (action.href)
    return (
      <motion.a href={action.href} whileTap={tap} onClick={action.onClick} aria-busy={action.loading || undefined} className={box}>
        {body}
      </motion.a>
    );
  return (
    <motion.button type="button" whileTap={tap} onClick={() => !action.loading && action.onClick?.()} aria-busy={action.loading || undefined} className={box}>
      {body}
    </motion.button>
  );
}

/** A text-only empty state: no illustration, just a clear title, one line and the next step. */
export function EmptyState({
  variant = "first-use",
  meta,
  title,
  description,
  primaryAction,
  secondaryAction,
  align = "center",
  headingAs: Heading = "h3",
  size = "md",
  children,
  className = "",
}: EmptyStateProps) {
  const reduce = useReduce();
  const center = align === "center";
  const error = variant === "error";
  const rise = (i: number) =>
    reduce
      ? // Same end values as the full motion: reduced motion is only known after hydration, so it can switch mid-entrance.
        { initial: { opacity: 0 }, animate: { opacity: 1, y: 0, filter: "blur(0px)" }, transition: { duration: 0.15 } }
      : { initial: { opacity: 0, y: 8, filter: "blur(4px)" }, animate: { opacity: 1, y: 0, filter: "blur(0px)" }, transition: { duration: 0.42, ease, delay: i * 0.06 } };

  return (
    <div
      role={error ? "alert" : "status"}
      className={`flex w-full flex-col ${center ? "items-center text-center" : "items-start text-left"} ${size === "sm" ? "max-w-[320px] gap-1.5" : "max-w-[400px] gap-2"} ${className}`}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {meta && (
          <motion.span
            key={`meta-${variant}`}
            {...rise(0)}
            exit={{ opacity: 0 }}
            className={`mb-1.5 inline-flex h-6 max-w-full items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium leading-4 tabular-nums ${
              error ? "bg-danger-soft text-danger-text" : "bg-muted text-fg-muted"
            }`}
          >
            <span className="truncate">{meta}</span>
          </motion.span>
        )}
      </AnimatePresence>
      <motion.div {...rise(1)}>
        <Heading className={`font-medium tracking-[-0.01em] text-fg ${size === "sm" ? "text-[15px] leading-[22px]" : "text-[17px] leading-6"}`}>{title}</Heading>
      </motion.div>
      {description && (
        <motion.p {...rise(2)} className={`text-pretty text-fg-muted ${size === "sm" ? "text-[13px] leading-5" : "text-[14px] leading-[22px]"}`}>
          {description}
        </motion.p>
      )}
      {(primaryAction || secondaryAction) && (
        <motion.div {...rise(3)} className={`flex flex-wrap items-center gap-2 ${size === "sm" ? "pt-2.5" : "pt-3.5"} ${center ? "justify-center" : ""}`}>
          {primaryAction && <ActionButton action={primaryAction} kind="primary" size={size} reduce={reduce} />}
          {secondaryAction && <ActionButton action={secondaryAction} kind="secondary" size={size} reduce={reduce} />}
        </motion.div>
      )}
      {children && (
        <motion.div {...rise(4)} className={`pt-2 text-[13px] leading-5 text-fg-muted ${center ? "" : "self-stretch"}`}>
          {children}
        </motion.div>
      )}
    </div>
  );
}
