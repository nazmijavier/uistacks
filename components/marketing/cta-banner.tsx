"use client";

import { useId, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { motion, useAnimationFrame, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { ArrowRight } from "lucide-react";

export interface CtaAction {
  label: ReactNode;
  /** Renders a link; without it the action is a button. */
  href?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
}

export interface CtaBannerProps {
  /** A short line above the headline. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** One line under the headline. */
  description?: ReactNode;
  primary: CtaAction;
  secondary?: CtaAction;
  /** Holds the light where it is (also stopped under reduced motion). */
  paused?: boolean;
  /** One lap of the light around the edge, in ms. Default 9000. */
  lapDuration?: number;
  /** Heading level of the headline. Default 2. */
  headingLevel?: 2 | 3;
  className?: string;
}

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]";
const btn = `inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[14px] font-medium leading-5 tracking-[-0.006em] transition-transform motion-safe:active:scale-[0.97] ${focusRing}`;
const RADIUS = 24;
/** Where the light rests before it moves, as a share of the edge (0 is the top left after the corner). */
const START = -6;

const noSubscribe = () => () => {};

/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

function Action({ a, className, children }: { a: CtaAction; className: string; children: ReactNode }) {
  if (a.href)
    return (
      <a href={a.href} onClick={a.onClick} className={className}>
        {children}
      </a>
    );
  return (
    <button type="button" onClick={a.onClick} className={className}>
      {children}
    </button>
  );
}

/**
 * The closing call to action of a page: headline, one line and two buttons on a card whose 1 px edge carries a soft
 * light that travels slowly around it. The light is three stacked dashes of the same edge path (narrow and bright
 * over wide and faint, plus a blurred glow), centred on one point, so its ends fade instead of stopping hard.
 */
export function CtaBanner({ eyebrow, title, description, primary, secondary, paused = false, lapDuration = 9000, headingLevel = 2, className = "" }: CtaBannerProps) {
  const reduce = useReduce();
  const id = useId();
  const H = `h${headingLevel}` as "h2" | "h3";

  // The edge is measured as 100 units (pathLength), so the dash sizes hold for any card size.
  const offset = useMotionValue(START);
  useAnimationFrame((_, delta) => {
    if (paused || reduce) return;
    offset.set((offset.get() - (delta / lapDuration) * 100) % 100);
  });
  const core = offset;
  const mid = useTransform(offset, (o) => o + 3);
  const wide = useTransform(offset, (o) => o + 6);

  const rect = { x: 0.5, y: 0.5, rx: RADIUS - 0.5, pathLength: 100, fill: "none", style: { width: "calc(100% - 1px)", height: "calc(100% - 1px)" } };

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={`@container relative w-full overflow-visible rounded-[24px] bg-surface bg-[radial-gradient(120%_90%_at_50%_0%,color-mix(in_srgb,var(--fg)_4%,transparent),transparent_70%)] shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-8px_rgb(0_0_0/0.08)] dark:shadow-none ${className}`}
    >
      <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
        {/* The resting edge. */}
        <rect {...rect} stroke="color-mix(in srgb, var(--fg) 11%, transparent)" strokeWidth={1} />
        {/* The travelling light: currentColor, a soft grey in Light and near white with a glow in Dark. */}
        <g className="text-[color-mix(in_srgb,var(--fg)_32%,transparent)] dark:text-[rgb(255_255_255/0.85)]">
          <motion.rect {...rect} stroke="currentColor" strokeWidth={3} strokeDasharray="12 88" strokeLinecap="round" className="opacity-0 dark:opacity-35" style={{ ...rect.style, strokeDashoffset: mid, filter: "blur(3px)" }} />
          <motion.rect {...rect} stroke="currentColor" strokeWidth={1} strokeDasharray="18 82" opacity={0.25} style={{ ...rect.style, strokeDashoffset: wide }} />
          <motion.rect {...rect} stroke="currentColor" strokeWidth={1} strokeDasharray="12 88" opacity={0.5} style={{ ...rect.style, strokeDashoffset: mid }} />
          <motion.rect {...rect} stroke="currentColor" strokeWidth={1} strokeDasharray="6 94" style={{ ...rect.style, strokeDashoffset: core }} />
        </g>
      </svg>

      <div className="relative flex flex-col gap-6 p-6 @2xl:flex-row @2xl:items-center @2xl:justify-between @2xl:gap-10 @2xl:p-10">
        <div className="min-w-0 max-w-[520px]">
          {eyebrow && <p className="mb-2 text-[13px] font-medium leading-5 text-fg-muted">{eyebrow}</p>}
          <H id={`${id}-title`} className="text-balance text-[24px] font-medium leading-[30px] tracking-[-0.022em] text-fg @2xl:text-[28px] @2xl:leading-[34px]">
            {title}
          </H>
          {description && <p className="mt-2 text-pretty text-[15px] leading-[22px] text-fg-muted">{description}</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-3 @md:flex-row @md:items-center">
          <Action a={primary} className={`${btn} group bg-[image:var(--grad-primary)] text-[var(--inverse-fg)] shadow-[var(--shadow-btn-primary)]`}>
            {primary.label}
            <ArrowRight size={16} strokeWidth={1.5} aria-hidden className="transition-transform duration-200 motion-safe:group-hover:translate-x-0.5" />
          </Action>
          {secondary && (
            <Action a={secondary} className={`${btn} bg-subtle text-fg shadow-[var(--shadow-btn-secondary)] dark:bg-raised`}>
              {secondary.label}
            </Action>
          )}
        </div>
      </div>
    </section>
  );
}
