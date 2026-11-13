"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Eye, EyeOff, Lock, Minus } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type PasswordStrength = "empty" | "weak" | "fair" | "good" | "strong";

export interface PasswordRule {
  label: string;
  test: (value: string) => boolean;
}

export interface PasswordInputProps extends Omit<ComponentProps<"input">, "type" | "size" | "value" | "defaultValue"> {
  label?: ReactNode;
  /** Helper text under the field. An error message takes its place. */
  hint?: ReactNode;
  /** Error message under the field. Setting it turns the field red. */
  error?: ReactNode;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Live rules under the meter. Defaults to 12+ characters, a number or symbol, and not a common password. */
  rules?: PasswordRule[];
  /** Show the 4-step meter and the rules. Turn it off on a sign-in form. */
  meter?: boolean;
  /** Called whenever the strength level changes. */
  onStrengthChange?: (strength: PasswordStrength) => void;
  /** Start with the password shown. */
  defaultVisible?: boolean;
  /** Class for the wrapper that holds the label, the field, the meter and the rules. */
  className?: string;
}

const spring = { type: "spring", stiffness: 520, damping: 34 } as const;

const COMMON = ["password", "123456", "12345678", "qwerty", "letmein", "welcome", "iloveyou", "admin", "monkey", "dragon", "abc123", "111111", "football", "baseball", "sunshine", "princess"];

export const DEFAULT_PASSWORD_RULES: PasswordRule[] = [
  { label: "At least 12 characters", test: (v) => v.length >= 12 },
  { label: "One number or symbol", test: (v) => /[\d\W_]/.test(v) },
  {
    label: "Not a common password",
    test: (v) => {
      const s = v.toLowerCase();
      return v.length >= 8 && !COMMON.some((c) => s.includes(c)) && !/^(.)\1+$/.test(s);
    },
  },
];

const LEVEL: Record<PasswordStrength, { label: string; steps: number; bar: string; text: string }> = {
  empty: { label: "", steps: 0, bar: "", text: "text-fg-subtle" },
  weak: { label: "Weak", steps: 1, bar: "bg-danger", text: "text-danger-text" },
  fair: { label: "Fair", steps: 2, bar: "bg-[var(--warning)]", text: "text-warning-text" },
  good: { label: "Good", steps: 3, bar: "bg-success", text: "text-success-text" },
  strong: { label: "Strong", steps: 4, bar: "bg-success", text: "text-success-text" },
};

/** Every rule met and 14+ characters is Strong; every rule met is Good; two is Fair; fewer is Weak. */
function strengthOf(value: string, passed: number, total: number): PasswordStrength {
  if (!value) return "empty";
  if (passed >= total) return value.length >= 14 ? "strong" : "good";
  if (passed >= total - 1 && total > 1) return "fair";
  return "weak";
}

function Check({ reduce }: { reduce: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <motion.path d="M20 6 9 17l-5-5" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.22, ease: "easeOut" }} />
    </svg>
  );
}

