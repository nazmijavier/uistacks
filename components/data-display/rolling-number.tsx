"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useReducedMotionConfig, useTransform } from "motion/react";

export type RollingNumberSize = "md" | "lg";
export type RollingNumberDirection = "up" | "down";

export interface RollingNumberProps {
  /** The number to show. When it changes, each digit that differs rolls to its new value. */
  value: number;
  /** Turns the number into text. Digits roll; everything else (currency, separators, units) stays put. Default: US dollars with cents. */
  format?: (value: number) => string;
  /** md: 20 px figures with a 20 px chip. lg: 36 px figures with a 24 px chip (default). */
  size?: RollingNumberSize;
  /**
   * The chip after the number. Leave it out and it shows the last change once the value moves
   * (+$1,284.60); pass a number to show that change instead; false hides it.
   */
  delta?: number | false;
  /** Formats the chip's amount, without its sign. Defaults to `format`. */
  formatDelta?: (amount: number) => string;
  /** Which way is good news: up (default) shows a rise in green and a fall in red; down swaps them. */
  goodDirection?: RollingNumberDirection;
  /** Ms between the digits that change, left to right (default 40). */
  stagger?: number;
  /** Reads the final value out once each roll lands, in a polite live region (default true). Turn it off for numbers that change every second. */
  announce?: boolean;
  /** Spoken before the value in the announcement, e.g. "Available balance". */
  label?: string;
  className?: string;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const formatUsd = (n: number) => usd.format(n);
const MINUS = "−";
/** The wheel: 0–9 twice, so a roll that passes 9 keeps going the same way. */
const WHEEL = Array.from({ length: 20 }, (_, i) => i % 10);
// A calm landing: no visible bounce, about half a second per wheel.
const ROLL = { type: "spring", stiffness: 170, damping: 24, mass: 1 } as const;
const SIZES: Record<RollingNumberSize, { text: string; gap: string; chip: string }> = {
  lg: { text: "text-[36px] leading-[44px] tracking-[-0.022em]", gap: "gap-x-3 gap-y-1", chip: "h-6 px-2 text-[13px] leading-5 tracking-[-0.003em]" },
  md: { text: "text-[20px] leading-6 tracking-[-0.017em]", gap: "gap-x-2 gap-y-1", chip: "h-5 px-1.5 text-[12px] leading-4" },
};

const noSubscribe = () => () => {};
/**
 * Reduced motion: the visitor's setting, or a parent MotionConfig set to "always" (a frozen preview). Read only after
 * hydration so the server and the first client render match.
 */
function useReduce() {
  const prefers = useReducedMotion();
  const forced = useReducedMotionConfig();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers || forced);
}

/** One odometer wheel. Its width comes from an invisible 0, so tabular figures never shift the line. */
function Wheel({ digit, dir, delay, enter, reduce }: { digit: number; dir: 1 | -1; delay: number; enter: boolean; reduce: boolean }) {
  // A wheel that appears after the first render (the number grew a digit) rolls in from 0.
  const [from] = useState(() => (enter && !reduce ? 0 : digit));
  const pos = useMotionValue(from);
  const y = useTransform(pos, (row) => `${-row * 5}%`);
  useEffect(() => {
    // Continue from where the wheel is now, even mid-roll, in the direction the number moved.
    const now = ((pos.get() % 10) + 10) % 10;
    if (Math.abs(now - digit) < 0.001) {
      pos.set(digit);
      return;
    }
    if (reduce) {
      pos.set(digit);
      return;
    }
    let start = now;
    let target = digit >= now ? digit : digit + 10;
    if (dir < 0) {
      start = now + 10;
      target = digit + 10 <= start ? digit + 10 : digit;
    }
    pos.set(start);
    const controls = animate(pos, target, { ...ROLL, delay: delay / 1000, onComplete: () => pos.set(target % 10) });
    return () => controls.stop();
  }, [digit, dir, delay, reduce, pos]);
  return (
    <span className="relative inline-block overflow-clip [mask-image:linear-gradient(to_bottom,transparent,#000_14%,#000_86%,transparent)]">
      <span className="invisible before:content-['0']" />
      <motion.span style={{ y }} className="absolute inset-x-0 top-0 flex flex-col items-center">
        {/* Generated digits: the wheel never ends up in copied text or textContent. */}
        {WHEEL.map((d, i) => (
          <span key={i} data-d={d} className="before:content-[attr(data-d)]" />
        ))}
      </motion.span>
    </span>
  );
}

