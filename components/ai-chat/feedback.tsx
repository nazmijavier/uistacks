"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, CircleCheck, Copy, Ellipsis, RotateCw, ThumbsDown, ThumbsUp, X } from "lucide-react";

/** A filled thumb keeps the cut between the cuff and the hand (owner, Nov 13): two shapes with a gap, not one blob. */
function FilledThumb({ size, down = false }: { size: number; down?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" aria-hidden style={down ? { transform: "rotate(180deg)" } : undefined}>
      <rect x="2" y="10" width="3.5" height="12" rx="1.25" />
      <path d="M8.25 10.6 12 2a3.13 3.13 0 0 1 3 3.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H8.25Z" />
    </svg>
  );
}


export interface FeedbackProps {
  reasons?: string[];
  /** Small print in the comment card. */
  note?: string;
  /** The reply's text: Copy writes it to the clipboard and shows the check once the write succeeds. */
  text?: string;
  onCopy?: () => void;
  onRetry?: () => void;
  /** The ••• button, e.g. to open a menu. */
  onMore?: () => void;
  onFeedback?: (value: "up" | "down", detail?: { reasons: string[]; comment: string }) => void;
  /** Start with thumbs down pressed and the "What went wrong?" card open (focus doesn't move). Close, Cancel or
   * thumbs down again shuts the card and lets go of thumbs down, since nothing was sent; only Send keeps the vote. */
  defaultOpen?: boolean;
  /** Reasons that start picked. */
  defaultReasons?: string[];
  className?: string;
}

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

const DEFAULT_REASONS = ["Not accurate", "Out of date", "Missed my question", "Too long", "Something else"];
const ring = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
const iconBtn = `grid size-8 place-items-center rounded-full text-fg-muted transition hover:bg-muted hover:text-fg ${ring}`;
// The kit's buttons: hover and press tint a ::before layer under the label.
const btn = `relative isolate h-10 rounded-full px-4 text-[15px] font-medium transition-[box-shadow,color] before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:opacity-0 before:transition-opacity before:duration-150 ${ring}`;
const spring = { type: "spring", stiffness: 420, damping: 34 } as const;

export function Feedback({
  reasons = DEFAULT_REASONS,
  note = "Sent with this reply to the team.",
  text,
  onCopy,
  onRetry,
  onMore,
  onFeedback,
  defaultOpen = false,
  defaultReasons = [],
  className = "",
}: FeedbackProps) {
  const [vote, setVote] = useState<"up" | "down" | null>(defaultOpen ? "down" : null);
  const [picked, setPicked] = useState<string[]>(defaultReasons);
  const [comment, setComment] = useState("");
  const [stage, setStage] = useState<"idle" | "open" | "sent">(defaultOpen ? "open" : "idle");
  const [copied, setCopied] = useState(false);
  const reduce = useReduce();
  const downRef = useRef<HTMLButtonElement>(null);
  const focusCard = useRef(false);
  const titleId = useId();
  // Closing the card sends nothing, so thumbs down lets go too; focus goes back to it.
  const closeCard = () => {
    setStage("idle");
    setVote(null);
    downRef.current?.focus();
  };
  const cardMotion = reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 };

  return (
    <div className={`w-full max-w-[400px] ${className}`}>
      <div className="-ml-2 flex items-center gap-1">
        <button
          type="button"
          aria-label="Copy"
          className={iconBtn}
          onClick={() => {
            onCopy?.();
            const show = () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            };
            // With `text`, the check waits for the clipboard write and never shows if it fails.
            if (text === undefined) show();
            else navigator.clipboard?.writeText(text).then(show).catch(() => {});
          }}
        >
          {copied ? <Check size={20} strokeWidth={1.75} /> : <Copy size={20} strokeWidth={1.5} />}
        </button>
        <button type="button" aria-label="Try again" className={iconBtn} onClick={onRetry}>
          <RotateCw size={20} strokeWidth={1.5} />
        </button>
        {(["up", "down"] as const).map((v) => (
          <motion.button
            key={v}
            ref={v === "down" ? downRef : undefined}
            type="button"
            whileTap={reduce ? undefined : { scale: 0.85 }}
            aria-pressed={vote === v}
            aria-label={v === "up" ? "Good reply" : "Bad reply"}
            className={`${iconBtn} ${vote === v ? "text-fg" : ""}`}
            onClick={() => {
              // Thumbs down again while its card is open lets go of it, like Close.
              if (v === "down" && stage === "open") return closeCard();
              setVote(v);
              if (v === "up") {
                setStage("sent");
                onFeedback?.("up");
              } else {
                focusCard.current = stage !== "open";
                setStage("open");
              }
            }}
          >
            {vote === v ? <FilledThumb size={20} down={v === "down"} /> : v === "up" ? <ThumbsUp size={20} strokeWidth={1.5} /> : <ThumbsDown size={20} strokeWidth={1.5} />}
          </motion.button>
        ))}
        <button type="button" aria-label="More" className={iconBtn} onClick={onMore}>
          <Ellipsis size={20} strokeWidth={1.5} />
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {copied ? "Copied" : ""}
        </span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {stage === "open" && (
          <motion.div
            key="card"
            ref={(el: HTMLDivElement | null) => {
              if (el && focusCard.current) {
                focusCard.current = false;
                el.focus();
              }
            }}
            tabIndex={-1}
            role="group"
            aria-labelledby={titleId}
            initial={cardMotion}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={cardMotion}
            transition={spring}
            className="mt-2 rounded-[20px] bg-surface p-5 shadow-[var(--shadow-card)] outline-none"
          >
            <div className="flex items-center justify-between">
              <p id={titleId} className="text-base font-medium leading-6 text-fg">
                What went wrong?
              </p>
              <button type="button" aria-label="Close" className={iconBtn} onClick={closeCard}>
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {reasons.map((r) => {
                const on = picked.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== r) : [...p, r]))}
                    className={`h-9 rounded-full px-3.5 text-[15px] transition-colors ${ring} ${on ? "bg-select-soft text-select-text" : "text-fg shadow-[inset_0_0_0_1px_var(--border)] hover:bg-subtle"}`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add details (optional)"
              aria-label="Details (optional)"
              className={`mt-3 h-28 w-full resize-none rounded-[14px] bg-surface p-4 text-base text-fg shadow-[var(--shadow-control)] placeholder:text-fg-subtle ${ring}`}
            />
            {note && <p className="mt-2 text-pretty text-[13px] leading-5 text-fg-muted">{note}</p>}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={closeCard} className={`${btn} bg-surface text-fg shadow-[var(--shadow-btn-secondary)] before:bg-fg hover:before:opacity-[0.04] active:before:opacity-[0.08]`}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onFeedback?.("down", { reasons: picked, comment });
                  setStage("sent");
                  downRef.current?.focus();
                }}
                className={`${btn} bg-[image:var(--grad-primary)] text-[var(--inverse-fg)] shadow-[var(--shadow-btn-primary)] before:bg-[var(--inverse-fg)] hover:before:opacity-[0.08] active:before:opacity-[0.14]`}
              >
                Send
              </button>
            </div>
          </motion.div>
        )}
        {stage === "sent" && (
          <motion.p key="sent" initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 flex items-center gap-2 text-[15px] text-fg-muted">
            <CircleCheck size={16} strokeWidth={1.5} className="text-success" /> Thanks, your feedback was sent.
          </motion.p>
        )}
      </AnimatePresence>
      <span className="sr-only" role="status" aria-live="polite">
        {stage === "sent" ? "Thanks, your feedback was sent." : ""}
      </span>
    </div>
  );
}
