"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";

/* The AI mark: an outlined 4-point star, a small filled star and a dot, in violet. */
function AiSparkle({ size = 20, className = "", tone = "text-[#8C59FF] dark:text-[#B4A0FF]" }: { size?: number; className?: string; tone?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden className={`shrink-0 ${tone} ${className}`}>
      <path
        d="M8.88033 4.82409C9.43217 8.42571 11.509 10.5025 15.1106 11.0544C11.509 11.6062 9.43217 13.683 8.88033 17.2846C8.32849 13.683 6.25168 11.6062 2.65007 11.0544C6.25168 10.5025 8.32849 8.42571 8.88033 4.82409Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15.6334 2.03572C15.8658 3.40089 16.6645 4.19958 18.0297 4.43198C16.6645 4.66437 15.8658 5.46306 15.6334 6.82823C15.401 5.46306 14.6023 4.66437 13.2372 4.43198C14.6023 4.19958 15.401 3.40089 15.6334 2.03572Z"
        fill="currentColor"
      />
      <circle cx="16.2434" cy="14.3655" r="0.915" fill="currentColor" />
    </svg>
  );
}

export interface Suggestion {
  label: string;
  /** Second line, used by the cards style. */
  description?: string;
  icon?: ReactNode;
}

export interface SuggestionsProps {
  items: Suggestion[];
  /** chips under the composer, cards on an empty chat, list in a side panel. */
  variant?: "chips" | "cards" | "list";
  onSelect?: (label: string) => void;
  className?: string;
}

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

const ring = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
// The kit's secondary hover: 4% of the text colour over the surface (a touch darker in Light, lighter in Dark).
const hoverTint = "hover:bg-[color-mix(in_srgb,var(--fg)_4%,var(--surface))]";

// Each suggestion rises in after the one before; with reduced motion it only fades in.
const enter = (i: number, reduce: boolean) => ({
  initial: reduce ? { opacity: 0 } : { opacity: 0, y: 8 },
  animate: reduce ? { opacity: 1 } : { opacity: 1, y: 0 },
  transition: { type: "spring" as const, stiffness: 480, damping: 32, delay: 0.05 * i },
});

export function Suggestions({ items, variant = "chips", onSelect, className = "" }: SuggestionsProps) {
  const reduce = useReduce();
  if (variant === "cards") {
    return (
      // Two columns once the container (not the screen) has room for them.
      <div className={`@container w-full ${className}`}>
        <div className="grid gap-3 @[480px]:grid-cols-2">
          {items.map((it, i) => (
            <motion.button
              key={it.label}
              type="button"
              onClick={() => onSelect?.(it.label)}
              {...enter(i, reduce)}
              whileHover={reduce ? undefined : { y: -2 }}
              whileTap={reduce ? undefined : { scale: 0.98 }}
              className={`flex flex-col items-start justify-start rounded-[20px] bg-surface p-4 text-left shadow-[var(--shadow-card)] transition-colors ${hoverTint} ${ring}`}
            >
              <span className="grid size-8 place-items-center rounded-[10px] bg-[#eeecfc] text-[#5847c9] dark:bg-[#7c6cf0]/20 dark:text-[#b9afff]">{it.icon ?? <AiSparkle size={16} />}</span>
              <span className="mt-3 block text-[15px] font-medium text-fg">{it.label}</span>
              {it.description && <span className="mt-1 block text-pretty text-sm text-fg-muted">{it.description}</span>}
            </motion.button>
          ))}
        </div>
      </div>
    );
  }
  if (variant === "list") {
    return (
      <ul className={`w-full ${className}`}>
        {items.map((it, i) => (
          <motion.li key={it.label} {...enter(i, reduce)}>
            <button
              type="button"
              onClick={() => onSelect?.(it.label)}
              className={`group/sug flex w-full items-center gap-3 rounded-[12px] px-2 py-2.5 text-left text-[15px] text-fg transition-colors hover:bg-subtle ${ring}`}
            >
              <span className="text-fg">{it.icon ?? <AiSparkle size={16} />}</span>
              <span className="flex-1">{it.label}</span>
              {/* Shown on hover and focus only, so a resting list reads as prompts, not links. */}
              <ArrowRight
                size={16}
                strokeWidth={1.5}
                aria-hidden
                className={`text-fg-muted opacity-0 transition-[opacity,translate] group-hover/sug:opacity-100 group-focus-visible/sug:opacity-100 ${reduce ? "" : "-translate-x-1 group-hover/sug:translate-x-0 group-focus-visible/sug:translate-x-0"}`}
              />
            </button>
          </motion.li>
        ))}
      </ul>
    );
  }
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((it, i) => (
        <motion.button
          key={it.label}
          type="button"
          onClick={() => onSelect?.(it.label)}
          {...enter(i, reduce)}
          whileHover={reduce ? undefined : { y: -2 }}
          whileTap={reduce ? undefined : { scale: 0.97 }}
          // Outline chips, no fill (owner, Nov 14), the same soft stroke as the Message source badges.
          className={`inline-flex h-8 items-center gap-1.5 rounded-full bg-transparent pl-2.5 pr-3 text-sm leading-5 text-fg shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--fg)_14%,transparent)] transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_4%,transparent)] ${ring}`}
        >
          {it.icon ?? <AiSparkle size={16} />}
          {it.label}
        </motion.button>
      ))}
    </div>
  );
}
