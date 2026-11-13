"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronRight, Copy, Ellipsis, RotateCw, ThumbsDown, ThumbsUp } from "lucide-react";

/** A filled thumb keeps the cut between the cuff and the hand (owner, Nov 13): two shapes with a gap, not one blob. */
function FilledThumb({ size, down = false }: { size: number; down?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" aria-hidden style={down ? { transform: "rotate(180deg)" } : undefined}>
      <rect x="2" y="10" width="3.5" height="12" rx="1.25" />
      <path d="M8.25 10.6 12 2a3.13 3.13 0 0 1 3 3.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H8.25Z" />
    </svg>
  );
}


export interface MessageSource {
  label: string;
  href?: string;
  /** A 16 px favicon or brand mark; defaults to the UI Stacks mark. */
  icon?: ReactNode;
}

export interface MessageProps {
  role: "user" | "assistant";
  /** Plain text. While `streaming` is true the words reveal one by one. */
  content: string;
  name?: string;
  time?: string;
  /** Assistant: replaces the mark next to the name. User: a photo or initial to the right of the bubble, e.g. a 24 px avatar. */
  avatar?: ReactNode;
  streaming?: boolean;
  /** "Thought for 12s" above the answer, with the reasoning one click away. */
  thought?: { label: string; text?: string };
  sources?: MessageSource[];
  /** How many sources to show before the "+N" chip. */
  maxSources?: number;
  /** Show copy, retry, thumbs and more under the answer. */
  actions?: boolean;
  /** "Try again" under the answer. Without it, Try again plays the answer in again. */
  onRetry?: () => void;
  /** The ••• button under the answer, e.g. to open a menu. */
  onMore?: () => void;
  className?: string;
}

// The fallback favicon for a source without its own `icon`.
function SourceMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4.38 14.14 14.38 19.14 17.24 17.71v1.91L12.47 22 2.95 17.24v-2.38l1.43-.72ZM6.28 8.9l10 5 2.86-1.43v1.91l-4.76 2.38L4.85 12V9.62l1.43-.72ZM11.52 2l9.52 4.76v2.38l-4.76 2.38-9.52-4.76V4.38L11.52 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

const ring = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
const iconBtn = `grid size-8 place-items-center rounded-full text-fg-muted transition hover:bg-muted hover:text-fg ${ring}`;

