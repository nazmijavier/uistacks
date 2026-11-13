"use client";

import {
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, CircleCheck, Search } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export interface PhoneCountry {
  /** ISO 3166 code, e.g. "US". It also draws the flag emoji. */
  code: string;
  name: string;
  /** The calling code without the plus, e.g. "44". */
  dial: string;
  /** How the national number reads: each # is a digit, anything else is drawn between them. */
  format: string;
  /** Valid digit counts. Defaults to the number of # in `format`. */
  lengths?: number[];
}

/** What `onValueChange` reports next to the E.164 string. */
export interface PhoneDetails {
  country: string;
  /** The national digits only, e.g. "4155550132". */
  national: string;
  /** True when the digit count fits the country. */
  valid: boolean;
}

export interface PhoneInputHandle {
  focus: () => void;
  /** Opens or closes the country list without moving focus (handy for demos and tours). */
  setOpen: (open: boolean) => void;
  /** Types into the country search. */
  setQuery: (query: string) => void;
}

export type PhoneInputSize = "sm" | "md";

export interface PhoneInputProps {
  /** The number in E.164 form ("+14155550132"), or "" when empty. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string, details: PhoneDetails) => void;
  /** The ISO code of the picked country. A pasted or typed "+44 …" switches it. */
  country?: string;
  defaultCountry?: string;
  onCountryChange?: (country: string) => void;
  /** The countries in the list, in this order. Defaults to a short built-in list. */
  countries?: PhoneCountry[];
  size?: PhoneInputSize;
  label?: ReactNode;
  /** Helper text under the field. An error takes its place. */
  hint?: ReactNode;
  /** Error text under the field. Without it, a number left too short shows a length note after blur. */
  error?: ReactNode;
  disabled?: boolean;
  required?: boolean;
  /** Adds a hidden input so the E.164 number posts with a form. */
  name?: string;
  id?: string;
  /** Names the number field when there is no label. */
  "aria-label"?: string;
  ref?: Ref<PhoneInputHandle>;
  className?: string;
}

/** A short list with real national formats. Pass `countries` for your own. */
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { code: "AU", name: "Australia", dial: "61", format: "### ### ###" },
  { code: "BR", name: "Brazil", dial: "55", format: "## #####-####", lengths: [10, 11] },
  { code: "CA", name: "Canada", dial: "1", format: "(###) ###-####" },
  { code: "FR", name: "France", dial: "33", format: "# ## ## ## ##" },
  { code: "DE", name: "Germany", dial: "49", format: "### ########", lengths: [10, 11] },
  { code: "IN", name: "India", dial: "91", format: "##### #####" },
  { code: "ID", name: "Indonesia", dial: "62", format: "###-####-#####", lengths: [10, 11, 12] },
  { code: "IE", name: "Ireland", dial: "353", format: "## ### ####" },
  { code: "IT", name: "Italy", dial: "39", format: "### ### ####", lengths: [9, 10] },
  { code: "JP", name: "Japan", dial: "81", format: "##-####-####" },
  { code: "MX", name: "Mexico", dial: "52", format: "## #### ####" },
  { code: "NL", name: "Netherlands", dial: "31", format: "# ########" },
  { code: "SG", name: "Singapore", dial: "65", format: "#### ####" },
  { code: "ES", name: "Spain", dial: "34", format: "### ## ## ##" },
  { code: "SE", name: "Sweden", dial: "46", format: "## ### ## ##" },
  { code: "AE", name: "United Arab Emirates", dial: "971", format: "## ### ####" },
  { code: "GB", name: "United Kingdom", dial: "44", format: "## #### ####" },
  { code: "US", name: "United States", dial: "1", format: "(###) ###-####" },
];

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;
const snappy = { type: "spring", stiffness: 520, damping: 34 } as const;
const ring = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

