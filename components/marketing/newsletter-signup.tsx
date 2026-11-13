"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Check, Loader2 } from "lucide-react";

export interface NewsletterSignupProps {
  /** The heading. */
  title?: ReactNode;
  /** One line under the heading. */
  description?: ReactNode;
  placeholder?: string;
  buttonLabel?: string;
  /** Called with the address after it passes the format check. Return a promise: while it runs the button shows a
   *  sending state; a rejection shows its message (or `errorMessage`) as the error line. Without it the form waits
   *  a moment and succeeds, which is handy for previews. */
  onSubscribe?: (email: string) => Promise<unknown> | void;
  /** A small note under the field, e.g. how often you write. `false` hides it. */
  privacy?: ReactNode | false;
  /** The heading of the success state. Default "Check your inbox". */
  successTitle?: ReactNode;
  /** The button that returns to the form with the address kept. Default "Use another email". */
  resetLabel?: string;
  /** Shown when `onSubscribe` rejects without a message. */
  errorMessage?: string;
  className?: string;
}

type Status = "idle" | "sending" | "done";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const spring = { type: "spring", stiffness: 420, damping: 36 } as const;
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]";

const noSubscribe = () => () => {};

/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

/** Eases its height to fit its content (measured), so swapping the form for the success state never jumps. */
function AutoHeight({ children, reduce }: { children: ReactNode; reduce: boolean }) {
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | "auto">("auto");
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight + 12));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div initial={false} animate={{ height: h }} transition={reduce ? { duration: 0 } : spring} className="-m-1.5 overflow-hidden p-1.5">
      <div ref={inner}>{children}</div>
    </motion.div>
  );
}

/**
 * An email capture card: heading, one line, and the address field with its Subscribe button in one pill. The address
 * is checked before sending (an inline error line), the button shows a sending state while `onSubscribe` runs, and
 * the card settles into "Check your inbox" with the address and a way back to the form.
 */
