"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState, useSyncExternalStore, type HTMLAttributes, type KeyboardEvent, type Ref } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CircleAlert, LoaderCircle, Pencil } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type InlineEditVariant = "title" | "field";

export interface InlineEditHandle {
  /** Turns the text into the input. `focus: false` leaves focus where it is (for a scripted tour). */
  edit: (options?: { focus?: boolean }) => void;
  /** Saves the current draft, as Enter does. */
  save: () => void;
  /** Drops the draft, as Escape does. */
  cancel: () => void;
  /** Replaces the draft while editing. */
  setDraft: (text: string) => void;
}

export interface InlineEditProps {
  value?: string;
  defaultValue?: string;
  /** Called with the saved text (not on every keystroke). */
  onValueChange?: (value: string) => void;
  /** Return a promise to show "Saving" until it settles. A rejection reopens the input with its message. */
  onSave?: (value: string) => void | Promise<unknown>;
  /** Return a message to block the save and show it under the input. */
  validate?: (value: string) => string | null | undefined;
  /** title: large text that edits in place. field: a "Label: value" row. */
  variant?: InlineEditVariant;
  /** The row's label (field variant), also used to name the button and the input. */
  label?: string;
  /** Shown when the value is empty. */
  placeholder?: string;
  /** Blurring the input saves it (on) or drops the draft (off). */
  saveOnBlur?: boolean;
  /** Input type and keyboard hints for phones. */
  type?: "text" | "email" | "url" | "tel";
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  disabled?: boolean;
  /** Imperative edit / save / cancel / setDraft. */
  ref?: Ref<InlineEditHandle>;
  /** Names the control when there is no label (title variant). */
  "aria-label"?: string;
  className?: string;
}

const spring = { type: "spring", stiffness: 520, damping: 34 } as const;
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

// The box hangs 8 px past the text on both sides, so the text lines up with what sits above and below.
const SIZES: Record<InlineEditVariant, { box: string; radius: string; text: string; icon: number }> = {
  title: { box: "h-10 px-2 -mx-2", radius: "rounded-[12px]", text: "text-[20px] font-medium leading-7 tracking-[-0.015em]", icon: 20 },
  field: { box: "h-8 px-2 -mx-2", radius: "rounded-[10px]", text: "text-[14px] leading-5", icon: 16 },
};

type Status = "idle" | "saving" | "saved";

function SavedMark({ instant }: { instant: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      <motion.path d="M3 8.5 6.5 12 13 4.5" initial={{ pathLength: instant ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: instant ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }} />
    </svg>
  );
}

