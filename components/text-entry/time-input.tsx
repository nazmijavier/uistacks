"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { Check, ChevronDown, Clock } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type TimeInputSize = "sm" | "md";
export type HourCycle = 12 | 24;

/** Drive the suggestions from code, e.g. in a product tour. None of these move focus except `focus`. */
export interface TimeInputHandle {
  /** Focuses the hour. */
  focus: () => void;
  setOpen: (open: boolean) => void;
  /** Highlights a suggestion ("16:30") as if the pointer were over it; null clears it. */
  highlight: (time: string | null) => void;
}

export interface TimeInputProps {
  /** "HH:MM" on a 24-hour clock ("16:30"), or "" until both the hour and the minutes are filled. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** 12 shows 1–12 with an AM/PM toggle, 24 shows 00–23. The value is always 24-hour. */
  hourCycle?: HourCycle;
  /** Minutes per arrow press on the minutes. Typed minutes can be anything. */
  step?: number;
  /** Adds a list of suggested times every this many minutes (15 or 30), opened by the chevron or Alt + ↓. */
  suggestions?: number;
  /** The earliest allowed time, "HH:MM". Earlier times show an error and are left out of the suggestions. */
  min?: string;
  /** The latest allowed time, "HH:MM". */
  max?: string;
  /** A time to count from, "HH:MM" (usually now): the hint reads "In 2 hours", wrapping past midnight. */
  relativeTo?: string;
  /** 32 or 36 px tall. */
  size?: TimeInputSize;
  label?: ReactNode;
  /** Helper text under the field, shown while there is no "In 2 hours" line. An error takes its place. */
  hint?: ReactNode;
  /** Error text under the field. Without it, a time outside min / max explains the range. */
  error?: ReactNode;
  disabled?: boolean;
  /** Adds a hidden input so the "HH:MM" value posts with a form. */
  name?: string;
  /** The id of the hour field, which the label points at. */
  id?: string;
  /** Names the field when there is no label. */
  "aria-label"?: string;
  ref?: Ref<TimeInputHandle>;
  className?: string;
}

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;
const snappy = { type: "spring", stiffness: 520, damping: 34 } as const;
const ring = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

/** The suggestion list: its tallest, and the least it shrinks to (three rows) when the room around the field is short. */
const LIST_MAX = 238;
const LIST_MIN = 124;

const SIZES: Record<TimeInputSize, { box: string; text: string; seg: string; period: string; trigger: string; icon: number }> = {
  sm: { box: "h-8 rounded-[12px] pl-2 pr-1 gap-0.5", text: "text-[13px] leading-5", seg: "h-6 w-[24px] rounded-[6px]", period: "h-5 px-1.5", trigger: "size-6", icon: 16 },
  md: { box: "h-9 rounded-[14px] pl-2.5 pr-1 gap-0.5", text: "text-[14px] leading-5", seg: "h-7 w-[26px] rounded-[8px]", period: "h-6 px-2", trigger: "size-7", icon: 16 },
};

/** The time as segments. In 12-hour mode `h` is 1–12 and `pm` says which half; in 24-hour mode `h` is 0–23. */
type Parts = { h: number | null; m: number | null; pm: boolean };
type Seg = "h" | "m";

const pad = (n: number) => String(n).padStart(2, "0");

/** "16:30" → 990 minutes after midnight, or null when it isn't a time. */
const toMinutes = (v: string | undefined) => {
  const hit = /^(\d{1,2}):(\d{2})$/.exec(v ?? "");
  if (!hit) return null;
  const [h, m] = [Number(hit[1]), Number(hit[2])];
  return h < 24 && m < 60 ? h * 60 + m : null;
};
const fromMinutes = (t: number) => `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;

function partsOf(value: string | undefined, cycle: HourCycle): Parts {
  const t = toMinutes(value);
  if (t === null) return { h: null, m: null, pm: false };
  const [H, M] = [Math.floor(t / 60), t % 60];
  return { h: cycle === 12 ? H % 12 || 12 : H, m: M, pm: H >= 12 };
}

function valueOf(p: Parts, cycle: HourCycle) {
  if (p.h === null || p.m === null) return "";
  const H = cycle === 12 ? (p.h % 12) + (p.pm ? 12 : 0) : p.h;
  return fromMinutes(H * 60 + p.m);
}

/** 990 → "4:30 PM" (12-hour) or "16:30" (24-hour). */
export function formatTime(t: number, cycle: HourCycle = 12) {
  const [H, M] = [Math.floor(t / 60), t % 60];
  return cycle === 12 ? `${H % 12 || 12}:${pad(M)} ${H >= 12 ? "PM" : "AM"}` : `${pad(H)}:${pad(M)}`;
}

/** How long from one time to the next, wrapping past midnight: "2 hours", "45 minutes", "2 h 15 min". */
function between(from: number, to: number) {
  const d = (to - from + 1440) % 1440;
  const [h, m] = [Math.floor(d / 60), d % 60];
  if (h === 0) return `${m} minute${m === 1 ? "" : "s"}`;
  if (m === 0) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${h} h ${m} min`;
}

