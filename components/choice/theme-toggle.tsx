"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { Moon, Sun } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type ThemeMode = "light" | "dark";

export interface ThemeToggleProps {
  value?: ThemeMode;
  defaultValue?: ThemeMode;
  onValueChange?: (mode: ThemeMode) => void;
  /** Icons only (74 × 36, for headers and sidebars) or the mode names (138 × 36, for settings pages). */
  content?: "icons" | "labels";
  /** The names of the two modes: shown with `content="labels"`, and always the radios' accessible names. */
  lightLabel?: string;
  darkLabel?: string;
  /** Swap the 16 px glyphs (Lucide Sun and Moon by default). */
  lightIcon?: ReactNode;
  darkIcon?: ReactNode;
  disabled?: boolean;
  className?: string;
  /** Names the group (default "Theme"). */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** Ties the group to a note, such as a settings row's hint. */
  "aria-describedby"?: string;
}

// "Spring Gentle" on the kit's 180 ms base: the thumb slides and the picked glyph turns upright.
const gentle = { type: "spring", visualDuration: 0.18, bounce: 0.18 } as const;
const ring = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
// The glyph angles (CSS, clockwise) when the mode is not picked: the sun turns back 45°, the moon tips 30° so its
// opening faces right. Picking a mode turns its glyph upright.
const REST = { light: -45, dark: 30 } as const;

/**
 * Light or Dark: two segments on a grey track, one white thumb that slides under the picked mode.
 * It only reports the choice; apply the theme yourself (a `.dark` class, a data attribute, a cookie).
 */
export function ThemeToggle({
  value,
  defaultValue = "light",
  onValueChange,
  content = "icons",
  lightLabel = "Light",
  darkLabel = "Dark",
  lightIcon,
  darkIcon,
  disabled = false,
  className = "",
  "aria-label": ariaLabel,
  "aria-labelledby": labelledBy,
  "aria-describedby": describedBy,
}: ThemeToggleProps) {
  const reduce = useReduce();
  const [own, setOwn] = useState<ThemeMode>(defaultValue);
  const mode = value ?? own;
  const labels = content === "labels";
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  // One motion value places the thumb (0 Light, 1 Dark). The segments split the track in two equal columns, so
  // the thumb's left edge runs from 4 px to half the track plus 1 px (the 2 px gap): true at any width or zoom.
  const t = useMotionValue(mode === "dark" ? 1 : 0);
  const left = useTransform(t, (v) => `calc(4px + ${v.toFixed(4)} * (50% - 3px))`);
  useEffect(() => {
    const to = mode === "dark" ? 1 : 0;
    if (reduce) {
      t.set(to);
      return;
    }
    const run = animate(t, to, gentle);
    return () => run.stop();
  }, [mode, reduce, t]);

  const pick = (next: ThemeMode) => {
    if (disabled || next === mode) return;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const next: ThemeMode | undefined =
      e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "End"
        ? "dark"
        : e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "Home"
          ? "light"
          : undefined;
    if (!next) return;
    e.preventDefault();
    buttons.current[next === "light" ? 0 : 1]?.focus();
    pick(next);
  };

  const segments = [
    { mode: "light" as const, label: lightLabel, icon: lightIcon ?? <Sun size={16} strokeWidth={1.5} /> },
    { mode: "dark" as const, label: darkLabel, icon: darkIcon ?? <Moon size={16} strokeWidth={1.5} /> },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : (ariaLabel ?? "Theme")}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-disabled={disabled || undefined}
      className={`relative inline-grid h-9 shrink-0 grid-cols-[1fr_1fr] gap-0.5 rounded-full bg-muted p-1 transition-colors duration-200 ${disabled ? "opacity-50" : ""} ${className}`}
    >
      <motion.span
        aria-hidden
        style={{ left, width: "calc(50% - 5px)" }}
        className="absolute inset-y-1 rounded-full bg-surface shadow-[inset_0_0_0_1px_var(--border)] transition-colors duration-200 dark:shadow-none"
      />
      {segments.map((s, i) => {
        const on = s.mode === mode;
        return (
          <button
            key={s.mode}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={labels ? undefined : s.label}
            title={labels ? undefined : s.label}
            tabIndex={on && !disabled ? 0 : -1}
            disabled={disabled}
            onClick={() => pick(s.mode)}
            onKeyDown={onKeyDown}
            className={`relative flex h-7 min-w-0 items-center justify-center whitespace-nowrap rounded-full transition-colors duration-200 disabled:cursor-not-allowed ${
              labels ? "min-w-16 px-3 text-[13px] font-medium leading-5 tracking-[-0.003em]" : "w-8"
            } ${on ? "text-fg" : labels ? "text-fg-muted enabled:hover:text-fg" : "text-fg-subtle enabled:hover:text-fg"} ${ring}`}
          >
            {labels ? (
              s.label
            ) : (
              <motion.span
                aria-hidden
                initial={false}
                animate={{ rotate: on ? 0 : REST[s.mode] }}
                transition={reduce ? { duration: 0 } : gentle}
                className="grid size-4 place-items-center [&_svg]:size-4"
              >
                {s.icon}
              </motion.span>
            )}
          </button>
        );
      })}
    </div>
  );
}
