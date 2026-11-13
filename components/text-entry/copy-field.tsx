"use client";

import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Copy, Eye, EyeOff, KeyRound, Link } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type CopyFieldContent = "link" | "secret";
export type CopyFieldSize = "sm" | "md";

/** Drive the field from code. */
export interface CopyFieldHandle {
  /** Writes the value to the clipboard; resolves true when it worked (Copied shows then). */
  copy: () => Promise<boolean>;
  /** Shows Copied without touching the clipboard, e.g. in a product tour. */
  flash: () => void;
  focus: () => void;
}

export interface CopyFieldProps {
  /** What gets copied. */
  value: string;
  /** "link" shows the value as it is; "secret" masks it and adds an eye to show it. */
  content?: CopyFieldContent;
  /** What the field shows when it differs from what gets copied, e.g. a shortened link. A hidden secret shows it instead of the default mask. */
  display?: string;
  /** The leading 16 px glyph: a link for links, a key for secrets. `null` hides it. */
  icon?: ReactNode;
  /** Names the field and its buttons for screen readers: “Copy invite link”, “Show API key”. */
  label?: string;
  /** 32 or 36 px tall. */
  size?: CopyFieldSize;
  revealed?: boolean;
  defaultRevealed?: boolean;
  onRevealedChange?: (revealed: boolean) => void;
  /** Called after the clipboard write resolves. */
  onCopy?: (value: string) => void;
  /** How long Copied stays, in ms. */
  copiedFor?: number;
  copyLabel?: string;
  copiedLabel?: string;
  disabled?: boolean;
  id?: string;
  /** Adds a hidden input with the value, for forms. */
  name?: string;
  ref?: Ref<CopyFieldHandle>;
  className?: string;
}

const spring = { type: "spring", stiffness: 520, damping: 34 } as const;
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

// A secret's value sits one step smaller than a link's, as in the kit.
const SIZES: Record<CopyFieldSize, { field: string; text: string; secretText: string }> = {
  sm: { field: "h-8 pl-3 pr-0.5", text: "text-[13px] leading-5", secretText: "text-[12px] leading-5" },
  md: { field: "h-9 pl-3 pr-1", text: "text-[14px] leading-5", secretText: "text-[13px] leading-5" },
};

/** “uis_live_••••••••a9Xq”: the prefix up to the last underscore, eight dots, then the last four characters. */
export function maskSecret(value: string) {
  const tail = value.slice(-4);
  const head = value.slice(0, Math.max(0, value.length - 4)).match(/^.*_/)?.[0] ?? "";
  return `${head}••••••••${tail}`;
}