export function Message({
  role,
  content,
  name,
  time,
  avatar,
  streaming = false,
  thought,
  sources = [],
  maxSources = 3,
  actions = false,
  onRetry,
  onMore,
  className = "",
}: MessageProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  // Built-in Try again (no onRetry): each take streams the answer in again.
  const [take, setTake] = useState(0);
  const reduce = useReducedMotion();

  if (role === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
        className={`flex items-start justify-end gap-2.5 ${className}`}
      >
        <p className="max-w-[80%] text-pretty rounded-[20px] bg-muted px-4 py-2.5 text-base leading-[26px] text-fg">{content}</p>
        {avatar && <span className="flex shrink-0">{avatar}</span>}
      </motion.div>
    );
  }

  const words = content.split(/(\s+)/);
  const wordCount = words.filter((w) => !/^\s+$/.test(w)).length;
  const revealDelay = streaming ? wordCount * 0.04 : 0;
  const shown = sources.slice(0, maxSources);
  const extra = sources.length - shown.length;

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex items-center gap-2.5">
        {avatar ?? (
          // The default assistant mark (owner, Nov 13): the UI Stacks mark on a small ink tile, mono in Light and Dark.
          <span aria-hidden className="grid size-6 place-items-center rounded-[7px] bg-fg text-bg">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M4.38 14.14 14.38 19.14 17.24 17.71v1.91L12.47 22 2.95 17.24v-2.38l1.43-.72ZM6.28 8.9l10 5 2.86-1.43v1.91l-4.76 2.38L4.85 12V9.62l1.43-.72ZM11.52 2l9.52 4.76v2.38l-4.76 2.38-9.52-4.76V4.38L11.52 2Z" />
            </svg>
          </span>
        )}
        {name && <span className="text-[15px] font-medium text-fg">{name}</span>}
        {time && <span className="text-[13px] text-fg-muted">{time}</span>}
      </div>

      {thought && (
        <div className="mt-3">
          {/* A calm label and a chevron that turns as the reasoning folds open (owner, Nov 13: no status check).
              Only a thought with text to show is a toggle; a bare label is plain text. */}
          {thought.text ? (
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`-mx-1 flex items-center gap-0.5 rounded-md px-1 text-[15px] text-fg-muted transition-colors hover:text-fg ${ring}`}>
              {thought.label}
              <ChevronRight size={20} strokeWidth={1.5} className={`motion-safe:transition-transform motion-safe:duration-200 ${open ? "rotate-90" : ""}`} />
            </button>
          ) : (
            <p className="text-[15px] text-fg-muted">{thought.label}</p>
          )}
          <AnimatePresence initial={false}>
            {open && thought.text && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={reduce ? { duration: 0 } : { height: { duration: 0.28, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.2 } }}
                className="overflow-hidden"
              >
                <p className="mt-2 border-l border-border pl-3.5 text-[15px] leading-6 text-fg-muted">{thought.text}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <motion.p key={take} initial={take ? { opacity: 0 } : false} animate={{ opacity: 1 }} className="mt-3 text-pretty text-base leading-[26px] text-fg">
        {streaming || take > 0
          ? words.map((w, i) =>
              /^\s+$/.test(w) ? (
                w
              ) : (
                <motion.span
                  key={i}
                  initial={reduce ? false : { opacity: 0, filter: "blur(4px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  transition={{ delay: (i / 2) * 0.04, duration: 0.3 }}
                >
                  {w}
                </motion.span>
              )
            )
          : content}
      </motion.p>

      {shown.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {shown.map((s, i) => {
            const chip = {
              initial: { opacity: 0, y: 6 },
              animate: { opacity: 1, y: 0 },
              transition: { delay: revealDelay + 0.06 * i },
            };
            // Outline only, no fill (owner, Nov 14): a soft grey stroke that sits on any surface.
            const look = "inline-flex h-8 items-center gap-2 rounded-full bg-transparent px-3 text-sm text-fg shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--fg)_14%,transparent)]";
            const inner = (
              <>
                <span className="text-fg-muted">{i + 1}</span>
                <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:max-h-full [&>svg]:max-w-full">{s.icon ?? <SourceMark />}</span>
                {s.label}
              </>
            );
            // No href: a plain chip, never a dead "#" link. Only links react to hover.
            return s.href ? (
              <motion.a key={s.label} href={s.href} {...chip} className={`${look} transition-colors hover:bg-subtle ${ring}`}>
                {inner}
              </motion.a>
            ) : (
              <motion.span key={s.label} {...chip} className={look}>
                {inner}
              </motion.span>
            );
          })}
          {extra > 0 && (
            <motion.span
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: revealDelay + 0.06 * shown.length }}
              className="inline-flex h-8 items-center rounded-full bg-transparent px-3 text-sm tabular-nums text-fg-muted shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--fg)_14%,transparent)]"
            >
              +{extra}
              <span className="sr-only"> more sources</span>
            </motion.span>
          )}
        </div>
      )}

      {actions && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: revealDelay + 0.2 }} className="-ml-2 mt-3 flex items-center gap-1">
          <button
            type="button"
            aria-label="Copy"
            className={iconBtn}
            onClick={() => {
              navigator.clipboard
                ?.writeText(content)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1400);
                })
                .catch(() => {});
            }}
          >
            {copied ? <Check size={20} strokeWidth={1.75} /> : <Copy size={20} strokeWidth={1.5} />}
          </button>
          <button type="button" aria-label="Try again" onClick={onRetry ?? (() => setTake((t) => t + 1))} className={iconBtn}>
            <RotateCw size={20} strokeWidth={1.5} />
          </button>
          {(["up", "down"] as const).map((v) => (
            <motion.button key={v} type="button" whileTap={{ scale: 0.85 }} aria-pressed={vote === v} aria-label={v === "up" ? "Good response" : "Bad response"} onClick={() => setVote(vote === v ? null : v)} className={`${iconBtn} ${vote === v ? "text-fg" : ""}`}>
              {vote === v ? <FilledThumb size={20} down={v === "down"} /> : v === "up" ? <ThumbsUp size={20} strokeWidth={1.5} /> : <ThumbsDown size={20} strokeWidth={1.5} />}
            </motion.button>
          ))}
          <button type="button" aria-label="More" onClick={onMore} className={iconBtn}>
            <Ellipsis size={20} strokeWidth={1.5} />
          </button>
          <span className="sr-only" role="status" aria-live="polite">
            {copied ? "Copied" : take > 0 && !onRetry ? "Answer regenerated" : ""}
          </span>
        </motion.div>
      )}
    </div>
  );
}