export function InlineEdit({
  value,
  defaultValue = "",
  onValueChange,
  onSave,
  validate,
  variant = "field",
  label,
  placeholder = "Empty",
  saveOnBlur = true,
  type = "text",
  inputMode,
  maxLength,
  disabled = false,
  ref,
  "aria-label": ariaLabel,
  className = "",
}: InlineEditProps) {
  const uid = useId();
  const reduce = useReduce();
  const [own, setOwn] = useState(defaultValue);
  const current = value ?? own;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const focusOnEdit = useRef(false);
  const refocus = useRef(false);
  const leaving = useRef(false); // Enter or Escape already closed it: the blur that follows does nothing
  const saveRun = useRef(0);
  const s = SIZES[variant];
  const name = label ?? ariaLabel ?? "Value";

  const begin = (focus = true) => {
    if (disabled) return;
    focusOnEdit.current = focus;
    leaving.current = false;
    setDraft(current);
    setError(null);
    setStatus("idle");
    setEditing(true);
  };

  const cancel = (keyboard = false) => {
    leaving.current = true;
    refocus.current = keyboard;
    setError(null);
    setEditing(false);
  };

  const commit = (text: string, keyboard = false) => {
    const next = text.trim();
    const message = validate?.(next);
    if (message) {
      setError(message);
      return;
    }
    leaving.current = true;
    refocus.current = keyboard;
    setError(null);
    setEditing(false);
    if (next === current) return;
    const before = current;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    const result = onSave?.(next);
    const run = ++saveRun.current;
    if (!(result instanceof Promise)) return setStatus("saved");
    setStatus("saving");
    result.then(
      () => run === saveRun.current && setStatus("saved"),
      (err: unknown) => {
        if (run !== saveRun.current) return;
        // Put the old value back and reopen the input with what they typed.
        if (value === undefined) setOwn(before);
        onValueChange?.(before);
        setStatus("idle");
        setDraft(next);
        setError(err instanceof Error && err.message ? err.message : "Couldn't save. Try again.");
        focusOnEdit.current = keyboard;
        leaving.current = false;
        setEditing(true);
      }
    );
  };

  useImperativeHandle(ref, () => ({
    edit: (o) => begin(o?.focus ?? true),
    save: () => editing && commit(draft),
    cancel: () => editing && cancel(),
    setDraft: (text) => {
      setDraft(text);
      setError(null);
    },
  }));

  // Into the input: focus and select it. Out by keyboard: focus goes back to the text.
  useEffect(() => {
    if (editing && focusOnEdit.current) {
      focusOnEdit.current = false;
      input.current?.focus({ preventScroll: true });
      input.current?.select();
    } else if (!editing && refocus.current) {
      refocus.current = false;
      button.current?.focus({ preventScroll: true });
    }
  }, [editing]);

  // "Saved" shows for a moment, then the pencil hint comes back.
  useEffect(() => {
    if (status !== "saved") return;
    const t = setTimeout(() => setStatus("idle"), 1600);
    return () => clearTimeout(t);
  }, [status]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(draft, true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel(true);
    }
  };

  const onBlur = () => {
    if (leaving.current || !editing) return;
    if (saveOnBlur) commit(draft);
    else cancel();
  };

  const msgId = `${uid}-msg`;
  const empty = current.length === 0;
  const pop = reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 };

  return (
    <div className={`${variant === "field" ? "flex items-start gap-3" : "flex flex-col"} min-w-0 ${className}`}>
      {variant === "field" && label && (
        <span id={`${uid}-label`} className="w-[112px] shrink-0 truncate pt-1.5 text-[13px] leading-5 text-fg-muted">
          {label}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="relative flex min-w-0">
          {editing ? (
            <>
              <motion.span
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.12 }}
                className={`pointer-events-none absolute inset-y-0 -left-2 -right-2 bg-surface ${s.radius} ${
                  error ? "shadow-[0_0_0_1px_var(--danger)]" : "shadow-[var(--shadow-control)]"
                }`}
              />
              <input
                ref={input}
                type={type}
                inputMode={inputMode}
                maxLength={maxLength}
                value={draft}
                placeholder={placeholder}
                aria-label={name}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? msgId : undefined}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={onKeyDown}
                onBlur={onBlur}
                className={`relative min-w-0 flex-1 bg-transparent text-fg placeholder:text-fg-subtle ${s.box} ${s.radius} ${s.text} outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] ${
                  error ? "focus-visible:ring-[var(--danger)]" : "focus-visible:ring-[var(--select)]"
                }`}
              />
            </>
          ) : (
            <button
              ref={button}
              type="button"
              disabled={disabled}
              onClick={() => begin()}
              aria-label={`${name}: ${empty ? "empty" : current}. Edit`}
              className={`group/ie flex min-w-0 flex-1 items-center gap-2 text-left transition-colors ${s.box} ${s.radius} ${s.text} ${
                disabled ? "cursor-not-allowed opacity-50" : "cursor-text hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]"
              } ${focusRing}`}
            >
              <span className={`min-w-0 flex-1 truncate ${empty ? "text-fg-subtle" : "text-fg"}`}>{empty ? placeholder : current}</span>
              <span aria-hidden className="flex shrink-0 items-center">
                <AnimatePresence mode="popLayout" initial={false}>
                  {status === "saving" ? (
                    <motion.span key="saving" initial={pop} animate={{ opacity: 1, scale: 1 }} exit={pop} transition={spring} className="flex items-center gap-1.5 text-[12px] font-normal leading-4 tracking-normal text-fg-muted">
                      <LoaderCircle size={16} strokeWidth={1.75} className="motion-safe:animate-spin" />
                      Saving
                    </motion.span>
                  ) : status === "saved" ? (
                    <motion.span key="saved" initial={pop} animate={{ opacity: 1, scale: 1 }} exit={pop} transition={spring} className="flex items-center gap-1 text-[12px] font-normal leading-4 tracking-normal text-success-text">
                      <SavedMark instant={reduce} />
                      Saved
                    </motion.span>
                  ) : disabled ? null : (
                    <motion.span
                      key="hint"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex text-fg-subtle"
                    >
                      {/* Shows on hover and keyboard focus; always on touch screens. */}
                      <span className="flex opacity-0 transition-opacity group-hover/ie:opacity-100 group-focus-visible/ie:opacity-100 [@media(hover:none)]:opacity-100">
                        <Pencil size={s.icon} strokeWidth={1.5} />
                      </span>
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            </button>
          )}
        </div>
        <AnimatePresence initial={false}>
          {editing && error && (
            <motion.p
              key="error"
              id={msgId}
              role="alert"
              initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={spring}
              className="flex items-start gap-1.5 overflow-hidden text-[12px] leading-4 text-danger-text"
            >
              <CircleAlert aria-hidden size={16} strokeWidth={1.5} className="mt-2 shrink-0" />
              <span className="pt-2">{error}</span>
            </motion.p>
          )}
        </AnimatePresence>
        <span role="status" className="sr-only">
          {status === "saving" ? "Saving" : status === "saved" ? "Saved" : ""}
        </span>
      </div>
    </div>
  );
}
