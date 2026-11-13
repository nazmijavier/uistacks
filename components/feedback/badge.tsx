"use client";

import { useSyncExternalStore } from "react";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Zap } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "pro";
export type BadgeVariant = "soft" | "outline" | "solid";
export type BadgeSize = "sm" | "md" | "lg";

export interface BadgeProps extends ComponentProps<"span"> {
  /** Pro is the plan marker: green, with a bolt. */
  tone?: BadgeTone;
  /** The Figma "Style" axis. Use Outline on a tinted row, where Soft would disappear. */
  variant?: BadgeVariant;
  /** 18, 20 and 24 px tall. */
  size?: BadgeSize;
  /** A dot before the label. */
  dot?: boolean;
  /** An icon before the label, in place of the dot. */
  icon?: ReactNode;
  /** Announce label changes to screen readers (for a status that updates, e.g. "Syncing" to "Synced"). */
  live?: boolean;
}

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;

// Each tone is a set of variables built from the UI Stacks tokens. Text mixes the hue with --fg,
// so it reads on the soft fill in light and dark.
const hue = (token: string, text: string, solid: string, on: string) =>
  ({
    "--tone": `var(${token})`,
    "--tone-soft": `var(${token}-soft)`,
    "--tone-text": text,
    "--tone-edge": `color-mix(in srgb, var(${token}) 38%, transparent)`,
    "--tone-solid": solid,
    "--tone-on": on,
  }) as CSSProperties;

const mixFg = (token: string, pct: number) => `color-mix(in srgb, var(${token}) ${pct}%, var(--fg))`;

const TONES: Record<BadgeTone, CSSProperties> = {
  neutral: {
    "--tone": "var(--fg-subtle)",
    "--tone-soft": "color-mix(in srgb, var(--fg) 6%, transparent)",
    "--tone-text": "var(--fg-muted)",
    "--tone-edge": "var(--border-soft)",
    "--tone-solid": "var(--inverse)",
    "--tone-on": "var(--inverse-fg)",
  } as CSSProperties,
  // Solid fills follow one rule per mode: deep with light text in Light, light with dark text in Dark.
  accent: hue("--select", "var(--select-text)", "var(--select-text)", "var(--inverse-fg)"),
  success: hue("--success", mixFg("--success", 62), mixFg("--success", 80), "var(--inverse-fg)"),
  warning: hue("--warning", mixFg("--warning", 62), "var(--warning)", "color-mix(in srgb, var(--warning) 25%, black)"),
  danger: hue("--danger", mixFg("--danger", 62), mixFg("--danger", 80), "var(--inverse-fg)"),
  pro: hue("--success", mixFg("--success", 62), mixFg("--success", 80), "var(--inverse-fg)"),
};

const VARIANTS: Record<BadgeVariant, string> = {
  soft: "bg-[var(--tone-soft)] text-[color:var(--tone-text)]",
  outline: "bg-surface text-[color:var(--tone-text)] shadow-[inset_0_0_0_1px_var(--tone-edge)]",
  solid: "bg-[var(--tone-solid)] text-[color:var(--tone-on)]",
};

const SIZES: Record<BadgeSize, { box: string; dot: number; icon: string }> = {
  sm: { box: "h-[18px] gap-1 px-1.5 text-[12px] leading-4", dot: 6, icon: "[&_svg]:size-3" },
  md: { box: "h-5 gap-1 px-2 text-[12px] leading-4", dot: 6, icon: "[&_svg]:size-3.5" },
  lg: { box: "h-6 gap-1.5 px-2.5 text-[13px] leading-5", dot: 8, icon: "[&_svg]:size-4" },
};

export function Badge({ tone = "neutral", variant = "soft", size = "md", dot = false, icon, live = false, children, className = "", style, ...rest }: BadgeProps) {
  const reduce = useReduce();
  const s = SIZES[size];
  const lead = icon ?? (tone === "pro" ? <Zap fill="currentColor" strokeWidth={1.5} /> : null);
  // A new label slides in; any other content just updates.
  const labelKey = typeof children === "string" || typeof children === "number" ? String(children) : "label";

  return (
    <motion.span
      {...(rest as ComponentProps<typeof motion.span>)}
      // The pill eases to a new label's width with the label's spring.
      layout={reduce ? false : "size"}
      transition={spring}
      style={{ ...TONES[tone], borderRadius: 9999, ...style }}
      className={`relative inline-flex shrink-0 items-center overflow-hidden whitespace-nowrap rounded-full font-medium transition-[background-color,color,box-shadow] duration-200 ${s.box} ${VARIANTS[variant]} ${className}`}
    >
      {lead ? (
        <span className={`grid shrink-0 place-items-center ${s.icon}`}>{lead}</span>
      ) : dot ? (
        // An SVG circle stays round at any zoom.
        <motion.svg
          key={tone}
          aria-hidden
          layout={reduce ? false : "position"}
          width={s.dot}
          height={s.dot}
          viewBox="0 0 8 8"
          className={`shrink-0 ${variant === "soft" ? "text-[var(--tone)]" : ""}`}
          initial={reduce ? false : { scale: 0.3 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 520, damping: 20 }}
        >
          <circle cx={4} cy={4} r={4} fill="currentColor" />
        </motion.svg>
      ) : null}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={labelKey}
          layout={reduce ? false : "position"}
          // With `live`, the sr-only copy below is what assistive tech reads (the exiting label would be read twice).
          aria-hidden={live || undefined}
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduce ? 0 : -8 }}
          transition={spring}
        >
          {children}
        </motion.span>
      </AnimatePresence>
      {live && (
        <span className="sr-only" role="status" aria-live="polite">
          {children}
        </span>
      )}
    </motion.span>
  );
}
