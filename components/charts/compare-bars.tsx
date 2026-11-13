"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, useSyncExternalStore } from "react";
import { AnimatePresence, animate, motion, useInView, useReducedMotion } from "motion/react";

export interface CompareBarsPeriod {
  /** Unique id, e.g. "this-week". */
  id: string;
  /** Segmented control text, e.g. "This week". */
  label: string;
  /** Under the title, e.g. "Nov 2 – 8". */
  range?: string;
  /** One value per slot; null marks a day still to come, drawn as a stub. */
  values: (number | null)[];
  /** Long names per slot for the tooltip and the Biggest day tile, e.g. "Tue, Nov 3". */
  days?: string[];
}

export interface CompareBarsProps {
  /** Card title, e.g. "Spending". */
  title: string;
  /** Short axis names, one per slot, e.g. Mon … Sun. */
  labels: string[];
  /** Two (or more) periods to flip between. */
  periods: CompareBarsPeriod[];
  /** The period shown (controlled). */
  value?: string;
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  format?: (value: number) => string;
  /** The line under the total, e.g. "spent so far · 4 of 7 days". Gets the counts and whether the period is complete. */
  describe?: (info: { count: number; length: number; complete: boolean }) => string;
  /** Biggest day and Daily average tiles next to the card (default true). */
  stats?: boolean;
  /** Tile titles (default "Biggest day", "Daily average"). */
  statLabels?: [string, string];
  /** Compare with the next (earlier) period in `periods`: a change line by the total over the same days, dashed outlines
   *  over every day (to-come days too), and the other period's figure at the foot of each tile. Default false. */
  compare?: boolean;
  /** Bar area height in px (default 120); 16 px of tooltip room is added above it (the tooltip may float over the header). */
  height?: number;
  className?: string;
}

const ease = [0.22, 1, 0.36, 1] as const;
const spring = { type: "spring", stiffness: 420, damping: 34 } as const;
const ring = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
const card = "rounded-[20px] bg-surface p-5 shadow-[var(--shadow-card)]";