const SIZES: Record<PhoneInputSize, { box: string; text: string; trigger: string }> = {
  sm: { box: "h-8 rounded-[12px] pl-1 pr-2.5", text: "text-[13px] leading-5", trigger: "h-6 rounded-[8px] px-1.5" },
  md: { box: "h-9 rounded-[14px] pl-1 pr-3", text: "text-sm leading-5", trigger: "h-7 rounded-[10px] px-2" },
};

/** "US" → 🇺🇸 (two regional indicator letters). */
export const flagOf = (code: string) => String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

const slotsOf = (c: PhoneCountry) => c.format.split("#").length - 1;
const lengthsOf = (c: PhoneCountry) => c.lengths ?? [slotsOf(c)];
const maxOf = (c: PhoneCountry) => Math.min(slotsOf(c), Math.max(...lengthsOf(c)));
const onlyDigits = (s: string) => s.replace(/\D/g, "");

/** Lays digits into the pattern. A separator is drawn only when a digit follows it: "(415" not "(415) ". */
function formatNational(digits: string, pattern: string) {
  let out = "";
  let i = 0;
  for (const ch of pattern) {
    if (i >= digits.length) break;
    out += ch === "#" ? digits[i++] : ch;
  }
  return out;
}

/** The caret position just after the n-th digit of a formatted string. */
function caretAfterDigits(text: string, n: number) {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (/\d/.test(text[i]) && ++seen === n) return i + 1;
  }
  return text.length;
}

/**
 * Finds the country for an international number ("+442079460958"). Calling codes never prefix each
 * other, so the first match is the one; a shared code (+1) keeps the preferred country when it fits.
 */
function resolve(international: string, list: PhoneCountry[], prefer: string[]) {
  const digits = onlyDigits(international);
  for (let n = 1; n <= 3; n++) {
    const dial = digits.slice(0, n);
    const hits = list.filter((c) => c.dial === dial);
    if (hits.length === 0) continue;
    const country = prefer.map((p) => hits.find((c) => c.code === p)).find(Boolean) ?? hits[0];
    return { country, digits: digits.slice(n).slice(0, maxOf(country)) };
  }
  return null;
}

