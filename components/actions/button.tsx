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

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl";
export type ButtonShape = "pill" | "rounded";

type NativeButton = Omit<ComponentProps<"button">, "onAnimationStart" | "onAnimationEnd" | "onDrag" | "onDragStart" | "onDragEnd">;

export interface ButtonProps extends NativeButton {
  /** One Primary per view. Destructive is for actions that delete or can't be undone. */
  variant?: ButtonVariant;
  /** 28, 32, 36, 40 and 48 px tall. */
  size?: ButtonSize;
  /** Pill is fully round; Rounded keeps soft corners. */
  shape?: ButtonShape;
  /** Shows a spinner and ignores clicks while keeping the width. The spinner takes the leading icon's place, or covers the label when there is no icon. */
  loading?: boolean;
  /** Before the label. Sized for you: 16 px at XS and SM, 20 px from MD. */
  leadingIcon?: ReactNode;
  /** After the label, e.g. a chevron. */
  trailingIcon?: ReactNode;
  /** Keys after the label, e.g. ["⌘", "↵"]. */
  shortcut?: string[];
}

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;

const SIZES: Record<ButtonSize, { box: string; round: string; icon: string; key: string }> = {
  xs: { box: "h-7 gap-1 px-2.5 text-[12px] leading-4", round: "rounded-[10px]", icon: "[&_svg]:size-4", key: "h-[18px] min-w-[18px] rounded-[6px]" },
  sm: { box: "h-8 gap-1.5 px-3 text-[13px] leading-[18px]", round: "rounded-[12px]", icon: "[&_svg]:size-4", key: "h-[18px] min-w-[18px] rounded-[6px]" },
  md: { box: "h-9 gap-2 px-3.5 text-[14px] leading-5", round: "rounded-[14px]", icon: "[&_svg]:size-5", key: "h-5 min-w-5 rounded-[8px]" },
  lg: { box: "h-10 gap-2 px-4 text-[15px] leading-5", round: "rounded-[14px]", icon: "[&_svg]:size-5", key: "h-5 min-w-5 rounded-[8px]" },
  xl: { box: "h-12 gap-2 px-5 text-[16px] leading-6", round: "rounded-[16px]", icon: "[&_svg]:size-5", key: "h-[22px] min-w-[22px] rounded-[8px]" },
};

// Hover and press tint a ::before layer that sits under the label, so every fill keeps its own colour.
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[image:var(--grad-primary)] text-[var(--inverse-fg)] shadow-[var(--shadow-btn-primary)] before:bg-[var(--inverse-fg)] hover:before:opacity-[0.08] active:before:opacity-[0.14]",
  secondary: "bg-surface text-fg shadow-[var(--shadow-btn-secondary)] before:bg-fg hover:before:opacity-[0.04] active:before:opacity-[0.08]",
  // In Dark the drop shadows that lift Secondary don't show, so Outline loses its fill there and keeps only the line.
  outline:
    "bg-surface text-fg shadow-[0_0_0_1px_var(--border-soft)] before:bg-fg hover:before:opacity-[0.04] active:before:opacity-[0.08] dark:bg-transparent dark:shadow-[0_0_0_1px_var(--border)]",
  ghost: "text-fg before:bg-fg hover:before:opacity-[0.06] active:before:opacity-[0.1]",
  // A deeper mix of --danger keeps the white label at AA in light (5.2:1) and dark, where --danger is lighter (5.5:1).
  destructive:
    "bg-[color-mix(in_srgb,var(--danger)_85%,black)] text-white shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_rgb(0_0_0/0.16),0_2px_4px_rgb(0_0_0/0.06)] before:bg-black hover:before:opacity-[0.08] active:before:opacity-[0.16] dark:bg-[color-mix(in_srgb,var(--danger)_72%,black)]",
};

function Spinner() {
  const reduce = useReduce();
  return (
    <motion.svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className="size-5"
      animate={reduce ? { opacity: [1, 0.4, 1] } : { rotate: 360 }}
      transition={reduce ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.75, repeat: Infinity, ease: "linear" }}
    >
      <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M17.25 10A7.25 7.25 0 0 0 10 2.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </motion.svg>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  shape = "pill",
  loading = false,
  leadingIcon,
  trailingIcon,
  shortcut,
  type = "button",
  disabled,
  onClick,
  children,
  className = "",
  ...rest
}: ButtonProps) {
  const reduce = useReduce();
  const s = SIZES[size];
  const pop = reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 };
  const shown = { opacity: 1, scale: 1 };

  return (
    <motion.button
      {...rest}
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      onClick={(e) => {
        if (loading) return e.preventDefault();
        onClick?.(e);
      }}
      // Keep whileTap mounted: removing it mid-press (Enter starts loading) would leave the button scaled down.
      whileTap={reduce ? undefined : { scale: disabled || loading ? 1 : 0.97 }}
      transition={spring}
      className={`relative isolate inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium tracking-[-0.006em] outline-none transition-[box-shadow,color,opacity] before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:opacity-0 before:transition-opacity before:duration-150 focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:pointer-events-none disabled:opacity-[0.45] data-[loading]:pointer-events-none ${s.box} ${shape === "pill" ? "rounded-full" : s.round} ${VARIANTS[variant]} ${className}`}
    >
      {leadingIcon && (
        <span className={`grid shrink-0 place-items-center [&>*]:[grid-area:1/1] ${s.icon}`}>
          <motion.span className="grid place-items-center" initial={false} animate={loading ? pop : shown} transition={spring}>
            {leadingIcon}
          </motion.span>
          <AnimatePresence initial={false}>
            {loading && (
              <motion.span key="spinner" className="grid place-items-center" initial={pop} animate={shown} exit={pop} transition={spring}>
                <Spinner />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      )}
      <motion.span
        className="inline-flex items-center gap-[inherit]"
        initial={false}
        animate={{ opacity: loading && !leadingIcon ? 0 : 1 }}
        transition={{ duration: 0.15 }}
      >
        {children}
        {trailingIcon && <span className={`grid shrink-0 place-items-center ${s.icon}`}>{trailingIcon}</span>}
        {shortcut && shortcut.length > 0 && (
          <kbd className="inline-flex items-center gap-1 font-sans">
            {/* The key glyph is a 75% tint of the label and the chip a light wash of it (the wash reads the tinted colour, so 18% lands near 14%): 5:1 or better on the neutral fills. */}
            {shortcut.map((k, i) => (
              <kbd
                key={`${k}-${i}`}
                className={`grid place-items-center bg-[color-mix(in_srgb,currentColor_18%,transparent)] px-1 font-sans text-[12px] font-medium leading-4 text-[color-mix(in_srgb,currentColor_75%,transparent)] ${s.key}`}
              >
                {k}
              </kbd>
            ))}
          </kbd>
        )}
      </motion.span>
      <AnimatePresence>
        {loading && !leadingIcon && (
          <motion.span key="cover" className={`absolute inset-0 grid place-items-center ${s.icon}`} initial={pop} animate={shown} exit={pop} transition={spring}>
            <Spinner />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
