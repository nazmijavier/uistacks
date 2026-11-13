"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown } from "lucide-react";

export interface CurrencyOption {
  /** ISO code, e.g. "USD". */
  code: string;
  /** e.g. "$". */
  symbol: string;
  /** e.g. "US dollar", shown in the menu. */
  name: string;
  /** Two-letter region code, e.g. "US". US, EU, GB, CA, AU, JP and MX show a round flag; any other shows the initials. */
  region: string;
  /** Replaces the round region mark (20 px), e.g. your own flag. */
  flag?: ReactNode;
  /** Decimal places. Default 2 (JPY uses 0). */
  decimals?: number;
}

export interface CurrencyInputProps extends Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "size" | "prefix" | "type"> {
  /** The amount as a number; null when empty. */
  value?: number | null;
  defaultValue?: number | null;
  onValueChange?: (value: number | null) => void;
  /** The currencies in the menu. Default: USD, EUR, GBP, CAD, AUD, JPY, MXN. */
  currencies?: CurrencyOption[];
  currency?: string;
  defaultCurrency?: string;
  onCurrencyChange?: (code: string) => void;
  label?: ReactNode;
  /** Helper text under the field. An error message takes its place. */
  hint?: ReactNode;
  /** Error message under the field. Setting it turns the edge red. */
  error?: ReactNode;
  /** Class for the wrapper that holds the label, the field and the message. */
  className?: string;
}

export const CURRENCIES: CurrencyOption[] = [
  { code: "USD", symbol: "$", name: "US dollar", region: "US" },
  { code: "EUR", symbol: "€", name: "Euro", region: "EU" },
  { code: "GBP", symbol: "£", name: "British pound", region: "GB" },
  { code: "CAD", symbol: "$", name: "Canadian dollar", region: "CA" },
  { code: "AUD", symbol: "$", name: "Australian dollar", region: "AU" },
  { code: "JPY", symbol: "¥", name: "Japanese yen", region: "JP", decimals: 0 },
  { code: "MXN", symbol: "$", name: "Mexican peso", region: "MX" },
];

const spring = { type: "spring", stiffness: 520, damping: 34 } as const;
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

/** Groups the whole part and keeps what is typed after the dot (up to `d` places). */
function shape(raw: string, d: number) {
  const clean = raw.replace(/[^\d.]/g, "");
  const dot = d > 0 ? clean.indexOf(".") : -1;
  const whole = (dot >= 0 ? clean.slice(0, dot) : clean).replace(/\./g, "").replace(/^0+(?=\d)/, "");
  const frac = dot >= 0 ? clean.slice(dot + 1).replace(/\./g, "").slice(0, d) : "";
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dot >= 0 ? `${grouped || "0"}.${frac}` : grouped;
}
const parse = (text: string) => (text.replace(/,/g, "") === "" ? null : Number(text.replace(/,/g, "")));
const full = (n: number, d: number) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const UNION = (
  <>
    <rect width="20" height="20" fill="#012169" />
    <path d="M0 0L20 20M20 0L0 20" stroke="#fff" strokeWidth="4" />
    <path d="M0 0L20 20M20 0L0 20" stroke="#c8102e" strokeWidth="1.4" />
    <path d="M10 0V20M0 10H20" stroke="#fff" strokeWidth="5" />
    <path d="M10 0V20M0 10H20" stroke="#c8102e" strokeWidth="3" />
  </>
);

