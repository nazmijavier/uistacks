"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { CircleHelp } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export interface StepSliderLevel {
  value: string;
  /** The level name in the readout, e.g. "Standard". */
  label: string;
}

export interface StepSliderProps {
  /** The levels from low to high. The kit draws 3 or 5; 2 to 7 fit. A plain string is both value and label. */
  levels: (string | StepSliderLevel)[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string, index: number) => void;
  /** The setting's name, top left. */
  label?: ReactNode;
  /** Shows a help icon after the label; this text appears on hover or focus. */
  help?: ReactNode;
  /** The words under the two ends of the track ("Brief" and "Detailed"). Pressing one jumps to that end. */
  startLabel?: ReactNode;
  endLabel?: ReactNode;
  /** The value of the recommended level: its stop gets a ring, and the readout adds the tag while the thumb sits on it. */
  recommended?: string;
  /** The tag next to the level name on the recommended stop. */
  recommendedLabel?: string;
  disabled?: boolean;
  /** Posts the value with a form through a hidden input. */
  name?: string;
  className?: string;
  /** Names the slider when there is no label. */
  "aria-label"?: string;
}

const spring = { type: "spring", stiffness: 520, damping: 34 } as const;
const quick = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;
// Stop centres sit 4 px inside the rail ends, so the first and last dots start where the rail does.
const at = (f: number) => `calc(4px + ${f} * (100% - 8px))`;