export function NewsletterSignup({
  title = "Get the changelog by email",
  description = "New components and fixes, once a month.",
  placeholder = "you@company.com",
  buttonLabel = "Subscribe",
  onSubscribe,
  privacy = "One email a month. Leave with one click.",
  successTitle = "Check your inbox",
  resetLabel = "Use another email",
  errorMessage = "We couldn't sign you up. Try again in a moment.",
  className = "",
}: NewsletterSignupProps) {
  const reduce = useReduce();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const doneHeading = useRef<HTMLHeadingElement>(null);

  // The form (and the focused button) unmounts on success, so focus moves to the new heading instead of the page.
  useEffect(() => {
    if (status === "done") doneHeading.current?.focus({ preventScroll: true });
  }, [status]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    const value = email.trim();
    if (!value) return fail("Enter your email address.");
    if (!EMAIL.test(value)) return fail("That address looks incomplete. Check it and try again.");
    setError("");
    setStatus("sending");
    try {
      await (onSubscribe ? onSubscribe(value) : new Promise((r) => setTimeout(r, 1100)));
      setEmail(value);
      setStatus("done");
    } catch (err) {
      setStatus("idle");
      fail(err instanceof Error && err.message ? err.message : errorMessage);
    }
  };

  function fail(text: string) {
    setError(text);
    input.current?.focus();
  }

  const back = () => {
    setStatus("idle");
    // the form mounts again; focus it once it is in the DOM
    requestAnimationFrame(() => input.current?.select());
  };

  const swap = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 8, filter: "blur(2px)" }, animate: { opacity: 1, y: 0, filter: "blur(0px)" }, exit: { opacity: 0, y: -8, filter: "blur(2px)" } };
  const sending = status === "sending";

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={`w-full max-w-[480px] rounded-[20px] bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6 ${className}`}
    >
      <p role="status" aria-live="polite" className="sr-only">
        {sending ? "Sending" : status === "done" ? `Subscribed. We sent a confirmation link to ${email}.` : ""}
      </p>
      <AutoHeight reduce={reduce}>
        <AnimatePresence mode="popLayout" initial={false}>
          {status === "done" ? (
            <motion.div key="done" {...swap} transition={reduce ? { duration: 0.15 } : spring}>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-fg shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--fg)_14%,transparent)]">
                <motion.svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <motion.path
                    d="M5 12.5l4.5 4.5L19 7.5"
                    initial={{ pathLength: reduce ? 1 : 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: reduce ? 0 : 0.45, delay: reduce ? 0 : 0.12, ease: "easeOut" }}
                  />
                </motion.svg>
              </span>
              <h3 ref={doneHeading} tabIndex={-1} id={`${id}-title`} className="mt-4 outline-none text-[16px] font-medium leading-6 tracking-[-0.011em] text-fg">
                {successTitle}
              </h3>
              <p className="mt-1 text-pretty text-[14px] leading-5 text-fg-muted">
                We sent a confirmation link to <span className="break-all font-medium text-fg">{email}</span>. Open it to finish signing up.
              </p>
              <button
                type="button"
                onClick={back}
                className={`mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[14px] font-medium text-fg shadow-[var(--shadow-btn-secondary)] transition-transform active:scale-[0.97] dark:bg-raised ${focusRing}`}
              >
                <ArrowLeft size={16} strokeWidth={1.5} aria-hidden />
                {resetLabel}
              </button>
            </motion.div>
          ) : (
            <motion.div key="form" {...swap} transition={reduce ? { duration: 0.15 } : spring}>
              <h3 id={`${id}-title`} className="text-[16px] font-medium leading-6 tracking-[-0.011em] text-fg">
                {title}
              </h3>
              {description && <p className="mt-1 text-pretty text-[14px] leading-5 text-fg-muted">{description}</p>}
              <form noValidate onSubmit={submit} className="mt-4">
                <label htmlFor={`${id}-email`} className="sr-only">
                  Email address
                </label>
                <div
                  className={`flex h-11 items-center gap-1 rounded-full bg-surface p-1 pl-4 transition-shadow dark:bg-subtle ${
                    error
                      ? "shadow-[inset_0_0_0_1px_var(--danger)]"
                      : "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--fg)_14%,transparent)] focus-within:shadow-[inset_0_0_0_1px_var(--select),0_0_0_3px_color-mix(in_srgb,var(--select)_18%,transparent)]"
                  }`}
                >
                  <input
                    ref={input}
                    id={`${id}-email`}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    spellCheck={false}
                    value={email}
                    readOnly={sending}
                    placeholder={placeholder}
                    aria-invalid={Boolean(error) || undefined}
                    aria-describedby={error ? `${id}-error` : privacy !== false ? `${id}-note` : undefined}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError("");
                    }}
                    className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-subtle"
                  />
                  <motion.button
                    type="submit"
                    aria-disabled={sending || undefined}
                    whileTap={reduce || sending ? undefined : { scale: 0.97 }}
                    className={`relative grid h-9 shrink-0 place-items-center rounded-full bg-[image:var(--grad-primary)] px-4 text-[14px] font-medium text-[var(--inverse-fg)] shadow-[var(--shadow-btn-primary)] ${focusRing}`}
                  >
                    {/* Both labels share one grid cell, so the button keeps its width when it swaps. */}
                    <span className={`col-start-1 row-start-1 transition-opacity ${sending ? "opacity-0" : ""}`}>{buttonLabel}</span>
                    <span aria-hidden className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 transition-opacity ${sending ? "" : "opacity-0"}`}>
                      <Loader2 size={16} strokeWidth={1.5} className={reduce ? "" : "animate-spin"} />
                      Sending
                    </span>
                  </motion.button>
                </div>
                <AnimatePresence initial={false} mode="popLayout">
                  {error ? (
                    <motion.p
                      key="error"
                      id={`${id}-error`}
                      role="alert"
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="mt-2 pl-4 text-[13px] leading-5 text-danger-text"
                    >
                      {error}
                    </motion.p>
                  ) : privacy !== false ? (
                    <motion.p
                      key="note"
                      id={`${id}-note`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="mt-2 flex items-center gap-1.5 pl-4 text-[13px] leading-5 text-fg-muted"
                    >
                      <Check size={14} strokeWidth={1.5} aria-hidden className="shrink-0" />
                      {privacy}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </AutoHeight>
    </section>
  );
}