export function CopyField({
  value,
  content = "link",
  display,
  icon,
  label = content === "secret" ? "Secret" : "Link",
  size = "md",
  revealed: revealedProp,
  defaultRevealed = false,
  onRevealedChange,
  onCopy,
  copiedFor = 2000,
  copyLabel = "Copy",
  copiedLabel = "Copied",
  disabled = false,
  id,
  name,
  ref,
  className = "",
}: CopyFieldProps) {
  const reduce = useReduce();
  const autoId = useId();
  const inputId = id ?? autoId;
  const s = SIZES[size];
  const secret = content === "secret";
  const [innerRevealed, setInnerRevealed] = useState(defaultRevealed);
  const revealed = revealedProp ?? innerRevealed;
  const hidden = secret && !revealed;
  const shown = hidden ? (display ?? maskSecret(value)) : secret ? value : (display ?? value);
  // Bumped on every copy, so a second copy restarts the Copied timer.
  const [round, setRound] = useState(0);
  const [copied, setCopied] = useState(false);
  const [said, setSaid] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const nativeCopied = useRef(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), copiedFor);
    return () => clearTimeout(t);
  }, [copied, round, copiedFor]);

  // The same line twice is not read again, so every new line toggles a trailing space.
  const say = (line: string) => setSaid(line + (said.endsWith(" ") ? "" : " "));

  const confirm = (announce: boolean) => {
    setCopied(true);
    setRound((r) => r + 1);
    if (announce) say(`${label} copied`);
  };

  const copy = async () => {
    if (disabled) return false;
    try {
      await navigator.clipboard.writeText(value);
      confirm(true);
      onCopy?.(value);
      return true;
    } catch {
      // Clipboard blocked: no Copied. The text is selected so ⌘C / Ctrl+C still works, and the status line says so.
      setCopied(false);
      if (hidden) say(`Couldn’t copy the ${label}. Show it and copy it by hand.`);
      else {
        say("Couldn’t copy. The text is selected, press Command C or Control C.");
        input.current?.focus();
        input.current?.select();
      }
      return false;
    }
  };

  useImperativeHandle(ref, () => ({ copy, flash: () => confirm(false), focus: () => input.current?.focus() }));

  // Copying from the field itself: a hidden secret copies the real value, not the dots.
  const onNativeCopy = (e: ClipboardEvent<HTMLInputElement>) => {
    nativeCopied.current = true;
    const el = e.currentTarget;
    const all = el.selectionStart === 0 && el.selectionEnd === el.value.length;
    if (hidden || (all && shown !== value)) {
      e.preventDefault();
      e.clipboardData.setData("text/plain", value);
    } else if (!all) return;
    confirm(true);
    onCopy?.(value);
  };

  const setRevealed = (next: boolean) => {
    if (revealedProp === undefined) setInnerRevealed(next);
    onRevealedChange?.(next);
  };

  const split = hidden ? shown.match(/^([^•]*)(•+)(.*)$/) : null;
  const text = secret ? s.secretText : s.text;
  const glyph = icon === undefined ? secret ? <KeyRound size={16} strokeWidth={1.5} /> : <Link size={16} strokeWidth={1.5} /> : icon;
  const fade = reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 };

  return (
    <div
      className={`@container relative flex w-full min-w-0 items-center gap-2 rounded-[12px] bg-subtle shadow-[var(--shadow-control)] dark:bg-[var(--bg)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.04)] transition-[box-shadow,opacity] duration-150 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-[var(--select)] has-[input:focus-visible]:ring-offset-2 has-[input:focus-visible]:ring-offset-[var(--bg)] ${s.field} ${
        disabled ? "cursor-not-allowed opacity-50" : ""
      } ${className}`}
      onMouseDown={(e) => {
        // A press on the padding or the icon focuses the value.
        if (e.target === e.currentTarget && !disabled) {
          e.preventDefault();
          input.current?.focus();
        }
      }}
    >
      {glyph && (
        <span aria-hidden className="pointer-events-none grid size-4 shrink-0 place-items-center text-fg-subtle [&_svg]:size-4">
          {glyph}
        </span>
      )}
      <span className="relative flex h-full min-w-0 flex-1 items-center">
        <input
          ref={input}
          id={inputId}
          readOnly
          disabled={disabled}
          value={shown}
          aria-label={hidden ? `${label}, hidden` : label}
          spellCheck={false}
          autoComplete="off"
          onFocus={(e) => {
            if (!split) e.currentTarget.select();
          }}
          onCopy={onNativeCopy}
          onKeyDown={(e) => {
            // ⌘C / Ctrl+C on a hidden secret copies the real value. There is no selection, so some browsers skip the
            // copy event: run it ourselves (onNativeCopy writes the value synchronously, which works where the async
            // clipboard is blocked), and only fall back to the clipboard API when no copy event came.
            if (hidden && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
              e.preventDefault();
              nativeCopied.current = false;
              try {
                document.execCommand("copy");
              } catch {}
              if (!nativeCopied.current) void copy();
            }
          }}
          className={`h-full w-full min-w-0 truncate bg-transparent outline-none disabled:cursor-not-allowed ${text} ${split ? "text-transparent" : "text-fg"}`}
        />
        {/* A hidden secret drops dots first when the field is narrow, so the prefix and the last four stay readable.
            Only whole dots show: one that doesn't fit wraps onto a hidden second line instead of being cut in half,
            and the dots that stay share out the room it left, so no gap opens before the last four. Only a field too
            narrow for the prefix and the last four (about 5ch) cuts the prefix, with an ellipsis. */}
        {split && (
          <span aria-hidden className={`pointer-events-none absolute inset-0 flex min-w-0 items-center whitespace-nowrap text-fg ${text}`}>
            <span className="max-w-[calc(100%-5ch)] shrink-0 truncate">{split[1]}</span>
            <span className="flex h-5 min-w-0 flex-wrap justify-evenly overflow-hidden">
              {Array.from(split[2], (dot, i) => (
                <span key={i}>{dot}</span>
              ))}
            </span>
            <span className="shrink-0">{split[3]}</span>
          </span>
        )}
      </span>
      {name && <input type="hidden" name={name} value={value} />}
      <span className="flex shrink-0 items-center gap-0.5">
        {secret && (
          <button
            type="button"
            aria-label={`${revealed ? "Hide" : "Show"} ${label}`}
            aria-pressed={revealed}
            aria-controls={inputId}
            disabled={disabled}
            onClick={() => setRevealed(!revealed)}
            className={`grid size-7 shrink-0 place-items-center rounded-full text-fg-muted transition-[background-color,color,scale] duration-150 hover:bg-fg/[0.06] hover:text-fg motion-safe:active:scale-[0.92] disabled:pointer-events-none ${focusRing}`}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={revealed ? "hide" : "show"} initial={fade} animate={{ opacity: 1, scale: 1 }} exit={fade} transition={spring} className="grid place-items-center">
                {revealed ? <EyeOff size={16} strokeWidth={1.5} aria-hidden /> : <Eye size={16} strokeWidth={1.5} aria-hidden />}
              </motion.span>
            </AnimatePresence>
          </button>
        )}
        <button
          type="button"
          aria-label={`${copyLabel} ${label}`}
          disabled={disabled}
          onClick={copy}
          className={`relative isolate inline-flex h-7 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full bg-surface px-2.5 text-[12px] @max-[260px]:w-7 @max-[260px]:px-0 font-medium leading-4 shadow-[var(--shadow-btn-secondary)] transition-[scale] duration-150 before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-full before:bg-fg before:opacity-0 before:transition-opacity hover:before:opacity-[0.04] motion-safe:active:scale-[0.96] disabled:pointer-events-none ${focusRing} ${
            copied ? "text-success-text" : "text-fg"
          }`}
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
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={fade}
                  transition={spring}
                >
                  <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.28, ease: "easeOut", delay: 0.04 }} />
                </motion.svg>
              ) : (
                <motion.span key="copy" initial={fade} animate={{ opacity: 1, scale: 1 }} exit={fade} transition={spring} className="grid place-items-center">
                  <Copy size={16} strokeWidth={1.5} />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          {/* Both labels share one cell, so the button keeps the longer one's width and nothing beside it moves.
              Under 260 px the field keeps its room for the value: the button drops to the round icon (its name stays). */}
          <span aria-hidden className="grid @max-[260px]:hidden">
            <motion.span
              className="col-start-1 row-start-1 text-center"
              initial={false}
              animate={{ opacity: copied ? 0 : 1, y: copied && !reduce ? -4 : 0 }}
              transition={spring}
            >
              {copyLabel}
            </motion.span>
            <motion.span
              className="col-start-1 row-start-1 text-center"
              initial={false}
              animate={{ opacity: copied ? 1 : 0, y: copied || reduce ? 0 : 4 }}
              transition={spring}
            >
              {copiedLabel}
            </motion.span>
          </span>
        </button>
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {said}
      </span>
    </div>
  );
}