export function PasswordInput({
  label,
  hint,
  error,
  value,
  defaultValue,
  onValueChange,
  rules = DEFAULT_PASSWORD_RULES,
  meter = true,
  onStrengthChange,
  defaultVisible = false,
  className = "",
  id,
  ref,
  disabled,
  onChange,
  placeholder = "Create a password",
  autoComplete,
  "aria-describedby": describedBy,
  ...rest
}: PasswordInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const msgId = `${inputId}-message`;
  const meterId = `${inputId}-meter`;
  const inner = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLInputElement, []);
  const reduce = !!useReduce();
  const [own, setOwn] = useState(defaultValue ?? "");
  const current = value ?? own;
  const [visible, setVisible] = useState(defaultVisible);

  const results = rules.map((r) => current.length > 0 && r.test(current));
  const strength = strengthOf(current, results.filter(Boolean).length, rules.length);
  const level = LEVEL[strength];
  // A rule that flips while typing is read out once by the sr-only status line.
  const ticks = results.map((r) => (r ? "1" : "0")).join("");
  const [ruleNote, setRuleNote] = useState({ ticks, text: "" });
  if (ruleNote.ticks !== ticks) {
    const flipped = current ? rules.filter((_, i) => (ruleNote.ticks[i] === "1") !== results[i]) : [];
    setRuleNote({ ticks, text: flipped.map((r) => `${r.label}, ${results[rules.indexOf(r)] ? "met" : "not met"}`).join(". ") });
  }
  const report = useRef(onStrengthChange);
  useEffect(() => {
    report.current = onStrengthChange;
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    report.current?.(strength);
  }, [strength]);

  const invalid = Boolean(error);
  const message = error || hint;
  const edge = invalid ? "shadow-[0_0_0_1px_var(--danger)]" : "shadow-[var(--shadow-control)]";
  const ring = `has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-offset-2 has-[input:focus-visible]:ring-offset-[var(--bg)] ${
    invalid ? "has-[input:focus-visible]:ring-[var(--danger)]" : "has-[input:focus-visible]:ring-[var(--select)]"
  }`;
  const swap = reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 };

  return (
    <div className={`flex w-full flex-col ${className}`}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 w-fit text-sm font-medium leading-5 text-fg">
          {label}
        </label>
      )}

      <div
        className={`flex h-9 items-center gap-2 rounded-[14px] bg-surface px-3 transition-[background-color,box-shadow] duration-150 ${edge} ${ring} ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-text hover:not-focus-within:bg-subtle"
        }`}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !disabled) {
            e.preventDefault();
            inner.current?.focus();
          }
        }}
      >
        <Lock size={16} strokeWidth={1.5} aria-hidden className="pointer-events-none shrink-0 text-fg-muted" />
        <input
          ref={inner}
          id={inputId}
          type={visible ? "text" : "password"}
          value={current}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete={autoComplete ?? (meter ? "new-password" : "current-password")}
          spellCheck={false}
          autoCapitalize="off"
          aria-invalid={invalid || undefined}
          aria-describedby={[describedBy, meter ? meterId : undefined, message ? msgId : undefined].filter(Boolean).join(" ") || undefined}
          onChange={(e) => {
            if (value === undefined) setOwn(e.target.value);
            onChange?.(e);
            onValueChange?.(e.target.value);
          }}
          className={`h-full min-w-0 flex-1 bg-transparent text-sm leading-5 text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed ${
            visible || !current ? "" : "tracking-[0.12em]"
          }`}
          {...rest}
        />
        <button
          type="button"
          disabled={disabled}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={inputId}
          onClick={() => setVisible((v) => !v)}
          className="-mr-1.5 grid size-7 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-muted hover:text-fg disabled:pointer-events-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={visible ? "hide" : "show"} initial={swap} animate={{ opacity: 1, scale: 1 }} exit={swap} transition={spring} className="flex">
              {visible ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>

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
            <p id={msgId} className={`pt-1.5 text-[13px] leading-5 ${invalid ? "text-danger-text" : "text-fg-muted"}`}>
              {message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {meter && (
        <div id={meterId} className="mt-3 flex flex-col">
          <div className="grid grid-cols-4 gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="relative h-1 overflow-hidden rounded-full bg-track">
                <motion.span
                  initial={false}
                  animate={{ scaleX: i < level.steps ? 1 : 0 }}
                  transition={reduce ? { duration: 0 } : { ...spring, delay: i < level.steps ? i * 0.04 : 0 }}
                  className={`absolute inset-0 origin-left rounded-full ${level.bar}`}
                />
              </span>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-xs leading-4">
            <span aria-hidden className="text-fg-muted">Password strength</span>
            <span aria-live="polite" className={`font-medium ${level.text}`}>
              <span className="sr-only">Password strength: </span>
              {level.label || <Minus size={16} strokeWidth={1.5} aria-label="None yet" />}
            </span>
          </div>
          <ul className="mt-2 flex flex-col gap-1">
            {rules.map((r, i) => (
              <li key={r.label} className={`flex items-center gap-2 text-xs leading-4 transition-colors ${results[i] ? "text-fg" : "text-fg-muted"}`}>
                <span className={`flex size-4 shrink-0 ${results[i] ? "text-success-text" : "text-fg-subtle"}`}>
                  {results[i] ? <Check reduce={reduce} /> : <Minus size={16} strokeWidth={1.5} aria-hidden />}
                </span>
                <span>
                  {r.label}
                  <span className="sr-only">{results[i] ? ", met" : ", not met yet"}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {meter && (
        <span role="status" aria-live="polite" className="sr-only">
          {ruleNote.text}
        </span>
      )}
    </div>
  );
}