/** Simplified round flags for the default currencies, drawn on a 20 × 20 grid. */
const FLAGS: Record<string, ReactNode> = {
  US: (
    <>
      <rect width="20" height="20" fill="#fff" />
      {[0, 2, 4, 6, 8, 10, 12].map((i) => (
        <rect key={i} y={(i * 20) / 13} width="20" height={20 / 13} fill="#b22234" />
      ))}
      <rect width="10" height={140 / 13} fill="#3c3b6e" />
      {[2.5, 5, 7.5].flatMap((x) => [2.7, 5.4, 8.1].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.6" fill="#fff" />))}
    </>
  ),
  EU: (
    <>
      <rect width="20" height="20" fill="#003399" />
      {Array.from({ length: 12 }, (_, i) => (
        <circle key={i} cx={10 + 5.4 * Math.cos((i * Math.PI) / 6)} cy={10 + 5.4 * Math.sin((i * Math.PI) / 6)} r="0.85" fill="#ffcc00" />
      ))}
    </>
  ),
  GB: UNION,
  CA: (
    <>
      <rect width="20" height="20" fill="#fff" />
      <rect width="5" height="20" fill="#d52b1e" />
      <rect x="15" width="5" height="20" fill="#d52b1e" />
      <path
        d="M10 4.8l1 2.3 1.6-.7-.5 2.8 1.8-.8-.5 1.6 1.4.7-2.4 1.7.3 1-2.3-.3v2.4h-.8v-2.4l-2.3.3.3-1-2.4-1.7 1.4-.7-.5-1.6 1.8.8-.5-2.8 1.6.7z"
        fill="#d52b1e"
      />
    </>
  ),
  AU: (
    <>
      <rect width="20" height="20" fill="#012169" />
      <svg width="10" height="10" viewBox="0 0 20 20">
        {UNION}
      </svg>
      <circle cx="5" cy="15" r="1.3" fill="#fff" />
      <circle cx="15" cy="4.5" r="0.8" fill="#fff" />
      <circle cx="12.5" cy="9.5" r="0.8" fill="#fff" />
      <circle cx="17.2" cy="8.6" r="0.8" fill="#fff" />
      <circle cx="15" cy="15.5" r="0.8" fill="#fff" />
    </>
  ),
  JP: (
    <>
      <rect width="20" height="20" fill="#fff" />
      <circle cx="10" cy="10" r="4.6" fill="#bc002d" />
    </>
  ),
  MX: (
    <>
      <rect width="20" height="20" fill="#fff" />
      <rect width="6.67" height="20" fill="#006847" />
      <rect x="13.33" width="6.67" height="20" fill="#ce1126" />
      <circle cx="10" cy="10" r="1.7" fill="#8c6a3b" />
    </>
  ),
};

function Region({ code, flag }: { code: string; flag?: ReactNode }) {
  const mark = flag ?? FLAGS[code];
  if (mark)
    return (
      // The hairline sits on top, so a white flag keeps its edge on a white menu.
      <span aria-hidden className="relative flex size-5 shrink-0 overflow-hidden rounded-full after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:shadow-[inset_0_0_0_1px_var(--border-soft)] [&>svg]:size-full">
        {flag ?? (
          <svg viewBox="0 0 20 20" preserveAspectRatio="xMidYMid slice">
            {mark}
          </svg>
        )}
      </span>
    );
  return (
    <span aria-hidden className="grid h-5 min-w-6 shrink-0 place-items-center rounded-full bg-muted px-1 text-[12px] font-medium leading-4 text-fg-muted">
      {code}
    </span>
  );
}

export function CurrencyInput({
  value,
  defaultValue = null,
  onValueChange,
  currencies = CURRENCIES,
  currency: currencyProp,
  defaultCurrency,
  onCurrencyChange,
  label,
  hint,
  error,
  className = "",
  id,
  disabled,
  readOnly,
  placeholder,
  onBlur,
  onPaste,
  "aria-describedby": describedBy,
  ...rest
}: CurrencyInputProps) {
  const reduce = useReduce();
  const uid = useId();
  const inputId = id ?? `${uid}-input`;
  const msgId = `${uid}-message`;
  const [ownCurrency, setOwnCurrency] = useState(defaultCurrency ?? currencies[0].code);
  const current = currencies.find((c) => c.code === (currencyProp ?? ownCurrency)) ?? currencies[0];
  const d = current.decimals ?? 2;

  const [text, setText] = useState(defaultValue === null ? "" : full(defaultValue, d));
  // A controlled value that no longer matches the text wins (it was set from outside).
  const shown = value !== undefined && parse(text) !== value ? (value === null ? "" : full(value, d)) : text;

  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caret.current === null || !input.current) return;
    input.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [shown]);

  const commit = (next: string) => {
    setText(next);
    const n = parse(next);
    if (n !== parse(shown)) onValueChange?.(n);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => write(e.target.value, e.target.selectionStart ?? e.target.value.length);
  // Shapes the raw text and keeps the caret after the same digit.
  const write = (raw: string, at: number) => {
    const next = shape(raw, d);
    // Put the caret back after the same number of digits and dots.
    const keep = raw.slice(0, at).replace(/[^\d.]/g, "").length;
    let pos = 0;
    for (let seen = 0; pos < next.length && seen < keep; pos++) if (/[\d.]/.test(next[pos])) seen++;
    caret.current = pos;
    commit(next);
  };

  // --- currency menu ---
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const typed = useRef({ text: "", at: 0 });

  const show = () => {
    setActive(Math.max(0, currencies.findIndex((c) => c.code === current.code)));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  const choose = (i: number) => {
    const c = currencies[i];
    if (currencyProp === undefined) setOwnCurrency(c.code);
    if (c.code !== current.code) {
      onCurrencyChange?.(c.code);
      // Re-shape the amount for the new number of decimals.
      const n = parse(shown);
      if (n !== null) commit(full(n, c.decimals ?? 2));
    }
    close();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(`${uid}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, uid]);

  const onListKey = (e: KeyboardEvent<HTMLElement>) => {
    const k = e.key;
    const n = currencies.length;
    if (k === "ArrowDown" || k === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.min(n - 1, Math.max(0, a + (k === "ArrowDown" ? 1 : -1))));
    } else if (k === "Home" || k === "End") {
      e.preventDefault();
      setActive(k === "Home" ? 0 : n - 1);
    } else if (k === "Enter" || k === " ") {
      e.preventDefault();
      choose(active);
    } else if (k === "Escape") {
      e.preventDefault();
      close();
    } else if (k === "Tab") {
      close(false);
    } else if (k.length === 1 && /[a-z]/i.test(k)) {
      // Type-ahead on the code or the name: letters within 600 ms build one query.
      const t = typed.current;
      t.text = e.timeStamp - t.at > 600 ? k : t.text + k;
      t.at = e.timeStamp;
      const q = t.text.toLowerCase();
      const i = currencies.findIndex((c) => c.code.toLowerCase().startsWith(q) || c.name.toLowerCase().startsWith(q));
      if (i >= 0) setActive(i);
    }
  };

  const message = error || hint;
  const edge = error ? "shadow-[0_0_0_1px_var(--danger)]" : "shadow-[var(--shadow-control)]";
  const ring = `has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-offset-2 has-[input:focus-visible]:ring-offset-[var(--bg)] ${
    error ? "has-[input:focus-visible]:ring-[var(--danger)]" : "has-[input:focus-visible]:ring-[var(--select)]"
  }`;

  return (
    <div className={`flex w-full max-w-[320px] flex-col ${className}`}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 w-fit text-sm font-medium leading-5 text-fg">
          {label}
        </label>
      )}

      <div ref={root} className="relative">
      <div
        className={`flex h-9 items-center gap-2 rounded-[14px] bg-surface pl-1 pr-3 transition-[background-color,box-shadow] duration-150 ${edge} ${ring} ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-text hover:not-focus-within:bg-subtle"
        }`}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !disabled) {
            e.preventDefault();
            input.current?.focus();
          }
        }}
      >
        <button
          ref={trigger}
          type="button"
          disabled={disabled || readOnly}
          role="combobox"
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${uid}-opt-${active}` : undefined}
          aria-expanded={open}
          aria-controls={`${uid}-list`}
          aria-label={`Currency: ${current.code}, ${current.name}`}
          onClick={() => (open ? close() : show())}
          onKeyDown={(e) => {
          if (open) return onListKey(e);
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
          }
        }}
          className={`flex h-7 shrink-0 items-center gap-1.5 rounded-[10px] pl-1.5 pr-1 text-[14px] font-medium leading-5 tracking-[-0.006em] text-fg transition-colors hover:bg-muted disabled:cursor-not-allowed ${focusRing}`}
        >
          <Region code={current.region} flag={current.flag} />
          <span className="tabular-nums">{current.code}</span>
          <motion.span aria-hidden animate={{ rotate: open ? 180 : 0 }} transition={reduce ? { duration: 0 } : spring} className="flex text-fg-subtle">
            <ChevronDown size={16} strokeWidth={1.5} />
          </motion.span>
        </button>

        <span aria-hidden className="h-5 w-px shrink-0 bg-border" />

        <span className="relative flex min-w-0 flex-1 items-center gap-1">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={current.symbol}
              aria-hidden
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={spring}
              className="pointer-events-none shrink-0 text-[14px] font-medium leading-5 tracking-[-0.006em] text-fg-muted"
            >
              {current.symbol}
            </motion.span>
          </AnimatePresence>
          <input
            ref={input}
            id={inputId}
            inputMode={d > 0 ? "decimal" : "numeric"}
            autoComplete="off"
            value={shown}
            disabled={disabled}
            readOnly={readOnly}
            placeholder={placeholder ?? (d > 0 ? `0.${"0".repeat(d)}` : "0")}
            aria-invalid={error ? true : undefined}
            aria-describedby={[describedBy, message ? msgId : undefined].filter(Boolean).join(" ") || undefined}
            onChange={onChange}
            onPaste={(e) => {
              onPaste?.(e);
              if (e.defaultPrevented || d > 0) return;
              // A whole-unit currency drops a pasted fraction ("1,234.56" → 1,234) instead of joining its digits.
              const text = e.clipboardData.getData("text");
              if (!text.includes(".")) return;
              e.preventDefault();
              const el = e.currentTarget;
              const start = el.selectionStart ?? el.value.length;
              const end = el.selectionEnd ?? start;
              const piece = text.slice(0, text.indexOf("."));
              write(el.value.slice(0, start) + piece + el.value.slice(end), start + piece.length);
            }}
            onBlur={(e) => {
              const n = parse(shown);
              if (n !== null) setText(full(n, d));
              onBlur?.(e);
            }}
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] font-medium leading-5 text-fg tabular-nums outline-none placeholder:font-medium placeholder:text-fg-subtle disabled:cursor-not-allowed"
            {...rest}
          />
        </span>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.12 } }}
            transition={spring}
            // keeps focus on the trigger while the pointer picks an option
            onMouseDown={(e) => e.preventDefault()}
            className="absolute left-0 top-[calc(100%+6px)] z-30 w-full min-w-[260px] origin-top-left rounded-[16px] bg-surface p-1.5 shadow-[var(--shadow-overlay)]"
          >
            <div
              id={`${uid}-list`}
              role="listbox"
              aria-label="Currency"
              className="flex max-h-[280px] flex-col gap-0.5 overflow-y-auto outline-none"
            >
              {currencies.map((c, i) => {
                const on = c.code === current.code;
                return (
                  <div
                    key={c.code}
                    id={`${uid}-opt-${i}`}
                    role="option"
                    aria-selected={on}
                    onPointerMove={() => i !== active && setActive(i)}
                    onClick={() => choose(i)}
                    className={`flex min-h-9 cursor-pointer items-center gap-2.5 rounded-[12px] px-2.5 py-1.5 transition-colors ${i === active ? "bg-fg/5" : ""}`}
                  >
                    <Region code={c.region} flag={c.flag} />
                    <span className="w-10 shrink-0 text-[14px] font-medium leading-5 text-fg">{c.code}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] leading-5 text-fg-muted">{c.name}</span>
                    <span className="text-[13px] leading-5 text-fg-muted">{c.symbol}</span>
                    <span className="flex w-4 shrink-0 text-fg">{on && <Check size={16} strokeWidth={1.75} aria-hidden />}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
            {/* Keyed so an error mounts fresh as an alert and is read out when it appears. */}
            <p key={error ? "error" : "hint"} id={msgId} role={error ? "alert" : undefined} className={`pt-1.5 text-[13px] leading-5 ${error ? "text-danger-text" : "text-fg-muted"}`}>
              {message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
