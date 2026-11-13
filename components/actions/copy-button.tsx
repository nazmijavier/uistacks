"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Copy } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type CopyButtonSize = "sm" | "md";
export type CopyButtonVariant = "ghost" | "secondary";

export interface CopyButtonProps {
  /** What gets copied. */
  value: string;
  /** A visible label, e.g. "Copy". Leave it out for an icon-only button. */
  label?: string;
  /** Names the button for screen readers, e.g. "Copy install command". Defaults to the label or "Copy". */
  "aria-label"?: string;
  /** The label while Copied shows. */
  copiedLabel?: string;
  /** 28 or 36 px tall. */
  size?: CopyButtonSize;
  /** Ghost for rows and code blocks, secondary for a button on its own. */
  variant?: CopyButtonVariant;
  /** How long Copied stays (ms). */
  copiedFor?: number;
  /** Called after the text is on the clipboard. */
  onCopy?: (value: string) => void;
  /** Called when the clipboard refused; the text is selected so ⌘C / Ctrl+C still works. */
  onCopyError?: (error: unknown) => void;
  disabled?: boolean;
  className?: string;
}

const spring = { type: "spring", stiffness: 520, damping: 32 } as const;
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

const SIZES: Record<CopyButtonSize, { box: string; icon: string; text: string }> = {
  sm: { box: "h-7 px-2.5 gap-1.5", icon: "size-7", text: "text-[12px] leading-4" },
  md: { box: "h-9 px-3.5 gap-2", icon: "size-9", text: "text-[14px] leading-5" },
};
const VARIANTS: Record<CopyButtonVariant, string> = {
  ghost: "bg-transparent hover:bg-fg/[0.06]",
  secondary:
    "bg-surface shadow-[var(--shadow-btn-secondary)] before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-full before:bg-fg before:opacity-0 before:transition-opacity hover:before:opacity-[0.04] dark:bg-raised",
};

type State = "idle" | "copied" | "manual";

export function CopyButton({
  value,
  label,
  "aria-label": ariaLabel,
  copiedLabel = "Copied",
  size = "md",
  variant = "ghost",
  copiedFor = 2000,
  onCopy,
  onCopyError,
  disabled = false,
  className = "",
}: CopyButtonProps) {
  const reduce = useReduce();
  const [state, setState] = useState<State>("idle");
  // Bumped on every copy so a second click restarts the timer.
  const [round, setRound] = useState(0);
  const [said, setSaid] = useState("");
  const [mac, setMac] = useState(true);
  const hidden = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const s = SIZES[size];
  const name = ariaLabel ?? label ?? "Copy";

  useEffect(() => {
    if (state !== "copied") return;
    const t = setTimeout(() => setState("idle"), copiedFor);
    return () => clearTimeout(t);
  }, [state, round, copiedFor]);

  // The same line twice is not read again, so every new line toggles a trailing space.
  const say = (line: string) => setSaid((prev) => line + (prev.endsWith(" ") ? "" : " "));

  const done = () => {
    setState("copied");
    setRound((r) => r + 1);
    say(`${copiedLabel}`);
    onCopy?.(value);
  };

  const copy = async () => {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(value);
      done();
    } catch (error) {
      // The clipboard API is blocked: select the text in the hidden field and try the older copy command.
      const el = hidden.current;
      let ok = false;
      if (el) {
        el.focus({ preventScroll: true });
        el.select();
        try {
          ok = document.execCommand("copy");
        } catch {}
      }
      if (ok) {
        button.current?.focus({ preventScroll: true });
        done();
        return;
      }
      // Still nothing: the text stays selected for ⌘C / Ctrl+C, and the hint says so.
      const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
      setMac(isMac);
      setState("manual");
      say(`Couldn’t copy. The text is selected, press ${isMac ? "Command" : "Control"} C.`);
      onCopyError?.(error);
    }
  };

  const copied = state === "copied";
  const fade = reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 };
  const bubble = state === "manual" ? `Press ${mac ? "⌘C" : "Ctrl+C"}` : copied && !label ? copiedLabel : null;

  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <button
        ref={button}
        type="button"
        aria-label={name}
        disabled={disabled}
        onClick={copy}
        className={`relative isolate inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-medium transition-[scale,background-color,color] duration-150 motion-safe:active:scale-[0.95] disabled:pointer-events-none disabled:opacity-50 ${
          label ? `${s.box} ${s.text}` : s.icon
        } ${VARIANTS[variant]} ${copied ? "text-success-text" : variant === "ghost" ? "text-fg-muted hover:text-fg" : "text-fg"} ${focusRing}`}
      >
        <span aria-hidden className="grid size-4 shrink-0 place-items-center">
          <AnimatePresence mode="popLayout" initial={false}>
            {copied ? (
              <motion.svg
                key="check"
                viewBox="0 0 24 24"
                width={16}
                height={16}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={fade}
                animate={{ opacity: 1, scale: 1 }}
                exit={fade}
                transition={spring}
              >
                <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.26, ease: "easeOut", delay: 0.05 }} />
              </motion.svg>
            ) : (
              <motion.span key="copy" initial={fade} animate={{ opacity: 1, scale: 1 }} exit={fade} transition={spring} className="grid place-items-center">
                <Copy size={16} strokeWidth={1.5} />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        {/* Both labels share one cell, so the button keeps the longer one's width and nothing beside it moves. */}
        {label && (
          <span aria-hidden className="grid">
            <motion.span className="col-start-1 row-start-1 text-center" initial={false} animate={{ opacity: copied ? 0 : 1, y: copied && !reduce ? -6 : 0 }} transition={spring}>
              {label}
            </motion.span>
            <motion.span className="col-start-1 row-start-1 text-center" initial={false} animate={{ opacity: copied ? 1 : 0, y: copied || reduce ? 0 : 6 }} transition={spring}>
              {copiedLabel}
            </motion.span>
          </span>
        )}
      </button>
      {/* Copied (icon-only) or the keyboard hint, above the button. */}
      <AnimatePresence>
        {bubble && (
          <motion.span
            key={bubble}
            aria-hidden
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.96, transition: { duration: 0.12 } }}
            transition={spring}
            className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--inverse)] px-2.5 py-1 text-[12px] font-medium leading-4 text-[var(--inverse-fg)] shadow-[var(--shadow-overlay)]"
          >
            {bubble}
          </motion.span>
        )}
      </AnimatePresence>
      {/* Holds the text for the fallback: selectable but out of sight. A copy from here counts as Copied. */}
      <input
        ref={hidden}
        readOnly
        tabIndex={-1}
        aria-hidden
        value={value}
        onCopy={() => {
          if (state === "manual") done();
        }}
        onBlur={() => setState((st) => (st === "manual" ? "idle" : st))}
        className="pointer-events-none absolute left-0 top-0 size-px opacity-0"
      />
      <span className="sr-only" role="status" aria-live="polite">
        {said}
      </span>
    </span>
  );
}