export function TimeInput({
  value,
  defaultValue = "",
  onValueChange,
  hourCycle = 12,
  step = 1,
  suggestions,
  min,
  max,
  relativeTo,
  size = "md",
  label,
  hint,
  error,
  disabled = false,
  name,
  id,
  "aria-label": ariaLabel = "Time",
  ref,
  className = "",
}: TimeInputProps) {
  const uid = useId();
  const hourId = id ?? `${uid}-hour`;
  const labelId = `${uid}-label`;
  const msgId = `${uid}-message`;
  const listId = `${uid}-list`;
  const optionId = (t: number) => `${uid}-option-${t}`;
  const reduce = useReduce();
  const s = SIZES[size];
  const cycle = hourCycle;

  // The segments are the truth while someone types: "4 : --" is a real state even though the value is still "".
  const [parts, setParts] = useState(() => partsOf(value ?? defaultValue, cycle));
  // A controlled value (or hour cycle) that changed from outside re-reads the segments. What we emitted ourselves
  // doesn't, so clearing the minutes of "16:30" keeps the 4.
  const [seen, setSeen] = useState({ value, cycle });
  if (seen.cycle !== cycle || (value !== undefined && value !== seen.value)) {
    setSeen({ value, cycle });
    setParts(partsOf(value ?? valueOf(parts, seen.cycle), cycle));
  }

  // Digits typed into a segment in quick succession build one number ("1", then "1" → 11).
  const [typing, setTyping] = useState<{ seg: Seg; text: string; at: number } | null>(null);
  const [open, setOpenState] = useState(false);
  // The list opens below the field and flips above it when only the space above fits it. When neither side fits, it
  // takes the roomier side and its height is capped to that room (never under three rows).
  const [up, setUp] = useState(false);
  const [maxH, setMaxH] = useState<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);

  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);
  const periodRef = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  // Where focus goes back to when the list closes: the chevron, or the segment that opened it with Alt + ↓.
  const returnTo = useRef<HTMLElement | null>(null);
  const takeFocus = useRef(false);
  const nudge = { h: useAnimationControls(), m: useAnimationControls() };

  const current = valueOf(parts, cycle);
  const t = toMinutes(current);
  const lo = toMinutes(min) ?? 0;
  const hi = toMinutes(max) ?? 1439;
  const outside = t !== null && (t < lo || t > hi);

  const commit = (next: Parts) => {
    setParts(next);
    const v = valueOf(next, cycle);
    if (v === current) return;
    setSeen({ value: v, cycle });
    onValueChange?.(v);
  };

  const segRef = (seg: Seg) => (seg === "h" ? hourRef : minuteRef);
  const focusSeg = (seg: Seg) => segRef(seg).current?.focus();

  // ---- Typing ----
  const hourMin = cycle === 12 ? 1 : 0;
  const hourMax = cycle === 12 ? 12 : 23;

  const typeDigit = (seg: Seg, d: string, at: number) => {
    const max = seg === "h" ? hourMax : 59;
    const prev = typing && typing.seg === seg && at - typing.at < 1200 ? typing.text : "";
    let text = prev + d;
    // "13" on a 12-hour clock can't be an hour, so the 3 starts a new one.
    if (text.length === 2 && Number(text) > max) text = d;
    const n = Number(text);
    if (seg === "m" || n >= hourMin) commit({ ...parts, [seg]: n });
    // Done when no second digit could follow: a 4 in the hour, a 7 in the minutes, or two digits.
    if (text.length === 2 || n * 10 > max) {
      setTyping(null);
      if (seg === "h") focusSeg("m");
    } else setTyping({ seg, text, at });
  };

  const stepSeg = (seg: Seg, dir: 1 | -1) => {
    setTyping(null);
    if (seg === "h") {
      const span = hourMax - hourMin + 1;
      const h = parts.h === null ? (dir > 0 ? hourMin : hourMax) : ((parts.h - hourMin + dir + span) % span) + hourMin;
      commit({ ...parts, h });
    } else {
      // Snaps to the step: 4:07 goes up to 4:10 with a step of 5.
      const raw = parts.m === null ? (dir > 0 ? 0 : 60 - step) : dir > 0 ? (Math.floor(parts.m / step) + 1) * step : (Math.ceil(parts.m / step) - 1) * step;
      commit({ ...parts, m: ((raw % 60) + 60) % 60 });
    }
    // the new number rolls in from the side it came from
    if (!reduce) void nudge[seg].start({ y: [dir * 6, 0], opacity: [0.35, 1], transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } });
  };

  const setPeriod = (pm: boolean) => {
    if (pm !== parts.pm) commit({ ...parts, pm });
  };

  const onSegKey = (seg: Seg, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.altKey && e.key === "ArrowDown" && suggestions) {
      e.preventDefault();
      returnTo.current = e.currentTarget;
      show(true);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (/^\d$/.test(k)) {
      e.preventDefault();
      typeDigit(seg, k, e.timeStamp);
    } else if (k === "ArrowUp" || k === "ArrowDown") {
      e.preventDefault();
      stepSeg(seg, k === "ArrowUp" ? 1 : -1);
    } else if (k === "Home" || k === "End") {
      e.preventDefault();
      setTyping(null);
      commit({ ...parts, [seg]: k === "Home" ? (seg === "h" ? hourMin : 0) : seg === "h" ? hourMax : 59 });
    } else if (k === "Backspace" || k === "Delete") {
      e.preventDefault();
      setTyping(null);
      if (parts[seg] === null && k === "Backspace" && seg === "m") focusSeg("h");
      else commit({ ...parts, [seg]: null });
    } else if (k === "ArrowRight" || ((k === ":" || k === ".") && seg === "h")) {
      e.preventDefault();
      setTyping(null);
      if (seg === "h") focusSeg("m");
      else (periodRef.current?.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus();
    } else if (k === "ArrowLeft") {
      e.preventDefault();
      setTyping(null);
      if (seg === "m") focusSeg("h");
    } else if (cycle === 12 && /^[ap]$/i.test(k)) {
      e.preventDefault();
      setPeriod(k.toLowerCase() === "p");
    } else if (k.length === 1) {
      // Anything else printable is ignored, so the segment never shows stray text.
      e.preventDefault();
    }
  };

  /** Pasting "4:30 pm", "16:30" or "0930" fills every segment at once. */
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const hit = /(\d{1,2})\s*[:.h]?\s*(\d{2})\s*([ap])?/i.exec(e.clipboardData.getData("text"));
    e.preventDefault();
    if (!hit) return;
    let H = Number(hit[1]);
    const M = Number(hit[2]);
    if (hit[3] && H <= 12) H = (H % 12) + (hit[3].toLowerCase() === "p" ? 12 : 0);
    if (H > 23 || M > 59) return;
    setTyping(null);
    commit(partsOf(fromMinutes(H * 60 + M), cycle));
  };

  // ---- Suggestions ----
  const every = suggestions && suggestions > 0 ? suggestions : 0;
  const options: number[] = [];
  if (every) for (let x = Math.ceil(lo / every) * every; x <= hi; x += every) options.push(x);
  const from = toMinutes(relativeTo);

  const setOpen = (next: boolean, focus = false) => {
    if (disabled || !every) return;
    if (next) {
      // Starts on the current time, or the next suggestion after it (or after `relativeTo`).
      const anchor = t ?? from ?? -1;
      const i = options.findIndex((x) => x >= anchor);
      setActive(i === -1 ? options.length - 1 : i);
      takeFocus.current = focus;
    }
    setOpenState(next);
  };
  const show = (focus: boolean) => setOpen(true, focus);

  const close = (refocus: boolean) => {
    setOpenState(false);
    if (refocus) (returnTo.current ?? trigger.current)?.focus();
    returnTo.current = null;
  };

  const pick = (x: number) => {
    setTyping(null);
    commit(partsOf(fromMinutes(x), cycle));
    close(true);
  };

  useImperativeHandle(ref, () => ({
    focus: () => hourRef.current?.focus(),
    setOpen: (next: boolean) => setOpen(next, false),
    highlight: (time) => setActive(time === null ? -1 : options.indexOf(toMinutes(time) ?? -1)),
  }));

  useEffect(() => {
    if (open && takeFocus.current) list.current?.focus({ preventScroll: true });
    takeFocus.current = false;
  }, [open]);

  // Flip the list above the field when it doesn't fit below inside whatever clips the field (else the viewport) and
  // there is more room above. Screen px, so it stays right inside zoomed or scaled previews.
  useLayoutEffect(() => {
    const m = panel.current;
    const field = m?.parentElement;
    if (!open || !m || !field) return;
    const r = field.getBoundingClientRect();
    const k = field.offsetHeight ? r.height / field.offsetHeight : 1;
    let top = 0;
    let bottom = window.innerHeight;
    for (let p = field.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      // Only a vertical clip matters here (the site page clips x alone, which leaves y visible).
      if (cs.overflowY !== "visible") {
        const b = p.getBoundingClientRect();
        top = b.top;
        bottom = b.bottom;
        break;
      }
    }
    const below = bottom - r.bottom;
    const above = r.top - top;
    // The list's own height without a cap (the panel's padding sits inside the list, so they match).
    const natural = Math.min(LIST_MAX, list.current?.scrollHeight ?? m.offsetHeight);
    const fits = below >= (natural + 6) * k;
    const flip = !fits && above > below;
    setUp(flip);
    const room = Math.floor((flip ? above : below) / k) - 6 - 8;
    // Whole rows only (36 px rows, 2 px gaps, 6 px padding), so the last row is never cut.
    setMaxH(fits || room >= natural ? null : Math.max(LIST_MIN, Math.floor((room - 10) / 38) * 38 + 10));
  }, [open]);

  // An outside press closes the list.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpenState(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Keeps the highlighted time in view by scrolling the list only (never the page): centred as it opens, then nearest.
  const centred = useRef(false);
  const centredAt = useRef<number | null>(null);
  useEffect(() => {
    const box = list.current;
    const el = active >= 0 ? document.getElementById(`${uid}-option-${options[active]}`) : null;
    // A new height cap centres again.
    if (!open || centredAt.current !== maxH) centred.current = false;
    centredAt.current = maxH;
    if (!open || !box || !el) return;
    // Centred on whole rows, so the top and bottom rows are never cut (the list is a whole number of rows tall).
    const pitch = el.offsetHeight + 2;
    const rows = Math.max(1, Math.floor((box.clientHeight - 10) / pitch));
    if (!centred.current) box.scrollTop = el.offsetTop - 6 - Math.floor((rows - 1) / 2) * pitch;
    else if (el.offsetTop < box.scrollTop + 6) box.scrollTop = el.offsetTop - 6;
    else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight - 6) box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight + 6;
    centred.current = true;
    // options changes identity every render; its content follows min, max and suggestions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active, uid, lo, hi, every, maxH]);

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = options.length - 1;
    const move = (i: number) => {
      e.preventDefault();
      setActive(Math.max(0, Math.min(last, i)));
    };
    if (e.key === "ArrowDown") move(active + 1);
    else if (e.key === "ArrowUp") move(active - 1);
    else if (e.key === "PageDown") move(active + 4);
    else if (e.key === "PageUp") move(active - 4);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(last);
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (options[active] !== undefined) pick(options[active]);
    } else if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      close(true);
    }
  };

  // ---- Messages ----
  // Short enough for one line under the field: "Pick 6:00–11:00 AM." (a shared AM/PM is written once).
  const [loText, hiText] = [formatTime(lo, cycle), formatTime(hi, cycle)];
  const span = cycle === 12 && loText.slice(-3) === hiText.slice(-3) ? `${loText.slice(0, -3)}–${hiText}` : `${loText}–${hiText}`;
  const range = min && max ? span : min ? `a time after ${loText}` : `a time before ${hiText}`;
  const rangeError = outside ? `Pick ${range}.` : null;
  const invalid = Boolean(error) || outside;
  const relative = t !== null && from !== null && !outside ? (t === from ? "Right now" : `In ${between(from, t)}`) : null;
  const message = error || rangeError || relative || hint;

  // US 12-hour times don't zero-pad the hour ("9 : 00 AM"); the fixed segment width keeps the colon still.
  const unpadded = (seg: Seg) => seg === "h" && cycle === 12;
  const shown = (seg: Seg) =>
    typing?.seg === seg
      ? unpadded(seg) ? typing.text.replace(/^0(?=\d)/, "") : typing.text.padStart(2, "0")
      : parts[seg] === null ? "--" : unpadded(seg) ? String(parts[seg]) : pad(parts[seg]);
  const edge = invalid ? "shadow-[0_0_0_1px_var(--danger)]" : "shadow-[var(--shadow-control)]";
  const focus = `has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-offset-2 has-[input:focus-visible]:ring-offset-[var(--bg)] ${
    invalid ? "has-[input:focus-visible]:ring-[var(--danger)]" : "has-[input:focus-visible]:ring-[var(--select)]"
  }`;

  const segment = (seg: Seg) => {
    const n = parts[seg];
    const valueText = n === null ? "Empty" : seg === "h" && cycle === 12 ? `${n} ${parts.pm ? "PM" : "AM"}` : String(n);
    return (
      <motion.span animate={nudge[seg]} className="flex">
        <input
          ref={segRef(seg)}
          id={seg === "h" ? hourId : undefined}
          type="text"
          inputMode="numeric"
          role="spinbutton"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          aria-label={seg === "h" ? "Hours" : "Minutes"}
          aria-valuemin={seg === "h" ? hourMin : 0}
          aria-valuemax={seg === "h" ? hourMax : 59}
          aria-valuenow={n ?? undefined}
          aria-valuetext={valueText}
          aria-invalid={invalid || undefined}
          aria-describedby={message ? msgId : undefined}
          value={shown(seg)}
          onKeyDown={(e) => onSegKey(seg, e)}
          // Phones send text instead of key presses: take the last digit typed.
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, "").slice(-1);
            if (d) typeDigit(seg, d, e.timeStamp);
          }}
          onPaste={onPaste}
          onBlur={() => setTyping(null)}
          className={`${s.seg} ${s.text} cursor-default bg-transparent text-center tabular-nums caret-transparent outline-none transition-colors duration-100 selection:bg-transparent focus:bg-select-soft focus:text-select-text disabled:cursor-not-allowed ${
            n === null && typing?.seg !== seg ? "text-fg-subtle" : "text-fg"
          }`}
        />
      </motion.span>
    );
  };

  return (
    <div ref={root} className={`inline-flex min-w-0 max-w-full flex-col self-start justify-self-start ${className}`}>
      {label && (
        <label id={labelId} htmlFor={hourId} className="mb-1.5 w-fit text-sm font-medium leading-5 text-fg">
          {label}
        </label>
      )}
      <div className="relative">
        <div
          role="group"
          aria-labelledby={label ? labelId : undefined}
          aria-label={label ? undefined : ariaLabel}
          onMouseDown={(e) => {
            // a press on the padding or the clock focuses the hour
            if (disabled || e.target !== e.currentTarget) return;
            e.preventDefault();
            hourRef.current?.focus();
          }}
          className={`flex w-full items-center bg-surface transition-[background-color,box-shadow] duration-150 ${s.box} ${edge} ${focus} ${
            disabled ? "cursor-not-allowed opacity-50" : ""
          }`}
        >
          <Clock aria-hidden size={s.icon} strokeWidth={1.5} className="pointer-events-none mr-1 shrink-0 text-fg-subtle" />
          {segment("h")}
          <span aria-hidden className={`pointer-events-none ${s.text} text-fg-subtle`}>
            :
          </span>
          {segment("m")}

          {cycle === 12 && (
            <div
              ref={periodRef}
              role="radiogroup"
              aria-label="AM or PM"
              onKeyDown={(e) => {
                const k = e.key;
                if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown") {
                  e.preventDefault();
                  setPeriod(!parts.pm);
                  // focus follows the checked option, as in any radio group
                  requestAnimationFrame(() => (periodRef.current?.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus());
                } else if (/^[ap]$/i.test(k)) {
                  e.preventDefault();
                  setPeriod(k.toLowerCase() === "p");
                }
              }}
              className="ml-1.5 isolate flex shrink-0 rounded-full bg-subtle p-0.5"
            >
              {(["AM", "PM"] as const).map((p) => {
                const on = (p === "PM") === parts.pm;
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabIndex={on ? 0 : -1}
                    disabled={disabled}
                    onClick={() => setPeriod(p === "PM")}
                    className={`relative flex items-center rounded-full text-[12px] font-medium leading-4 transition-colors duration-150 ${s.period} ${ring} ${
                      on ? "text-fg" : "text-fg-muted hover:text-fg"
                    }`}
                  >
                    {on && (
                      <motion.span
                        layoutId={`${uid}-period`}
                        transition={reduce ? { duration: 0 } : snappy}
                        className="absolute inset-0 rounded-full bg-surface shadow-[var(--shadow-btn-secondary)] dark:bg-raised"
                      />
                    )}
                    {/* z-10 keeps both labels above the thumb while it slides across the other button. */}
                    <span className="relative z-10">{p}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Pushes the chevron to the end when the field is stretched (w-full); 4 px when it hugs. */}
          {every > 0 && <span aria-hidden className="min-w-1 flex-1" />}
          {every > 0 && (
            <button
              ref={trigger}
              type="button"
              disabled={disabled}
              aria-label="Suggested times"
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              onClick={() => {
                returnTo.current = null;
                if (open) close(false);
                else show(true);
              }}
              className={`grid shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-muted hover:text-fg disabled:cursor-not-allowed ${s.trigger} ${ring} ${open ? "bg-muted text-fg" : ""}`}
            >
              <motion.span aria-hidden initial={false} animate={{ rotate: open ? 180 : 0 }} transition={reduce ? { duration: 0 } : spring} className="flex">
                <ChevronDown size={16} strokeWidth={1.75} />
              </motion.span>
            </button>
          )}
          {cycle === 24 && !every && <span aria-hidden className="w-1.5" />}
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              ref={panel}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: up ? 4 : -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: up ? 4 : -4, transition: { duration: 0.12 } }}
              transition={spring}
              className={`absolute left-0 z-30 w-full min-w-[220px] rounded-[16px] bg-surface p-1.5 shadow-[var(--shadow-overlay)] dark:bg-raised ${
                up ? "bottom-[calc(100%+6px)] origin-bottom-left" : "top-[calc(100%+6px)] origin-top-left"
              }`}
            >
              {/* Scrolls inside its own padding, so the highlight is never cut. */}
              <div
                ref={list}
                id={listId}
                role="listbox"
                tabIndex={-1}
                aria-label="Suggested times"
                aria-activedescendant={active >= 0 && options[active] !== undefined ? optionId(options[active]) : undefined}
                onKeyDown={onListKey}
                onBlur={(e) => {
                  const to = e.relatedTarget as Node | null;
                  if (to && !root.current?.contains(to)) setOpenState(false);
                }}
                style={{ maxHeight: maxH ?? LIST_MAX }}
                className="-m-1.5 flex flex-col gap-0.5 overflow-y-auto overscroll-contain p-1.5 outline-none"
              >
                {options.map((x, i) => {
                  const on = x === t;
                  const hot = i === active;
                  return (
                    <div
                      key={x}
                      id={optionId(x)}
                      role="option"
                      aria-selected={on}
                      // keeps focus on the list while the pointer picks
                      onMouseDown={(e) => e.preventDefault()}
                      onPointerMove={() => !hot && setActive(i)}
                      onClick={() => pick(x)}
                      className={`flex min-h-9 shrink-0 cursor-pointer items-center gap-2 rounded-[12px] px-2.5 py-2 transition-colors duration-100 ${
                        on ? (hot ? "bg-fg/15" : "bg-fg/10") : hot ? "bg-fg/[0.06]" : ""
                      }`}
                    >
                      <span className={`flex-1 whitespace-nowrap text-[14px] leading-5 tabular-nums text-fg ${on ? "font-medium" : ""}`}>{formatTime(x, cycle)}</span>
                      {from !== null && <span className="shrink-0 whitespace-nowrap text-[13px] leading-5 tabular-nums text-fg-muted">{x === from ? "Now" : between(from, x)}</span>}
                      <span className="flex size-4 shrink-0 text-select">{on && <Check size={16} strokeWidth={1.75} aria-hidden />}</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {name && <input type="hidden" name={name} value={current} />}
      <AnimatePresence initial={false}>
        {message && (
          <motion.div
            key="message"
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={spring}
            // w-0 + min-w-full: the message wraps inside the field's width instead of widening the field.
            className="w-0 min-w-full overflow-hidden"
          >
            <p id={msgId} className={`pt-1.5 text-[13px] leading-5 ${invalid ? "text-danger-text" : "text-fg-muted"}`}>
              {message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Always mounted, so screen readers announce the message when it appears or changes. */}
      {/* The static hint is only read through aria-describedby, never announced again here. */}
      <span role="status" aria-live="polite" className="sr-only">
        {error || rangeError || relative}
      </span>
    </div>
  );
}
