"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useAnimate, useReducedMotion } from "motion/react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type OtpInputMode = "numeric" | "alphanumeric";

export interface OtpInputProps {
  /** Number of cells. */
  length?: number;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Called once every cell is filled, with the full code. */
  onComplete?: (code: string) => void;
  /** Numeric takes digits only; alphanumeric takes letters and digits (upper-cased). */
  mode?: OtpInputMode;
  /** Split the cells into two halves with a short dash, e.g. 3 · 3. */
  split?: boolean;
  /** Show dots instead of the characters. */
  mask?: boolean;
  label?: ReactNode;
  /** Helper text under the cells. An error message takes its place. */
  hint?: ReactNode;
  /** Error message under the cells. Setting it turns the cells red and shakes them once. */
  error?: ReactNode;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Form field name; a hidden input carries the joined code. */
  name?: string;
  "aria-label"?: string;
  className?: string;
}

const spring = { type: "spring", stiffness: 520, damping: 34 } as const;

export function OtpInput({
  length = 6,
  value,
  defaultValue = "",
  onValueChange,
  onComplete,
  mode = "numeric",
  split = false,
  mask = false,
  label,
  hint,
  error,
  disabled = false,
  autoFocus = false,
  name,
  "aria-label": ariaLabel = "Verification code",
  className = "",
}: OtpInputProps) {
  const uid = useId();
  const labelId = `${uid}-label`;
  const msgId = `${uid}-message`;
  const reduce = !!useReduce();
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const cells = useRef<(HTMLInputElement | null)[]>([]);
  const [own, setOwn] = useState(defaultValue);
  const code = (value ?? own).slice(0, length);
  const [focused, setFocused] = useState(-1);
  // The code as last written, for focus handlers that run before React re-renders.
  const latest = useRef(code);
  useEffect(() => {
    latest.current = code;
  });

  const invalid = Boolean(error);
  const message = error || hint;

  // Shake once each time the field turns invalid.
  useEffect(() => {
    if (!invalid || reduce || !scope.current) return;
    animate(scope.current, { x: [0, -8, 7, -5, 3, 0] }, { duration: 0.42, ease: "easeOut" });
  }, [invalid, reduce, animate, scope]);

  const clean = (s: string) => (mode === "numeric" ? s.replace(/\D/g, "") : s.replace(/[^a-z0-9]/gi, "").toUpperCase());

  const focusCell = (i: number) => {
    const el = cells.current[Math.max(0, Math.min(length - 1, i))];
    el?.focus();
    el?.select();
  };

  const commit = (next: string) => {
    const v = next.slice(0, length);
    latest.current = v;
    if (value === undefined) setOwn(v);
    onValueChange?.(v);
    if (v.length === length && !v.includes(" ")) onComplete?.(v);
  };

  /** Writes text starting at cell i (typing or a paste) and moves focus after it. */
  const writeAt = (i: number, text: string) => {
    const chars = clean(text);
    if (!chars) return;
    const code = latest.current;
    const arr = code.padEnd(length, " ").split("");
    let at = Math.min(i, code.length); // never leave holes before the first empty cell
    for (const c of chars) {
      if (at >= length) break;
      arr[at++] = c;
    }
    commit(arr.join("").trimEnd());
    focusCell(at);
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    const k = e.key;
    const code = latest.current;
    if (k === "Backspace") {
      e.preventDefault();
      // delete this cell, or the one before if this one is empty
      const at = code[i] && code[i] !== " " ? i : i - 1;
      if (at < 0) return;
      const arr = code.split("");
      arr.splice(at, 1);
      commit(arr.join(""));
      focusCell(at);
    } else if (k === "Delete") {
      e.preventDefault();
      const arr = code.split("");
      arr.splice(i, 1);
      commit(arr.join(""));
    } else if (k === "ArrowLeft") {
      e.preventDefault();
      focusCell(i - 1);
    } else if (k === "ArrowRight") {
      e.preventDefault();
      focusCell(Math.min(i + 1, code.length));
    } else if (k === "Home") {
      e.preventDefault();
      focusCell(0);
    } else if (k === "End") {
      e.preventDefault();
      focusCell(Math.min(code.length, length - 1));
    } else if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && clean(k) && clean(k) === code[i]) {
      // Typing the character a cell already holds changes nothing, so no change event would move focus on.
      e.preventDefault();
      writeAt(i, k);
    }
  };

  const onPaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    // a full code always fills from the first cell
    writeAt(clean(text).length >= length ? 0 : i, text);
  };

  const half = Math.ceil(length / 2);
  // A digit lands with a short slide and a quick fade. (A slow fade from a tiny scale left a pale
  // "ghost" digit visible in still frames and on background tabs.)
  const pop = reduce ? { opacity: 0 } : { opacity: 0, y: 6 };
  const land = { y: { type: "spring", stiffness: 520, damping: 34 }, opacity: { duration: 0.12, ease: "easeOut" } } as const;

  return (
    <div className={`flex w-fit flex-col ${className}`}>
      {label && (
        <span id={labelId} className="mb-1.5 w-fit text-sm font-medium leading-5 text-fg">
          {label}
        </span>
      )}

      <div
        ref={scope}
        role="group"
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        aria-describedby={message ? msgId : undefined}
        className="flex items-center gap-2"
      >
        {Array.from({ length }, (_, i) => {
          const ch = code[i] && code[i] !== " " ? code[i] : "";
          const active = focused === i;
          const edge = invalid ? "shadow-[0_0_0_1px_var(--danger)]" : "shadow-[var(--shadow-control)]";
          const ring = active
            ? `ring-2 ring-offset-2 ring-offset-[var(--bg)] ${invalid ? "ring-[var(--danger)]" : "ring-[var(--select)]"}`
            : "";
          return (
            <div key={i} className="contents">
              {split && i === half && <span aria-hidden className="h-0.5 w-2.5 shrink-0 rounded-full bg-fg-subtle" />}
              <div
                className={`relative h-12 w-10 shrink-0 rounded-[14px] bg-surface transition-[background-color,box-shadow] duration-150 sm:w-11 ${edge} ${ring} ${
                  disabled ? "cursor-not-allowed opacity-50" : active ? "" : "hover:bg-subtle"
                }`}
              >
                <input
                  ref={(el) => {
                    cells.current[i] = el;
                  }}
                  type="text"
                  inputMode={mode === "numeric" ? "numeric" : "text"}
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  autoCapitalize="characters"
                  spellCheck={false}
                  autoFocus={autoFocus && i === 0}
                  disabled={disabled}
                  aria-label={`Character ${i + 1} of ${length}`}
                  aria-invalid={invalid || undefined}
                  maxLength={length}
                  value={ch}
                  onFocus={(e) => {
                    // jump to the first empty cell instead of leaving a hole
                    if (i > latest.current.length) return focusCell(latest.current.length);
                    setFocused(i);
                    e.target.select();
                  }}
                  onBlur={() => setFocused(-1)}
                  onKeyDown={(e) => onKeyDown(i, e)}
                  onPaste={(e) => onPaste(i, e)}
                  onChange={(e) => {
                    // the new character is whatever differs from the old one; autofill can bring the whole code
                    const raw = e.target.value;
                    const typed = raw.length > 1 && raw.startsWith(ch) ? raw.slice(ch.length) : raw;
                    if (clean(typed).length >= length) return writeAt(0, typed);
                    writeAt(i, typed);
                  }}
                  className="absolute inset-0 size-full rounded-[14px] bg-transparent text-center text-[20px] font-medium leading-7 text-transparent caret-transparent outline-none selection:bg-transparent disabled:cursor-not-allowed"
                />
                <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
                  <AnimatePresence initial={false} mode="popLayout">
                    {ch ? (
                      <motion.span
                        key={`c-${ch}`}
                        initial={pop}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, transition: { duration: 0.08 } }}
                        transition={land}
                        className={`text-[20px] font-medium leading-7 tabular-nums ${invalid ? "text-danger-text" : "text-fg"}`}
                      >
                        {mask ? <span className="block size-2.5 rounded-full bg-current" /> : ch}
                      </motion.span>
                    ) : active ? (
                      <motion.span
                        key="caret"
                        className="block h-6 w-px rounded-full bg-fg"
                        initial={{ opacity: 0 }}
                        animate={reduce ? { opacity: 1 } : { opacity: [1, 1, 0, 0] }}
                        transition={reduce ? { duration: 0 } : { duration: 1, repeat: Infinity, times: [0, 0.5, 0.5, 1] }}
                      />
                    ) : null}
                  </AnimatePresence>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {name && <input type="hidden" name={name} value={code.replace(/ /g, "")} />}

      <AnimatePresence initial={false}>
        {message && (
          <motion.div
            key="message"
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <p id={msgId} role={invalid ? "alert" : undefined} className={`pt-2 text-[13px] leading-5 ${invalid ? "text-danger-text" : "text-fg-muted"}`}>
              {message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
