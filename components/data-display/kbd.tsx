"use client";

import { Fragment, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type KbdVariant = "outline" | "soft" | "inverse";
export type KbdSize = "sm" | "md";

type NativeKbd = Omit<ComponentProps<"kbd">, "onAnimationStart" | "onAnimationEnd" | "onDrag" | "onDragStart" | "onDragEnd">;

export interface KbdProps extends NativeKbd {
  /** The Figma "Style" axis. Inverse sits on dark fills: a Primary button, a tooltip. */
  variant?: KbdVariant;
  /** 20 or 22 px tall. */
  size?: KbdSize;
  /** Draws the key held down: it sinks 1 px and darkens. Wire it to real key presses. */
  pressed?: boolean;
}

export interface KbdComboProps extends Omit<ComponentProps<"kbd">, "children"> {
  /** The keys in order, e.g. ["⌘", "K"]. */
  keys: string[];
  variant?: KbdVariant;
  size?: KbdSize;
  /** Between keys: nothing for a chord (⌘ K), or a word for a sequence (G then I). */
  separator?: ReactNode;
  /** Labels of the keys to draw held down, e.g. ["⌘"]. */
  pressed?: string[];
}

// Symbol keys get a readable name as a tooltip.
const NAMES: Record<string, string> = {
  "⌘": "Command",
  "⇧": "Shift",
  "⌥": "Option",
  "⌃": "Control",
  "↵": "Enter",
  "⌫": "Backspace",
  "⇥": "Tab",
  "⎋": "Escape",
  "↑": "Up arrow",
  "↓": "Down arrow",
  "←": "Left arrow",
  "→": "Right arrow",
};

const VARIANTS: Record<KbdVariant, { up: string; down: string }> = {
  outline: {
    up: "bg-surface text-fg-muted shadow-[var(--shadow-hairline),inset_0_-1px_0_var(--edge)]",
    down: "bg-muted text-fg shadow-[var(--shadow-hairline)]",
  },
  soft: { up: "bg-muted text-fg-muted", down: "bg-track text-fg" },
  inverse: {
    up: "bg-[color-mix(in_srgb,var(--inverse-fg)_18%,var(--inverse))] text-[color:color-mix(in_srgb,var(--inverse-fg)_70%,transparent)]",
    down: "bg-[color-mix(in_srgb,var(--inverse-fg)_30%,var(--inverse))] text-[color:var(--inverse-fg)]",
  },
};

const SIZES: Record<KbdSize, string> = {
  sm: "h-5 min-w-5 px-1 [&_svg]:size-3.5",
  md: "h-[22px] min-w-[22px] px-1.5 [&_svg]:size-4",
};

export function Kbd({ variant = "outline", size = "sm", pressed = false, title, children, className = "", ...rest }: KbdProps) {
  const reduce = useReduce();
  const v = VARIANTS[variant];
  const name = typeof children === "string" ? NAMES[children] : undefined;
  return (
    <motion.kbd
      {...rest}
      title={title ?? name}
      initial={false}
      animate={{ y: pressed && !reduce ? 1 : 0 }}
      transition={{ type: "spring", stiffness: 520, damping: 34 }}
      className={`inline-grid shrink-0 place-items-center rounded-[8px] font-sans text-[12px] font-medium leading-4 transition-[background-color,color,box-shadow] duration-150 ${SIZES[size]} ${pressed ? v.down : v.up} ${className}`}
    >
      {/* Symbol keys read as their name ("Command"), not the raw glyph. */}
      {name ? (
        <>
          <span aria-hidden>{children}</span>
          <span className="sr-only">{name}</span>
        </>
      ) : (
        children
      )}
    </motion.kbd>
  );
}

export function KbdCombo({ keys, variant = "outline", size = "sm", separator, pressed = [], className = "", ...rest }: KbdComboProps) {
  return (
    <kbd {...rest} className={`inline-flex items-center gap-1 font-sans ${className}`}>
      {keys.map((k, i) => (
        <Fragment key={`${k}-${i}`}>
          {i > 0 && separator != null && (
            <span className={`px-0.5 text-[12px] font-normal ${variant === "inverse" ? "text-[color:color-mix(in_srgb,var(--inverse-fg)_64%,transparent)]" : "text-fg-muted"}`}>{separator}</span>
          )}
          <Kbd variant={variant} size={size} pressed={pressed.includes(k)}>
            {k}
          </Kbd>
        </Fragment>
      ))}
    </kbd>
  );
}