export function PhoneInput({
  value,
  defaultValue = "",
  onValueChange,
  country: countryProp,
  defaultCountry = "US",
  onCountryChange,
  countries = PHONE_COUNTRIES,
  size = "md",
  label,
  hint,
  error,
  disabled = false,
  required,
  name,
  id,
  "aria-label": ariaLabel = "Phone number",
  ref,
  className = "",
}: PhoneInputProps) {
  const uid = useId();
  const inputId = id ?? `${uid}-input`;
  const listId = `${uid}-list`;
  const msgId = `${uid}-message`;
  const reduce = useReduce();
  const s = SIZES[size];

  const [ownCountry, setOwnCountry] = useState(defaultCountry);
  const [ownValue, setOwnValue] = useState(defaultValue);
  const picked = countryProp ?? ownCountry;
  const fallback = countries.find((c) => c.code === picked) ?? countries[0];
  // The number decides the country (a +44 number is British); an empty field shows the picked one.
  const current = value ?? ownValue;
  const parsed = current ? resolve(current, countries, [picked, defaultCountry]) : null;
  const country = parsed?.country ?? fallback;
  const digits = parsed?.digits ?? "";
  const lengths = lengthsOf(country);
  const valid = lengths.includes(digits.length);

  // "+4" while someone types a calling code by hand, before it matches a country.
  const [draft, setDraft] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [open, setOpenState] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const caret = useRef<number | null>(null);
  // Where focus goes once the list has opened (the search) or closed after a pick (the number).
  const focusTarget = useRef<"search" | "input" | null>(null);
  useEffect(() => {
    const target = focusTarget.current;
    focusTarget.current = null;
    if (target === "search" && open) search.current?.focus();
    else if (target === "input" && !open) input.current?.focus();
  }, [open]);

  const text = draft ?? formatNational(digits, country.format);

  // Puts the caret back after the same digit once the text is reformatted.
  useLayoutEffect(() => {
    const el = input.current;
    if (caret.current === null || !el || document.activeElement !== el) return;
    el.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  const commit = (next: PhoneCountry, nextDigits: string) => {
    const e164 = nextDigits ? `+${next.dial}${nextDigits}` : "";
    if (value === undefined) setOwnValue(e164);
    if (next.code !== picked) {
      if (countryProp === undefined) setOwnCountry(next.code);
      onCountryChange?.(next.code);
    }
    if (e164 !== current || next.code !== country.code) {
      onValueChange?.(e164, { country: next.code, national: nextDigits, valid: lengthsOf(next).includes(nextDigits.length) });
    }
  };

  /** Text that starts with + or 00 is a full international number: it may switch the country. */
  const takeInternational = (raw: string) => {
    const t = raw.replace(/\(0\)/g, "").trim();
    if (!/^(\+|00)/.test(t)) return false;
    const hit = resolve(t.replace(/^00/, "+"), countries, [picked, defaultCountry]);
    if (!hit) {
      setDraft(/^\+\d{0,3}$/.test(t) ? t : null);
      return true;
    }
    setDraft(null);
    commit(hit.country, hit.digits);
    caret.current = formatNational(hit.digits, hit.country.format).length;
    return true;
  };

  const onChange = (raw: string, selection: number) => {
    setTouched(false);
    if (takeInternational(raw)) return;
    setDraft(null);
    const next = onlyDigits(raw).slice(0, maxOf(country));
    caret.current = caretAfterDigits(formatNational(next, country.format), onlyDigits(raw.slice(0, selection)).length);
    commit(country, next);
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (/^\s*(\+|00)/.test(pasted)) {
      e.preventDefault();
      takeInternational(pasted);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const at = el.selectionStart ?? 0;
    // Backspace right after a separator deletes the digit before it instead of getting stuck.
    if (e.key === "Backspace" && draft === null && at === el.selectionEnd && at > 0 && !/\d/.test(text[at - 1])) {
      e.preventDefault();
      const before = onlyDigits(text.slice(0, at)).length;
      if (before === 0) return;
      const next = digits.slice(0, before - 1) + digits.slice(before);
      caret.current = caretAfterDigits(formatNational(next, country.format), before - 1);
      commit(country, next);
    }
  };

  // ---- Country list ----
  const q = query.trim().toLowerCase().replace(/^\+/, "");
  const shown = q ? countries.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q || c.dial.startsWith(q)) : countries;
  const optionId = (c: PhoneCountry) => `${uid}-option-${c.code}`;
  const activeCountry = shown[Math.min(active, shown.length - 1)];

  const setOpen = (next: boolean, focusSearch = true) => {
    if (disabled) return;
    setOpenState(next);
    if (next) {
      setQuery("");
      setActive(Math.max(0, countries.indexOf(country)));
      focusTarget.current = focusSearch ? "search" : null;
    }
  };

  const pick = (c: PhoneCountry) => {
    setOpenState(false);
    setDraft(null);
    // Keeps the digits typed so far, trimmed to the new country's length.
    const next = digits.slice(0, maxOf(c));
    commit(c, next);
    caret.current = formatNational(next, c.format).length;
    focusTarget.current = "input";
  };

  const close = (refocus: boolean) => {
    setOpenState(false);
    if (refocus) trigger.current?.focus();
  };

  useImperativeHandle(ref, () => ({
    focus: () => input.current?.focus(),
    setOpen: (next: boolean) => setOpen(next, false),
    setQuery: (next: string) => {
      setQuery(next);
      setActive(0);
    },
  }));

  // An outside press closes the list.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpenState(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Keeps the highlighted country in view by scrolling the list only (never the page).
  useEffect(() => {
    const box = list.current;
    const el = activeCountry && document.getElementById(`${uid}-option-${activeCountry.code}`);
    if (!open || !box || !el) return;
    const top = el.offsetTop - box.offsetTop;
    if (top < box.scrollTop + 6) box.scrollTop = top - 6;
    else if (top + el.offsetHeight > box.scrollTop + box.clientHeight - 6) box.scrollTop = top + el.offsetHeight - box.clientHeight + 6;
  }, [open, activeCountry, uid]);

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const last = shown.length - 1;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (e.key === "ArrowDown" ? (Math.min(a, last) + 1) % shown.length : (Math.min(a, last) - 1 + shown.length) % shown.length));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : last);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeCountry) pick(activeCountry);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") {
      setOpenState(false);
    }
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      close(false);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
    } else if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Type-ahead: a letter opens the list already filtered.
      e.preventDefault();
      setOpen(true);
      setQuery(e.key);
      setActive(0);
    }
  };

  const showLength = touched && !valid && digits.length > 0;
  const lengthNote = `${country.name} numbers have ${lengths.length > 1 ? `${Math.min(...lengths)}–${Math.max(...lengths)}` : lengths[0]} digits.`;
  const message = error || (showLength ? lengthNote : hint);
  const invalid = Boolean(error) || showLength;
  const edge = invalid ? "shadow-[0_0_0_1px_var(--danger)]" : "shadow-[var(--shadow-control)]";
  const focus = `has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-offset-2 has-[input:focus-visible]:ring-offset-[var(--bg)] ${
    invalid ? "has-[input:focus-visible]:ring-[var(--danger)]" : "has-[input:focus-visible]:ring-[var(--select)]"
  }`;
  const placeholder = formatNational("5".repeat(maxOf(country)), country.format).replace(/5/g, "0");

  return (
    <div ref={root} className={`flex w-full min-w-0 flex-col ${className}`}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 w-fit text-sm font-medium leading-5 text-fg">
          {label}
        </label>
      )}
      <div className="relative">
        <div
          onMouseDown={(e) => {
            // a press on the padding focuses the number
            if (disabled || e.target !== e.currentTarget) return;
            e.preventDefault();
            input.current?.focus();
          }}
          className={`flex items-center gap-2 bg-surface transition-[background-color,box-shadow] duration-150 ${s.box} ${edge} ${focus} ${
            disabled ? "cursor-not-allowed opacity-50" : "cursor-text hover:not-focus-within:bg-subtle"
          }`}
        >
          <button
            ref={trigger}
            type="button"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-label={`Country: ${country.name}, +${country.dial}`}
            onClick={() => (open ? close(false) : setOpen(true))}
            onKeyDown={onTriggerKey}
            className={`flex shrink-0 items-center gap-1.5 transition-colors hover:bg-muted disabled:cursor-not-allowed ${s.trigger} ${s.text} ${ring} ${open ? "bg-muted" : ""}`}
          >
            <span className="relative grid h-5 w-5 place-items-center overflow-hidden">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={country.code}
                  aria-hidden
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.8 }}
                  transition={snappy}
                  className="text-[16px] leading-5"
                >
                  {flagOf(country.code)}
                </motion.span>
              </AnimatePresence>
            </span>
            <span className="font-medium tabular-nums text-fg">+{country.dial}</span>
            <motion.span aria-hidden initial={false} animate={{ rotate: open ? 180 : 0 }} transition={reduce ? { duration: 0 } : spring} className="-ml-0.5 flex text-fg-subtle">
              <ChevronDown size={16} strokeWidth={1.5} />
            </motion.span>
          </button>
          <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
          <input
            ref={input}
            id={inputId}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            spellCheck={false}
            disabled={disabled}
            required={required}
            placeholder={placeholder}
            aria-label={label ? undefined : ariaLabel}
            aria-invalid={invalid || undefined}
            aria-describedby={message ? msgId : undefined}
            value={text}
            onChange={(e) => onChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onPaste={onPaste}
            onKeyDown={onKeyDown}
            onBlur={() => {
              setDraft(null);
              setTouched(true);
            }}
            className={`h-full w-0 min-w-0 flex-1 bg-transparent tabular-nums text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed ${s.text}`}
          />
          <AnimatePresence initial={false}>
            {valid && !error && (
              <motion.span
                key="valid"
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                transition={snappy}
                className="-mr-0.5 flex shrink-0 text-success-text"
              >
                <CircleCheck size={size === "sm" ? 16 : 20} strokeWidth={1.5} aria-hidden />
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.12 } }}
              transition={spring}
              className="absolute left-0 top-[calc(100%+6px)] z-30 flex w-full min-w-[260px] origin-top-left flex-col gap-1.5 rounded-[16px] bg-surface p-1.5 shadow-[var(--shadow-card)] dark:shadow-[var(--shadow-hairline)]"
            >
              <label className="flex h-9 shrink-0 items-center gap-2 rounded-[12px] bg-subtle px-2.5">
                <Search aria-hidden size={16} strokeWidth={1.5} className="shrink-0 text-fg-subtle" />
                <input
                  ref={search}
                  type="text"
                  role="combobox"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Search countries"
                  aria-autocomplete="list"
                  aria-expanded
                  aria-controls={listId}
                  aria-activedescendant={activeCountry ? optionId(activeCountry) : undefined}
                  placeholder="Search countries"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onSearchKey}
                  className="h-full min-w-0 flex-1 bg-transparent text-sm leading-5 text-fg outline-none placeholder:text-fg-subtle"
                />
              </label>
              {/* Scrolls inside its own padding, so the highlight is never cut. */}
              <div ref={list} role="listbox" id={listId} aria-label="Countries" className="-mx-1.5 -mb-1.5 flex max-h-[232px] flex-col gap-0.5 overflow-y-auto overscroll-contain px-1.5 pb-1.5">
                {shown.map((c) => {
                  const on = c.code === country.code;
                  const hot = c === activeCountry;
                  return (
                    <div
                      key={c.code}
                      id={optionId(c)}
                      role="option"
                      aria-selected={on}
                      // keeps focus in the search while the pointer picks
                      onMouseDown={(e) => e.preventDefault()}
                      onPointerMove={() => !hot && setActive(shown.indexOf(c))}
                      onClick={() => pick(c)}
                      className={`flex min-h-9 shrink-0 cursor-pointer items-center gap-2.5 rounded-[12px] px-2.5 py-2 transition-colors ${
                        on ? (hot ? "bg-fg/15" : "bg-fg/10") : hot ? "bg-fg/5" : ""
                      }`}
                    >
                      <span aria-hidden className="text-[16px] leading-5">
                        {flagOf(c.code)}
                      </span>
                      <span className={`min-w-0 flex-1 truncate text-sm leading-5 text-fg ${on ? "font-medium" : ""}`}>{c.name}</span>
                      <span className="shrink-0 text-[13px] leading-5 text-fg-muted tabular-nums">+{c.dial}</span>
                      <span className="flex size-4 shrink-0 text-fg">{on && <Check size={16} strokeWidth={1.75} aria-hidden />}</span>
                    </div>
                  );
                })}
                {shown.length === 0 && <div className="px-2.5 py-6 text-center text-[13px] leading-5 text-fg-muted">No country matches “{query.trim()}”.</div>}
              </div>
              <span className="sr-only" aria-live="polite">
                {q ? `${shown.length} ${shown.length === 1 ? "country" : "countries"}` : ""}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {name && <input type="hidden" name={name} value={digits ? `+${country.dial}${digits}` : ""} />}
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
            <p id={msgId} aria-live="polite" className={`pt-1.5 text-[13px] leading-5 ${invalid ? "text-danger-text" : "text-fg-muted"}`}>
              {message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
