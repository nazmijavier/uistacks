"use client";

import { useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

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

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export interface StarterItem {
  id: string;
  /** The prompt the card sends, e.g. "Summarize yesterday's Zoom calls". */
  prompt: string;
  /** The app it uses, under the prompt on cards. */
  app?: string;
  /** A 20 px glyph or app mark, shown bare in the 32 px tile (the tile draws the background). */
  icon?: ReactNode;
}

export interface StarterCardsProps {
  items: StarterItem[];
  /** card: a grid of cards at least 200 px wide that fill the row, up to four across (964 px); under 400 px the single column hugs its text. row: a list in a side panel. */
  layout?: "card" | "row";
  onSelect?: (item: StarterItem) => void;
  disabled?: boolean;
  className?: string;
}

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
const spring = { type: "spring", stiffness: 420, damping: 34 } as const;

export function StarterCards({ items, layout = "card", onSelect, disabled = false, className = "" }: StarterCardsProps) {
  const reduce = Boolean(useReduce());
  const ref = useRef<HTMLDivElement>(null);
  const card = layout === "card";

  // Arrow keys move between the starters; in the grid, up and down jump a row.
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-starter]") ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    let cols = 1;
    if (card && items.length > 1) {
      const top = items[0].offsetTop;
      cols = items.filter((el) => el.offsetTop === top).length;
    }
    const moves: Record<string, number> = card
      ? { ArrowRight: at + 1, ArrowLeft: at - 1, ArrowDown: at + cols, ArrowUp: at - cols, Home: 0, End: items.length - 1 }
      : { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 };
    const to = moves[e.key];
    if (to === undefined) return;
    e.preventDefault();
    items[Math.max(0, Math.min(items.length - 1, to))]?.focus();
  };

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Suggested prompts"
      onKeyDown={onKey}
      className={card ? `@container mx-auto grid w-full max-w-[964px] grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 ${className}` : `flex w-full flex-col gap-1 ${className}`}
    >
      {items.map((it, i) => (
        <motion.button
          key={it.id}
          type="button"
          data-starter
          disabled={disabled}
          onClick={() => onSelect?.(it)}
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: reduce ? 0 : i * 0.05 }}
          whileHover={reduce || !card ? undefined : { y: -2 }}
          whileTap={reduce ? undefined : { scale: 0.97 }}
          className={`text-left transition-colors disabled:pointer-events-none disabled:opacity-50 ${focusRing} ${
            card
              ? "flex min-h-[140px] flex-col rounded-[20px] @max-[400px]:min-h-0 bg-surface p-4 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--fg)_10%,transparent)] hover:bg-subtle"
              : "flex min-h-11 items-center gap-3 rounded-[12px] px-2 py-1.5 hover:bg-subtle"
          }`}
        >
          {/* White tile with a hairline for an app glyph (owner, Nov 14: no grey fill); the soft violet AI tile only for the sparkle fallback. */}
          <span
            className={`grid size-8 shrink-0 place-items-center rounded-[10px] [&_svg]:size-5 ${
              it.icon ? "bg-surface text-fg shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--fg)_10%,transparent)]" : "bg-[#eeecfc] text-[#5847c9] dark:bg-[#7c6cf0]/20 dark:text-[#b9afff]"
            }`}
          >
            {it.icon ?? <AiSparkle size={20} />}
          </span>
          {card ? (
            <>
              <span className="mt-3 line-clamp-2 text-[14px] leading-5 text-fg">{it.prompt}</span>
              {it.app && <span className="mt-auto truncate pt-3 text-[12px] leading-4 text-fg-muted">{it.app}</span>}
            </>
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate text-[14px] leading-5 text-fg">{it.prompt}</span>
              {it.app && <span className="shrink-0 text-[12px] leading-4 text-fg-muted">{it.app}</span>}
            </>
          )}
        </motion.button>
      ))}
    </div>
  );
}
