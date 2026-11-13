"use client";

import { useEffect, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Copy } from "lucide-react";

export interface PromptAssistant {
  name: string;
  /** A 16–20 px mark, e.g. the assistant's logo. */
  icon: ReactNode;
}

export interface CopyPromptBoxProps {
  /** The prompt people paste into their assistant. */
  prompt: string;
  /** The line above the prompt. */
  label?: ReactNode;
  /** Small marks on the right of the label, read as "Works with Claude, ChatGPT…". */
  assistants?: PromptAssistant[];
  copyLabel?: string;
  copiedLabel?: string;
  /** How long the Copied state stays, in ms. Default 2000. */
  resetAfter?: number;
  /** Called after the copy, with the prompt (also when the clipboard is blocked; Copied then isn't shown). */
  onCopy?: (prompt: string) => void;
  className?: string;
}

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

const noSubscribe = () => () => {};

/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export function CopyPromptBox({
  prompt,
  label = "Using an AI assistant? Paste this:",
  assistants,
  copyLabel = "Copy prompt",
  copiedLabel = "Copied",
  resetAfter = 2000,
  onCopy,
  className = "",
}: CopyPromptBoxProps) {
  const reduce = useReduce();
  const id = useId();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), resetAfter);
    return () => clearTimeout(t);
  }, [copied, round, resetAfter]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyFailed(false);
      setCopied(true);
      setRound((r) => r + 1);
    } catch {
      /* Clipboard blocked: no Copied state; onCopy still gets the text. */
      setCopied(false);
      setCopyFailed(true);
    }
    onCopy?.(prompt);
  };

  const swap = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 } };

  return (
    <div className={`@container w-full max-w-[560px] rounded-[20px] bg-subtle p-5 dark:shadow-[var(--shadow-card)] dark:bg-surface ${className}`}>
      {/* Narrow boxes tighten the gap and the assistant stack, so the default label stays on one line at a 390 px screen. */}
      <div className="flex items-center justify-between gap-2 @sm:gap-3">
        <p id={`${id}-label`} className="min-w-0 text-pretty text-[13px] leading-5 tracking-[-0.003em] text-fg-muted">
          {label}
        </p>
        {assistants && assistants.length > 0 && (
          <ul aria-label={`Works with ${assistants.map((a) => a.name).join(", ")}`} className="flex shrink-0 items-center">
            {assistants.map((a, i) => (
              <li
                key={a.name}
                title={a.name}
                className={`grid size-6 place-items-center rounded-full @sm:size-7 bg-surface shadow-[0_0_0_2px_var(--subtle),var(--shadow-hairline)] dark:bg-raised dark:shadow-[0_0_0_2px_var(--surface),var(--shadow-hairline)] ${i ? "-ml-1 @sm:-ml-1.5" : ""}`}
              >
                {a.icon}
                <span className="sr-only">{a.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-3 @md:flex-row @md:items-center @md:gap-4">
        <div role="group" aria-labelledby={`${id}-label`} className="relative min-w-0 flex-1 overflow-hidden rounded-[14px]">
          <p className="select-all text-[15px] leading-[22px] tracking-[-0.009em] text-fg">
            {prompt}
          </p>
          {/* A soft light passes over the text once it is copied. */}
          <AnimatePresence>
            {copied && !reduce && (
              <motion.span
                key={round}
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--surface)_70%,transparent),transparent)] dark:bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.08),transparent)]"
                initial={{ x: "-100%" }}
                animate={{ x: "220%" }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              />
            )}
          </AnimatePresence>
        </div>

        <motion.button
          type="button"
          onClick={copy}
          whileTap={reduce ? undefined : { scale: 0.97 }}
          className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start whitespace-nowrap rounded-full bg-surface px-4 text-[14px] font-medium leading-5 tracking-[-0.006em] text-fg shadow-[var(--shadow-btn-secondary)] @md:self-auto dark:bg-raised ${focusRing}`}
        >
          <span className="relative grid size-5 place-items-center">
            <AnimatePresence initial={false} mode="popLayout">
              {copied ? (
                <motion.svg
                  key="check"
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <motion.path
                    d="M5 12.5l4.5 4.5L19 7.5"
                    initial={{ pathLength: reduce ? 1 : 0 }}
                    animate={{ pathLength: 1 }}
                    transition={reduce ? { duration: 0 } : { duration: 0.32, ease: "easeOut" }}
                  />
                </motion.svg>
              ) : (
                <motion.span
                  key="copy"
                  className="grid place-items-center"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
                  transition={reduce ? { duration: 0.15 } : spring}
                >
                  <Copy size={20} strokeWidth={1.5} aria-hidden />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          {/* Both labels share one grid cell, so the button keeps the wider width and never jumps. */}
          <span className="relative grid overflow-hidden">
            <span aria-hidden className="invisible col-start-1 row-start-1">
              {copyLabel}
            </span>
            <span aria-hidden className="invisible col-start-1 row-start-1">
              {copiedLabel}
            </span>
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span key={copied ? "on" : "off"} {...swap} transition={reduce ? { duration: 0.15 } : spring} className="col-start-1 row-start-1 text-left">
                {copied ? copiedLabel : copyLabel}
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.button>
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Prompt copied to the clipboard" : copyFailed ? "Couldn't copy. Select the prompt to copy it." : ""}
      </span>
    </div>
  );
}