/** One level on a short ordered scale: stops on a rail, the fill and the level name moving together. */
export function StepSlider({
  levels,
  value,
  defaultValue,
  onValueChange,
  label,
  help,
  startLabel,
  endLabel,
  recommended,
  recommendedLabel = "Recommended",
  disabled = false,
  name,
  className = "",
  "aria-label": ariaLabel,
}: StepSliderProps) {
  const id = useId();
  const reduce = useReduce();
  const items = levels.map((l) => (typeof l === "string" ? { value: l, label: l } : l));
  const n = items.length;
  const last = Math.max(1, n - 1);
  const [own, setOwn] = useState(defaultValue ?? items[0]?.value);
  const index = Math.max(0, items.findIndex((l) => l.value === (value ?? own)));
  const level = items[index];
  const rec = recommended === undefined ? -1 : items.findIndex((l) => l.value === recommended);
  const onRec = rec === index;

  // The level name rolls up when the level rises and down when it falls.
  const [prev, setPrev] = useState(index);
  const [dir, setDir] = useState(1);
  if (prev !== index) {
    setPrev(index);
    setDir(index > prev ? 1 : -1);
  }

  // One motion value drives the thumb and the fill's edge, so they never drift apart.
  const f = useMotionValue(index / last);
  const left = useTransform(f, (v) => at(Number(v.toFixed(4))));
  // The fill layer is clipped at the thumb's centre: the solid dots appear as the edge passes them.
  const clip = useTransform(f, (v) => `inset(0 calc(100% - 4px - ${Number(v.toFixed(4))} * (100% - 8px)) 0 0)`);
  useEffect(() => {
    const target = index / last;
    if (reduce) {
      f.set(target);
      return;
    }
    const run = animate(f, target, spring);
    return () => run.stop();
  }, [f, index, last, reduce]);

  const rail = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const [dragging, setDragging] = useState(false);
  // The stop under the pointer while hovering: it grows a little to show where a press lands.
  const [hover, setHover] = useState<number | null>(null);

  const select = (i: number) => {
    const next = items[Math.min(n - 1, Math.max(0, i))];
    if (!next || next.value === level?.value) return;
    if (value === undefined) setOwn(next.value);
    onValueChange?.(next.value, items.indexOf(next));
  };

  // The end words: a primary press jumps to that end and focuses the thumb, like a press on the rail.
  const toEnd = (i: number, e: { button: number }) => {
    if (disabled || e.button !== 0) return;
    thumb.current?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    select(i);
  };

  const nearest = (clientX: number) => {
    const r = rail.current?.getBoundingClientRect();
    if (!r || r.width <= 8) return index;
    const frac = (clientX - r.left - 4) / (r.width - 8);
    return Math.round(Math.min(1, Math.max(0, frac)) * last);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    // A pointer press focuses the thumb without the keyboard ring (focusVisible is newer than the DOM types).
    const quiet = { preventScroll: true, focusVisible: false };
    thumb.current?.focus(quiet);
    setDragging(true);
    select(nearest(e.clientX));
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const i = nearest(e.clientX);
    if (dragging) select(i);
    else if (e.pointerType === "mouse") setHover(i);
  };

  const end = () => setDragging(false);

  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (disabled) return;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? index + 1
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? index - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : undefined;
    if (next === undefined) return;
    e.preventDefault();
    select(next);
  };

  // `custom` hands the latest direction to the word that is leaving, too.
  const roll = {
    enter: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, y: 7 * d }),
    center: { opacity: 1, y: 0 },
    exit: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, y: -7 * d }),
  };
  const fade = disabled ? "opacity-50" : "";
  const labelId = `${id}-label`;
  const endsId = `${id}-ends`;
  const hasEnds = startLabel !== undefined || endLabel !== undefined;

  return (
    <div className={`flex w-full min-w-0 flex-col gap-2.5 ${className}`}>
      <div className="relative flex h-6 min-w-0 items-center gap-3">
        <div className="flex min-w-0 shrink items-center gap-0.5">
          {label && (
            <span id={labelId} className={`truncate text-sm font-medium leading-5 tracking-[-0.006em] text-fg ${fade}`}>
              {label}
            </span>
          )}
          {help && <Help text={help} reduce={reduce} faded={disabled} />}
        </div>
        {/* The readout repeats the slider's value text, so screen readers skip it. When the row is short it gives up
            space first: the tag wraps onto a second line that the 20 px box hides, so the label keeps its words. */}
        <div aria-hidden className={`ml-auto flex h-5 min-w-0 shrink-[1000] flex-wrap content-start items-center justify-end overflow-hidden ${fade}`}>
          <span className="inline-grid justify-items-end">
            <AnimatePresence initial={false} custom={dir}>
              <motion.span
                key={level?.value}
                custom={dir}
                variants={roll}
                initial="enter"
                animate="center"
                exit="exit"
                transition={quick}
                className="col-start-1 row-start-1 whitespace-nowrap text-sm font-medium leading-5 tracking-[-0.006em] text-fg-muted"
              >
                {level?.label}
              </motion.span>
            </AnimatePresence>
          </span>
          {/* The tag opens its own width, so the level name slides over instead of jumping. */}
          <AnimatePresence initial={false}>
            {onRec && (
              <motion.span
                key="rec"
                initial={reduce ? { opacity: 0 } : { opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, width: 0 }}
                transition={quick}
                className="flex overflow-hidden"
              >
                <span className="whitespace-nowrap pl-2 text-[11px] font-medium uppercase leading-4 tracking-[0.04em] text-fg-subtle">{recommendedLabel}</span>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className={`flex flex-col ${fade}`}>
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
          onPointerUp={end}
          onPointerCancel={end}
          onLostPointerCapture={end}
          className={`group/track relative h-7 touch-none select-none ${disabled ? "pointer-events-none" : "cursor-pointer"}`}
        >
          {/* The rail runs 10 px in from each side; stop centres sit 4 px inside it. */}
          <div ref={rail} className="absolute inset-y-0 left-2.5 right-2.5">
            <span
              className={`absolute inset-x-0 top-3 h-1 rounded-full transition-colors duration-150 ${
                dragging ? "bg-[var(--track-strong)]" : "bg-track group-hover/track:bg-[var(--track-strong)]"
              }`}
            />
            {items.map((l, i) => (
              <span
                key={l.value}
                aria-hidden
                style={{ left: at(i / last) }}
                className={`absolute top-2.5 size-2 -translate-x-1/2 rounded-full bg-surface shadow-[inset_0_0_0_1.5px_var(--fg-subtle)] transition-transform duration-150 ${
                  hover === i && i !== index ? "scale-125" : ""
                }`}
              />
            ))}
            <motion.div aria-hidden style={{ clipPath: clip }} className="absolute inset-0">
              <span className="absolute inset-x-0 top-3 h-1 rounded-full bg-[var(--inverse)]" />
              {items.map((l, i) => (
                <span
                  key={l.value}
                  style={{ left: at(i / last) }}
                  className={`absolute top-2.5 size-2 -translate-x-1/2 rounded-full bg-[var(--inverse)] transition-transform duration-150 ${
                    hover === i && i !== index ? "scale-125" : ""
                  }`}
                />
              ))}
            </motion.div>
            {rec >= 0 && (
              <span
                aria-hidden
                style={{ left: at(rec / last) }}
                className="absolute top-1.5 size-4 -translate-x-1/2 rounded-full shadow-[inset_0_0_0_1.5px_var(--fg-subtle)]"
              />
            )}
            <motion.span
              ref={thumb}
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-valuemin={1}
              aria-valuemax={n}
              aria-valuenow={index + 1}
              aria-valuetext={onRec ? `${level?.label}, ${recommendedLabel.toLowerCase()}` : level?.label}
              aria-orientation="horizontal"
              aria-disabled={disabled || undefined}
              aria-labelledby={label ? labelId : undefined}
              aria-label={label ? undefined : (ariaLabel ?? "Level")}
              aria-describedby={hasEnds ? endsId : undefined}
              onKeyDown={onKeyDown}
              style={{ left }}
              className="group/thumb absolute top-0 grid size-7 -translate-x-1/2 place-items-center rounded-full outline-none"
            >
              <span
                className={`block size-5 rounded-full bg-[var(--on-feature)] transition-shadow duration-150 group-focus-visible/thumb:ring-2 group-focus-visible/thumb:ring-[var(--select)] group-focus-visible/thumb:ring-offset-2 group-focus-visible/thumb:ring-offset-[var(--bg)] ${
                  dragging
                    ? "shadow-[0_0_0_4px_var(--track-strong),0_0_0_0.5px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.08),0_4px_14px_rgb(0_0_0/0.1)]"
                    : "shadow-[0_0_0_0.5px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.08),0_4px_14px_rgb(0_0_0/0.1)] group-hover/thumb:shadow-[0_0_0_4px_var(--edge),0_0_0_0.5px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.08),0_4px_14px_rgb(0_0_0/0.1)]"
                }`}
              />
            </motion.span>
          </div>
        </div>
        {hasEnds && (
          <div id={endsId} className="flex min-w-0 justify-between gap-2 text-xs leading-4 text-fg-subtle">
            {/* Pointer shortcuts to the ends; the keyboard has Home and End. */}
            <span onPointerDown={(e) => toEnd(0, e)} className={`min-w-0 truncate ${disabled ? "" : "cursor-pointer"}`}>
              {startLabel}
            </span>
            <span onPointerDown={(e) => toEnd(n - 1, e)} className={`min-w-0 truncate text-right ${disabled ? "" : "cursor-pointer"}`}>
              {endLabel}
            </span>
          </div>
        )}
      </div>
      {name && <input type="hidden" name={name} value={level?.value ?? ""} />}
    </div>
  );
}

/* The help icon after the label: its text shows on hover or focus and is always in the DOM for aria-describedby. */
function Help({ text, reduce, faded }: { text: ReactNode; reduce: boolean; faded: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  // Leaving the icon closes after a beat, so the pointer can cross the gap onto the tooltip and keep it open.
  const closing = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(closing.current), []);
  const enter = () => {
    clearTimeout(closing.current);
    setOpen(true);
  };
  const leave = () => {
    clearTimeout(closing.current);
    closing.current = setTimeout(() => setOpen(false), 120);
  };
  const from = reduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.96 };
  return (
    <>
      <button
        type="button"
        aria-label="More info"
        aria-describedby={`${id}-tip`}
        onPointerEnter={enter}
        onPointerLeave={leave}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className="grid size-6 shrink-0 place-items-center rounded-full text-fg-subtle outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
      >
        <CircleHelp size={16} strokeWidth={1.5} className={faded ? "opacity-50" : ""} />
      </button>
      <span id={`${id}-tip`} className="sr-only">
        {text}
      </span>
      <AnimatePresence>
        {open && (
          <motion.span
            aria-hidden
            initial={from}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ ...from, transition: { duration: 0.12 } }}
            transition={spring}
            onPointerEnter={enter}
            onPointerLeave={leave}
            className="absolute bottom-full left-0 z-20 mb-1.5 w-max max-w-[240px] origin-bottom-left rounded-[12px] bg-[var(--inverse)] px-2.5 py-1.5 text-xs leading-4 text-[var(--inverse-fg)] shadow-[var(--shadow-card)]"
          >
            {text}
          </motion.span>
        )}
      </AnimatePresence>
    </>
  );
}