/** Characters keyed from the right, so the cents stay put while the number grows a digit. */
const keyed = (text: string) => text.split("").map((c, i) => ({ c, key: text.length - i }));

/**
 * A number whose changed digits roll to their new values one after another, left to right, with a
 * chip for the change: up in green, down in red.
 */
export function RollingNumber({
  value,
  format = formatUsd,
  size = "lg",
  delta,
  formatDelta,
  goodDirection = "up",
  stagger = 40,
  announce = true,
  label,
  className = "",
}: RollingNumberProps) {
  const reduce = useReduce();
  const text = format(value);
  const s = SIZES[size];

  // The last value and its change, adjusted while rendering (no effect, no extra paint).
  const [last, setLast] = useState({ value, text, dir: 1 as 1 | -1, change: 0, delays: {} as Record<number, number>, changed: 0 });
  if (value !== last.value || text !== last.text) {
    const dir: 1 | -1 = value >= last.value ? 1 : -1;
    // Stagger only the digits that differ, counted from the left.
    const before = new Map(keyed(last.text).map((k) => [k.key, k.c]));
    const delays: Record<number, number> = {};
    let order = 0;
    for (const k of keyed(text)) {
      if (/\d/.test(k.c) && before.get(k.key) !== k.c) delays[k.key] = order++ * stagger;
    }
    setLast({ value, text, dir, change: value - last.value, delays, changed: order });
  }

  // New wheels (the number grew a digit) roll in; the ones from the first render stay still.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const shownDelta = delta === false ? null : typeof delta === "number" ? delta : last.change !== 0 ? last.change : null;
  const fmtDelta = formatDelta ?? format;
  const deltaText = shownDelta === null ? "" : `${shownDelta > 0 ? "+" : shownDelta < 0 ? MINUS : ""}${fmtDelta(Math.abs(shownDelta))}`;
  const good = shownDelta === null || shownDelta === 0 ? null : (shownDelta > 0) === (goodDirection === "up");
  const tone = good === null ? "bg-muted text-fg-muted" : good ? "bg-success-soft text-success-text" : "bg-danger-soft text-danger-text";

  // One announcement per change, once the last wheel has landed.
  const [spoken, setSpoken] = useState("");
  // The last text handled: skips the first render (and its Strict Mode replay), never a later return to it.
  const seenText = useRef(text);
  useEffect(() => {
    // Tracked while muted too, so turning announce on speaks only the next change.
    const changed = text !== seenText.current;
    seenText.current = text;
    if (!announce || !changed) return;
    setSpoken("");
    const words = shownDelta ? `, ${shownDelta > 0 ? "up" : "down"} ${fmtDelta(Math.abs(shownDelta))}` : "";
    const id = window.setTimeout(() => setSpoken(`${label ? `${label}: ` : ""}${text}${words}`), reduce ? 0 : 650 + last.changed * stagger);
    return () => window.clearTimeout(id);
    // Speak once per new text; the wording follows that text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, announce]);

  return (
    // The chip moves under the number when the line is too narrow for both.
    <span className={`relative inline-flex min-w-0 flex-wrap items-center ${s.gap} ${className}`}>
      <span className={`relative whitespace-nowrap font-medium text-fg tabular-nums ${s.text}`}>
        <span className="sr-only">{text}</span>
        <span aria-hidden className="inline-flex select-none">
          {keyed(text).map(({ c, key }) =>
            /\d/.test(c) ? (
              <Wheel key={key} digit={Number(c)} dir={last.dir} delay={last.delays[key] ?? 0} enter={mounted} reduce={reduce} />
            ) : (
              // Separators and signs are generated content too, so the hidden copy adds nothing to textContent.
              <span key={`${key}${c}`} data-c={c} className="whitespace-pre before:content-[attr(data-c)]" />
            )
          )}
        </span>
      </span>
      <AnimatePresence initial={false} mode="popLayout">
        {deltaText && (
          <motion.span
            key={`${deltaText}${last.value}`}
            initial={{ opacity: 0, y: reduce ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={reduce ? { duration: 0.15 } : { opacity: { duration: 0.28, delay: 0.08 }, y: { type: "spring", stiffness: 420, damping: 34, delay: 0.08 } }}
            className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-medium tabular-nums ${s.chip} ${tone}`}
          >
            {deltaText}
          </motion.span>
        )}
      </AnimatePresence>
      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </span>
  );
}