/** Counts from the last shown number to the new one. */
function Rolling({ value, format, reduce }: { value: number; format: (v: number) => string; reduce: boolean }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const controls = animate(from.current, value, {
      duration: reduce ? 0 : 0.6,
      ease,
      onUpdate: (v) => {
        from.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [value, reduce]);
  return <>{format(shown)}</>;
}

/** The other period's figure at the foot of a tile. */
function TileFoot({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-auto pt-4">
      <p className="flex items-center justify-between gap-3 border-t border-[var(--border-soft)] pt-3 text-[13px] leading-5">
        <span className="truncate text-fg-muted">{label}</span>
        <span className="shrink-0 font-medium tabular-nums text-fg">{value}</span>
      </p>
    </div>
  );
}

const noSubscribe = () => () => {};

/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export function CompareBars({
  title,
  labels,
  periods,
  value: valueProp,
  defaultValue,
  onValueChange,
  format = (v) => v.toLocaleString("en-US", { style: "currency", currency: "USD" }),
  describe = ({ count, length, complete }) => (complete ? `in total · ${length} days` : `so far · ${count} of ${length} days`),
  stats = true,
  statLabels = ["Biggest day", "Daily average"],
  compare = false,
  height = 120,
  className = "",
}: CompareBarsProps) {
  const uid = useId();
  const reduce = useReduce();
  const [own, setOwn] = useState(defaultValue ?? periods[0]?.id);
  const current = valueProp ?? own;
  const period = periods.find((p) => p.id === current) ?? periods[0];
  // Only a switch the user made is read out, never the first render.
  const [picked, setPicked] = useState(false);
  const select = (id: string) => {
    if (valueProp === undefined) setOwn(id);
    setPicked(true);
    onValueChange?.(id);
  };

  const plotRef = useRef<HTMLDivElement>(null);
  const inView = useInView(plotRef, { once: true, amount: 0.4 });
  const grown = inView || reduce;
  const [active, setActive] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const bars = useRef<(HTMLDivElement | null)[]>([]);

  const values = period.values;
  const known = values.filter((v): v is number => v !== null);
  const total = known.reduce((a, b) => a + b, 0);
  const top = Math.max(1, ...periods.flatMap((p) => p.values.filter((v): v is number => v !== null)));
  const peak = known.length ? values.indexOf(Math.max(...known)) : -1;
  const average = known.length ? total / known.length : 0;
  const complete = known.length === values.length;
  const dayName = (i: number) => period.days?.[i] ?? labels[i];

  // The period compared against: the next one in the list (the earlier one), else the one before it for the tiles.
  const index = periods.indexOf(period);
  const earlier = compare ? periods[index + 1] : undefined;
  const other = compare ? (earlier ?? periods[index - 1]) : undefined;
  const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
  const sum = (list: (number | null)[]) => list.reduce<number>((a, b) => a + (b ?? 0), 0);
  const otherKnown = other ? other.values.filter((v): v is number => v !== null) : [];
  const otherPeak = otherKnown.length ? Math.max(...otherKnown) : null;
  const otherAverage = otherKnown.length ? sum(otherKnown) / otherKnown.length : null;
  // The change line compares the same days: as many as this period has so far.
  const delta = earlier ? total - sum(earlier.values.slice(0, known.length)) : null;
  const sign = (v: number) => (v >= 0 ? "+" : "−");
  const deltaShort = delta === null ? "" : `${sign(delta)}${format(Math.abs(delta))} vs ${lower(earlier!.label)}`;
  const deltaText =
    delta === null ? "" : `${sign(delta)}${format(Math.abs(delta))} vs ${complete ? lower(earlier!.label) : `the same ${known.length} days ${lower(earlier!.label)}`}`;
  const describeText = describe({ count: known.length, length: values.length, complete });

  const move = (to: number) => {
    const next = Math.max(0, Math.min(labels.length - 1, to));
    setFocusIndex(next);
    bars.current[next]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, i: number) => {
    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? labels.length - 1 : null;
    if (to !== null) {
      e.preventDefault();
      move(to);
    } else if (e.key === "Escape") setActive(null);
  };
  const onSegKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = periods.findIndex((p) => p.id === period.id);
    const next = periods[(i + (e.key === "ArrowRight" ? 1 : periods.length - 1)) % periods.length];
    select(next.id);
    (e.currentTarget.parentElement?.querySelector(`[data-id="${next.id}"]`) as HTMLElement | null)?.focus();
  };

  const swap = reduce ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } } : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 } };

  return (
    <div className={`flex w-full min-w-0 flex-wrap items-stretch gap-4 ${className}`}>
      <div className={`${card} flex min-w-[280px] flex-[2_1_360px] flex-col`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-medium leading-5 tracking-[-0.01em] text-fg">{title}</p>
            <div className="relative mt-0.5 h-5 overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.p key={period.id} {...swap} transition={spring} className="text-[13px] leading-5 text-fg-muted">
                  {period.range}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>
          <div role="radiogroup" aria-label={`${title} period`} className="flex h-8 shrink-0 items-center rounded-full bg-[color-mix(in_srgb,var(--fg)_6%,transparent)] p-0.5">
            {periods.map((p) => {
              const on = p.id === period.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  data-id={p.id}
                  onClick={() => select(p.id)}
                  onKeyDown={onSegKey}
                  className={`relative h-7 rounded-full px-3 text-[13px] font-medium leading-5 transition-colors duration-150 ${ring} ${on ? "text-fg" : "text-fg-muted hover:text-fg"}`}
                >
                  {on && (
                    <motion.span
                      layoutId={`${uid}-period-pill`}
                      transition={reduce ? { duration: 0 } : spring}
                      className="absolute inset-0 rounded-full bg-surface shadow-[var(--shadow-btn-secondary)] dark:bg-raised"
                    />
                  )}
                  <span className="relative">{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-x-3">
          <p className="text-[32px] font-medium leading-10 tracking-[-0.02em] text-fg tabular-nums">
            <Rolling value={total} format={format} reduce={reduce} />
          </p>
          <AnimatePresence mode="popLayout" initial={false}>
            {deltaShort && (
              <motion.span
                key={period.id}
                {...swap}
                transition={spring}
                className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full bg-[color-mix(in_srgb,var(--fg)_6%,transparent)] px-2.5 text-[12px] font-medium leading-4 text-fg-muted tabular-nums"
              >
                <span aria-hidden>{deltaShort}</span>
                <span className="sr-only">{deltaText}</span>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="relative h-5 overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p key={period.id} {...swap} transition={spring} className="text-[13px] leading-5 text-fg-muted">
              {describeText}
            </motion.p>
          </AnimatePresence>
        </div>
        {/* The rolling figure is not a live region; a switch reads the settled total once. */}
        <span className="sr-only" role="status" aria-live="polite">
          {picked ? `${format(total)} ${describeText}${deltaText ? `, ${deltaText}` : ""}, ${period.label}` : ""}
        </span>

        {/* A little room above the bars; the tallest bar's tooltip floats over the lines above (nothing clips it). */}
        <div ref={plotRef} role="list" aria-label={`${title}, ${period.label}`} className="relative mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }} onPointerLeave={() => setActive(null)}>
          {labels.map((name, i) => {
            const v = values[i] ?? null;
            const isPeak = i === peak;
            const dim = active !== null && active !== i;
            const h = v === null ? 4 : Math.max(4, (v / top) * height);
            const before = other && earlier ? (earlier.values[i] ?? null) : null;
            return (
              <div
                key={name}
                ref={(el) => {
                  bars.current[i] = el;
                }}
                role="listitem"
                tabIndex={i === Math.min(focusIndex, labels.length - 1) ? 0 : -1}
                aria-label={`${dayName(i)}: ${v === null ? "not yet" : format(v)}${isPeak ? ", biggest day" : ""}`}
                onPointerEnter={() => setActive(i)}
                onFocus={() => {
                  setFocusIndex(i);
                  setActive(i);
                }}
                onBlur={() => setActive(null)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={`group relative flex flex-col items-center gap-2 rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)]`}
              >
                <div className="relative flex w-full items-end justify-center" style={{ height: height + 16 }}>
                  <motion.div
                    className="relative w-full max-w-[28px] rounded-[4px]"
                    initial={false}
                    animate={{
                      height: grown ? h : 4,
                      opacity: dim ? 0.4 : 1,
                      backgroundColor: v === null ? "var(--track)" : isPeak ? "var(--series-1, var(--select))" : "var(--track-strong)",
                    }}
                    transition={reduce ? { duration: 0 } : { height: { ...spring, delay: inView ? i * 0.04 : 0 }, opacity: { duration: 0.15 }, backgroundColor: { duration: 0.25 } }}
                  />
                  {/* The earlier period's outline sits over the bar, so a lower value still shows as a dashed cap inside
                      it, and days still to come show what they have to beat. */}
                  {before !== null && (
                    <motion.div
                      aria-hidden
                      className={`absolute bottom-0 w-full max-w-[28px] rounded-[4px] border border-dashed ${
                        // On the coloured peak bar a surface-coloured dash keeps the cap readable.
                        isPeak && v !== null && before <= v ? "border-[color-mix(in_srgb,var(--surface)_80%,transparent)]" : "border-[color-mix(in_srgb,var(--fg)_40%,transparent)]"
                      }`}
                      initial={false}
                      animate={{ height: grown ? Math.max(4, (before / top) * height) : 4, opacity: dim ? 0.4 : 1 }}
                      transition={reduce ? { duration: 0 } : { height: { ...spring, delay: inView ? i * 0.04 : 0 }, opacity: { duration: 0.15 } }}
                    />
                  )}
                  <AnimatePresence>
                    {active === i && v !== null && (
                      <motion.div
                        aria-hidden
                        initial={{ opacity: 0, y: reduce ? 0 : 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.12 }}
                        className="pointer-events-none absolute z-10 w-max rounded-[10px] bg-[var(--inverse)] px-2.5 py-1.5 text-center shadow-[var(--shadow-overlay)]"
                        style={{ bottom: Math.max(h, before === null ? 0 : (before / top) * height) + 8 }}
                      >
                        <p className="text-[12px] leading-4 text-[color-mix(in_srgb,var(--inverse-fg)_64%,transparent)]">{dayName(i)}</p>
                        <p className="text-[13px] font-medium leading-5 tabular-nums text-[var(--inverse-fg)]">{format(v)}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <span aria-hidden className={`text-[12px] leading-4 transition-colors ${active === i ? "text-fg" : "text-fg-muted"}`}>
                  {name}
                </span>
              </div>
            );
          })}
        </div>
        {compare && (
          // Names the outline bars; kept in place (invisible) on the last period so switching never moves the card.
          <div aria-hidden className={`mt-4 flex items-center gap-4 text-[12px] leading-4 text-fg-muted ${earlier ? "" : "invisible"}`}>
            <span className="flex items-center gap-1.5">
              {/* Grey days with the blue biggest day, so the swatch matches every solid bar. */}
              <span className="flex h-3 w-[9px] overflow-hidden rounded-[2px]">
                <span className="w-1/2 bg-[var(--track-strong)]" />
                <span className="w-1/2 bg-[var(--series-1,var(--select))]" />
              </span>
              {period.label}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-2 rounded-[2px] border border-dashed border-[color-mix(in_srgb,var(--fg)_40%,transparent)]" />
              {earlier?.label ?? "Earlier"}
            </span>
          </div>
        )}
      </div>

      {stats && (
        <div className="flex min-w-[200px] flex-[1_1_200px] flex-col gap-4">
          <div className={`${card} flex flex-1 flex-col`}>
            <p className="flex items-center gap-2 text-[13px] leading-5 text-fg-muted">
              <span aria-hidden className="size-2 rounded-full bg-[var(--series-1,var(--select))]" />
              {statLabels[0]}
            </p>
            <div className="mt-3">
              <p className="text-[24px] font-medium leading-8 tracking-[-0.02em] text-fg tabular-nums">
                {peak >= 0 ? <Rolling value={values[peak] ?? 0} format={format} reduce={reduce} /> : "—"}
              </p>
              <div className="relative h-5 overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.p key={`${period.id}-peak`} {...swap} transition={spring} className="text-[13px] leading-5 text-fg-muted">
                    {peak >= 0 ? dayName(peak) : "No days yet"}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
            {other && otherPeak !== null && <TileFoot label={other.label} value={format(otherPeak)} />}
          </div>
          <div className={`${card} flex flex-1 flex-col`}>
            <p className="text-[13px] leading-5 text-fg-muted">{statLabels[1]}</p>
            <div className="mt-3">
              <p className="text-[24px] font-medium leading-8 tracking-[-0.02em] text-fg tabular-nums">
                <Rolling value={average} format={format} reduce={reduce} />
              </p>
              <div className="relative h-5 overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.p key={`${period.id}-avg`} {...swap} transition={spring} className="text-[13px] leading-5 text-fg-muted">
                    {complete ? `over ${known.length} days` : `over ${known.length} days so far`}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
            {other && otherAverage !== null && <TileFoot label={other.label} value={format(otherAverage)} />}
          </div>
        </div>
      )}
    </div>
  );
}
