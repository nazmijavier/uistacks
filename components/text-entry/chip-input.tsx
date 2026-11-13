"use client";

import { useId, useRef, useState, useSyncExternalStore, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CircleAlert, X } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export interface ChipInputSuggestion {
  /** What the chip stores, e.g. an email address. */
  value: string;
  /** The name on the chip and in the menu, e.g. "Maya Ortiz". */
  label?: string;
  /** Muted second line in the menu, e.g. the email or a team. */
  description?: string;
}

export interface ChipInputProps {
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  /** People or tags offered while typing; the text matches their label and value. */
  suggestions?: ChipInputSuggestion[];
  /** Return false to mark a chip invalid (red). Defaults to an email check; pass null to accept any text, for tags. */
  validate?: ((value: string) => boolean) | null;
  /** The one-letter avatar on chips and in the menu (default true). */
  avatars?: boolean;
  label?: ReactNode;
  placeholder?: string;
  /** Helper text under the field. */
  hint?: ReactNode;
  /** Error text under the field. It replaces the hint and turns the edge red. */
  error?: ReactNode;
  disabled?: boolean;
  /** Names the field when there is no label. */
  "aria-label"?: string;
  className?: string;
}

const spring = { type: "spring", stiffness: 520, damping: 34 } as const;
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i;
const EMAILS = /[^\s<>,;"'()]+@[^\s<>,;"'()]+/g;
const icon16 = { size: 16, strokeWidth: 1.5 } as const;

export function ChipInput({
  value,
  defaultValue,
  onValueChange,
  suggestions = [],
  validate,
  avatars = true,
  label,
  placeholder = "Add an email…",
  hint,
  error,
  disabled = false,
  "aria-label": ariaLabel,
  className = "",
}: ChipInputProps) {
  const uid = useId();
  const inputId = `${uid}-input`;
  const listId = `${uid}-list`;
  const msgId = `${uid}-message`;
  const reduce = !!useReduce();
  const inputRef = useRef<HTMLInputElement>(null);
  const [own, setOwn] = useState<string[]>(defaultValue ?? []);
  const chips = value ?? own;
  const [text, setText] = useState("");
  // A chip picked by Backspace or the arrows; the next Backspace removes it.
  const [selected, setSelected] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [active, setActive] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [said, setSaid] = useState("");

  const check = validate === undefined ? (v: string) => EMAIL.test(v) : validate;
  const valid = (v: string) => !check || check(v);
  const key = (v: string) => v.trim().toLowerCase();
  const known = new Map(suggestions.map((s) => [key(s.value), s]));
  const nameOf = (v: string) => known.get(key(v))?.label ?? v;

  const q = key(text);
  const taken = new Set(chips.map(key));
  const matches = q
    ? suggestions.filter((s) => !taken.has(key(s.value)) && (key(s.value).includes(q) || (s.label ? key(s.label).includes(q) : false))).slice(0, 5)
    : [];
  const showMenu = menu && matches.length > 0 && !disabled;
  const hot = Math.min(active, Math.max(matches.length - 1, 0));
  const invalidCount = chips.filter((c) => !valid(c)).length;
  const message = error || hint;

  const commit = (next: string[]) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const add = (raw: string[]) => {
    const next = [...chips];
    const added: string[] = [];
    for (const part of raw) {
      const t = part.trim();
      if (!t) continue;
      // A teammate typed by name or email becomes that teammate.
      const person = suggestions.find((s) => key(s.value) === key(t) || (s.label && key(s.label) === key(t)));
      const v = person?.value ?? t;
      if (next.some((c) => key(c) === key(v))) {
        setFlash(key(v));
        setTimeout(() => setFlash(null), 700);
        setSaid(`${nameOf(v)} is already added`);
        continue;
      }
      next.push(v);
      added.push(v);
    }
    if (added.length) {
      commit(next);
      setSaid(`Added ${added.map(nameOf).join(", ")}`);
    }
    setText("");
    setSelected(null);
    setActive(0);
  };

  const remove = (i: number) => {
    const v = chips[i];
    if (v === undefined) return;
    commit(chips.filter((_, j) => j !== i));
    setSaid(`Removed ${nameOf(v)}`);
    setSelected(null);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    if (showMenu && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setActive((hot + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "," || e.key === ";") {
      // Return or a comma: the highlighted teammate if the menu is open, else the typed text.
      if (showMenu) {
        e.preventDefault();
        add([matches[hot].value]);
      } else if (text.trim()) {
        e.preventDefault();
        add([text]);
      } else if (e.key !== "Enter") e.preventDefault();
    } else if (e.key === "Escape") {
      if (showMenu) {
        e.preventDefault();
        setMenu(false);
      } else setSelected(null);
    } else if ((e.key === "Backspace" || e.key === "Delete") && selected !== null) {
      e.preventDefault();
      remove(selected);
    } else if (e.key === "Backspace" && atStart && chips.length) {
      // First Backspace picks the last chip, the second one removes it.
      e.preventDefault();
      setSelected(chips.length - 1);
      setSaid(`${nameOf(chips[chips.length - 1])} selected. Press Backspace to remove.`);
    } else if (e.key === "ArrowLeft" && atStart && chips.length) {
      e.preventDefault();
      const i = selected === null ? chips.length - 1 : Math.max(0, selected - 1);
      setSelected(i);
      setSaid(`${nameOf(chips[i])} selected. Press Backspace to remove.`);
    } else if (e.key === "ArrowRight" && selected !== null) {
      e.preventDefault();
      const i = selected + 1 < chips.length ? selected + 1 : null;
      setSelected(i);
      if (i !== null) setSaid(`${nameOf(chips[i])} selected. Press Backspace to remove.`);
    } else if (selected !== null && e.key.length === 1) setSelected(null);
  };

  // A pasted list ("a@x.com, b@y.com" or "Maya Ortiz <maya@…>; …") turns into chips; one word pastes as usual.
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const data = e.clipboardData.getData("text");
    const parts = check === null ? data.split(/[,;\n\t]+/) : (data.match(EMAILS) ?? data.split(/[\s,;]+/));
    if (parts.filter((p) => p.trim()).length < 2) return;
    e.preventDefault();
    add([...(text.trim() ? [text] : []), ...parts]);
  };

  const red = Boolean(error) || invalidCount > 0;
  const pop = reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8 };

  return (
    <div className={`flex w-full flex-col ${disabled ? "opacity-50" : ""} ${className}`}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 w-fit text-sm font-medium leading-5 text-fg">
          {label}
        </label>
      )}

      <div className="relative">
        <div
          onMouseDown={(e) => {
            // a press on the padding focuses the text
            if (e.target === e.currentTarget && !disabled) {
              e.preventDefault();
              inputRef.current?.focus();
            }
          }}
          className={`flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-[14px] bg-surface p-1.5 transition-[box-shadow] duration-150 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-offset-2 has-[input:focus-visible]:ring-offset-[var(--bg)] ${
            red ? "shadow-[0_0_0_1px_var(--danger)] has-[input:focus-visible]:ring-[var(--danger)]" : "shadow-[var(--shadow-control)] has-[input:focus-visible]:ring-[var(--select)]"
          } ${disabled ? "cursor-not-allowed" : "cursor-text"}`}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {chips.map((c, i) => {
              const name = nameOf(c);
              const bad = !valid(c);
              return (
                <motion.span
                  key={key(c)}
                  layout={!reduce}
                  initial={pop}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={pop}
                  transition={spring}
                  className={`inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-full pr-1 text-[13px] leading-5 transition-shadow duration-150 ${avatars ? "pl-0.5" : "pl-2.5"} ${
                    bad ? "bg-danger-soft text-danger-text" : "bg-muted text-fg"
                  } ${selected === i ? "shadow-[0_0_0_2px_var(--select)]" : flash === key(c) ? "shadow-[0_0_0_2px_var(--track-strong)]" : ""}`}
                >
                  {avatars && (
                    <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-surface text-[12px] font-medium shadow-[var(--shadow-hairline)]">
                      {bad ? <CircleAlert {...icon16} /> : name.trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="truncate">{name}</span>
                  {bad && <span className="sr-only">, {check === null ? "not valid" : "not a valid email"}</span>}
                  {!disabled && (
                    <button
                      type="button"
                      aria-label={`Remove ${name}`}
                      onClick={() => remove(i)}
                      className={`grid size-5 shrink-0 place-items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--select)] ${bad ? "hover:bg-danger/15" : "text-fg-muted hover:bg-fg/10 hover:text-fg"}`}
                    >
                      <X {...icon16} />
                    </button>
                  )}
                </motion.span>
              );
            })}
          </AnimatePresence>

          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            autoComplete="off"
            aria-label={label ? undefined : ariaLabel}
            aria-expanded={showMenu}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showMenu ? `${uid}-option-${hot}` : undefined}
            aria-invalid={red || undefined}
            aria-describedby={message ? msgId : undefined}
            disabled={disabled}
            value={text}
            placeholder={placeholder}
            onChange={(e) => {
              const v = e.target.value;
              // Mobile keyboards can type a comma without a key event.
              if (/[,;]/.test(v)) add(v.split(/[,;]/));
              else {
                setText(v);
                setActive(0);
                setMenu(true);
              }
              setSelected(null);
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onFocus={() => setMenu(true)}
            onBlur={() => {
              setMenu(false);
              setSelected(null);
              if (text.trim()) add([text]);
            }}
            className="h-7 min-w-[120px] flex-1 bg-transparent px-1.5 text-[14px] leading-5 text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed"
          />
        </div>

        <AnimatePresence>
          {showMenu && (
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.12 } }}
              transition={spring}
              // keeps focus in the field while the pointer picks a teammate
              onMouseDown={(e) => e.preventDefault()}
              className="absolute inset-x-0 top-[calc(100%+6px)] z-30 origin-top rounded-[16px] bg-surface p-1.5 shadow-[var(--shadow-overlay)]"
            >
              <div role="listbox" id={listId} aria-label="Suggestions" className="flex flex-col gap-0.5">
                {matches.map((s, i) => (
                  <div
                    key={s.value}
                    id={`${uid}-option-${i}`}
                    role="option"
                    aria-selected={i === hot}
                    onPointerMove={() => i !== hot && setActive(i)}
                    onClick={() => add([s.value])}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-[12px] px-2 py-1.5 transition-colors ${i === hot ? "bg-fg/5" : ""}`}
                  >
                    {avatars && (
                      <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[12px] font-medium text-fg">
                        {(s.label ?? s.value).trim().charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] leading-5 text-fg">{s.label ?? s.value}</span>
                      {(s.description ?? (s.label ? s.value : undefined)) && (
                        <span className="block truncate text-[13px] leading-[18px] text-fg-muted">{s.description ?? s.value}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {message && (
        <p id={msgId} className={`pt-1.5 text-[13px] leading-5 ${error ? "text-danger-text" : "text-fg-muted"}`}>
          {message}
        </p>
      )}
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
