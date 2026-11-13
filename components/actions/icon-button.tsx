"use client";

import { useSyncExternalStore } from "react";
import type { ComponentProps, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type IconButtonVariant = "solid" | "outline" | "ghost" | "soft";
export type IconButtonShape = "circle" | "square";
export type IconButtonSize = "xs" | "sm" | "md" | "lg";

type NativeButton = Omit<ComponentProps<"button">, "children" | "onAnimationStart" | "onAnimationEnd" | "onDrag" | "onDragStart" | "onDragEnd">;

export interface IconButtonProps extends NativeButton {
  /** Required: the button has no visible text. Mention the indicator too, e.g. "Notifications, 3 unread". */
  "aria-label": string;
  /** The glyph. Sized for you: 16 px at XS, 20 px from SM. */
  children: ReactNode;
  /** The Figma "Style" axis. */
  variant?: IconButtonVariant;
  shape?: IconButtonShape;
  /** 28, 32, 36 and 40 px. */
  size?: IconButtonSize;
  /** A small dot in the top corner, e.g. unread notifications. It pops in and out. */
  indicator?: boolean;
}

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;

const SIZES: Record<IconButtonSize, { box: string; round: string; dot: string }> = {
  xs: { box: "size-7 [&_svg]:size-4", round: "rounded-[10px]", dot: "right-0.5 top-0.5 size-[7px]" },
  sm: { box: "size-8 [&_svg]:size-5", round: "rounded-[12px]", dot: "right-0.5 top-0.5 size-2" },
  md: { box: "size-9 [&_svg]:size-5", round: "rounded-[14px]", dot: "right-[3px] top-[3px] size-2" },
  lg: { box: "size-10 [&_svg]:size-5", round: "rounded-[14px]", dot: "right-[3px] top-[3px] size-2.5" },
};

// Hover and press tint a ::before layer under the glyph, so each fill keeps its colour.
const VARIANTS: Record<IconButtonVariant, string> = {
  solid:
    "bg-[image:var(--grad-primary)] text-[var(--inverse-fg)] shadow-[var(--shadow-btn-primary)] before:bg-[var(--inverse-fg)] hover:before:opacity-[0.08] active:before:opacity-[0.14]",
  // In Dark a surface fill reads like Soft, so Outline keeps only its line there (as on Button).
  outline:
    "bg-surface text-fg shadow-[0_0_0_1px_var(--border-soft)] before:bg-fg hover:before:opacity-[0.04] active:before:opacity-[0.08] dark:bg-transparent dark:shadow-[0_0_0_1px_var(--border)]",
  ghost: "text-fg-muted before:bg-fg hover:text-fg hover:before:opacity-[0.06] active:before:opacity-[0.1]",
  soft: "bg-muted text-fg before:bg-fg hover:before:opacity-[0.04] active:before:opacity-[0.1]",
};

export function IconButton({
  variant = "ghost",
  shape = "circle",
  size = "md",
  indicator = false,
  type = "button",
  disabled,
  children,
  className = "",
  ...rest
}: IconButtonProps) {
  const reduce = useReduce();
  const s = SIZES[size];

  return (
    <motion.button
      {...rest}
      type={type}
      disabled={disabled}
      whileTap={reduce ? undefined : { scale: disabled ? 1 : 0.92 }}
      transition={spring}
      className={`relative isolate inline-grid shrink-0 select-none place-items-center outline-none transition-[box-shadow,color,opacity] before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:opacity-0 before:transition-opacity before:duration-150 focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:pointer-events-none disabled:opacity-[0.45] ${s.box} ${shape === "circle" ? "rounded-full" : s.round} ${VARIANTS[variant]} ${className}`}
    >
      {children}
      <AnimatePresence initial={false}>
        {indicator && (
          <motion.span
            key="indicator"
            aria-hidden
            className={`absolute rounded-full bg-danger ring-2 ring-[var(--surface)] ${s.dot}`}
            initial={reduce ? { opacity: 0 } : { scale: 0 }}
            animate={reduce ? { opacity: 1 } : { scale: 1 }}
            exit={reduce ? { opacity: 0 } : { scale: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 22 }}
          />
        )}
      </AnimatePresence>
    </motion.button>
  );
}
