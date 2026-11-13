"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type Ref } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export interface GroupedBarSeries {
  /** Legend and tooltip name, e.g. "Online". */
  name: string;
  /** One value per category, in the same order as `categories`. */
  values: number[];
  /** Any CSS color. Defaults to the kit's series order: series-1, series-3, series-4. */
  color?: string;
}

export interface GroupedBarProps {
  /** The groups along the axis, e.g. months or quarters. */
  categories: string[];
  series: GroupedBarSeries[];
  /** Vertical bars grow up; horizontal bars grow right (better for long category names). */
  orientation?: "vertical" | "horizontal";
  /** Top of the value axis. Defaults to a round number above the largest value. */
  max?: number;
  /** Gridline intervals on the value axis (default 3). */
  ticks?: number;
  /** Tooltip values and the spoken labels, e.g. "$18,000". */
  format?: (value: number) => string;
  /** Value-axis labels, e.g. "$20k". */
  formatAxis?: (value: number) => string;
  /** The tooltip heading for a group, e.g. "Aug 2026". Defaults to the category. */
  groupLabel?: (category: string, index: number) => string;
  /** Plot height in px (default 200 vertical, 67 per group horizontal). */
  height?: number;
  /** Names the chart for screen readers, e.g. "Revenue by channel, May to Oct". */
  label?: string;
  legend?: boolean;
  className?: string;
}

// The kit's chart series: color/series-1, series-3, series-4, then neutrals.
const PALETTE = ["var(--series-1, var(--select))", "var(--series-3, #697385)", "var(--series-4, var(--track))", "var(--fg-subtle)", "var(--track-strong)"];
const BAR = 16;
const GAP = 4;
const RADIUS = 3;
const ease = [0.22, 1, 0.36, 1] as const;
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const r2 = (v: number) => Math.round(v * 100) / 100;

function niceStep(max: number, count: number) {
  const raw = max / Math.max(count, 1) || 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/** A bar with its two outer corners rounded; same commands at any size, so `d` can animate. */
function barPath(x: number, y: number, w: number, h: number, horizontal: boolean) {
  const r = Math.max(0, Math.min(RADIUS, horizontal ? w : h, (horizontal ? h : w) / 2));
  if (horizontal) {
    return `M${r2(x)},${r2(y)}L${r2(x + w - r)},${r2(y)}Q${r2(x + w)},${r2(y)} ${r2(x + w)},${r2(y + r)}L${r2(x + w)},${r2(y + h - r)}Q${r2(x + w)},${r2(y + h)} ${r2(x + w - r)},${r2(y + h)}L${r2(x)},${r2(y + h)}Z`;
  }
  return `M${r2(x)},${r2(y + h)}L${r2(x)},${r2(y + r)}Q${r2(x)},${r2(y)} ${r2(x + r)},${r2(y)}L${r2(x + w - r)},${r2(y)}Q${r2(x + w)},${r2(y)} ${r2(x + w)},${r2(y + r)}L${r2(x + w)},${r2(y + h)}Z`;
}

function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function Marker({ color }: { color: string }) {
  return (
    <span aria-hidden className="grid size-3 shrink-0 place-items-center">
      <span className="size-2 rounded-full" style={{ background: color }} />
    </span>
  );
}

function Tip({ title, rows, style, boxRef }: { title: string; rows: { color: string; name: string; value: string }[]; style: CSSProperties; boxRef: Ref<HTMLDivElement> }) {
  return (
    <motion.div
      ref={boxRef}
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      style={style}
      className="pointer-events-none absolute z-10 w-max min-w-[168px] rounded-[12px] bg-[var(--inverse)] p-3 shadow-[var(--shadow-overlay)]"
    >
      <p className="text-[12px] font-medium leading-4 text-[color-mix(in_srgb,var(--inverse-fg)_64%,transparent)]">{title}</p>
      <div className="mt-2 flex flex-col gap-1.5">
        {rows.map((row) => (
          <div key={row.name} className="flex items-center gap-2 text-[13px] leading-5">
            <Marker color={row.color} />
            <span className="flex-1 text-[color-mix(in_srgb,var(--inverse-fg)_64%,transparent)]">{row.name}</span>
            <span className="font-medium tabular-nums text-[var(--inverse-fg)]">{row.value}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export function GroupedBar({
  categories,
  series,
  orientation = "vertical",
  max,
  ticks = 3,
  format = (v) => v.toLocaleString("en-US"),
  formatAxis = (v) => compact.format(v),
  groupLabel = (c) => c,
  height,
  label = "Grouped bar chart",
  legend = true,
  className = "",
}: GroupedBarProps) {
  const reduce = !!useReduce();
  const [boxRef, width] = useWidth(560);
  const inView = useInView(boxRef, { once: true, amount: 0.3 });
  const [activeAt, setActive] = useState<number | null>(null);
  // An index left over from more categories reads as nothing hovered.
  const active = activeAt !== null && activeAt < categories.length ? activeAt : null;
  const [focusIndex, setFocusIndex] = useState(0);
  const [keyboard, setKeyboard] = useState(false);
  const refs = useRef<(SVGGElement | null)[]>([]);

  const horizontal = orientation === "horizontal";
  const n = categories.length;
  const k = series.length;
  const colors = series.map((s, i) => s.color ?? PALETTE[i % PALETTE.length]);
  const dataMax = Math.max(0, ...series.flatMap((s) => s.values));
  const cap = max || undefined; // 0 would divide by zero: treat it as auto
  const step = niceStep(cap ?? dataMax, ticks);
  const top = cap ?? Math.max(step * ticks, step * Math.ceil(dataMax / step));
  const tickValues = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);

  // Geometry, matching the kit frame: 44 px value axis + 12 px right room (vertical); 40 px category column (horizontal).
  const plotH = height ?? (horizontal ? 67 * n : 200);
  const x0 = horizontal ? 40 : 44;
  const y0 = horizontal ? 0 : 12;
  const plotW = Math.max(width - x0 - (horizontal ? 16 : 12), 1);
  const total = horizontal ? plotH + 32 : y0 + plotH + 36;
  const band = (horizontal ? plotH : plotW) / Math.max(n, 1);
  const thick = Math.max(4, Math.min(horizontal ? 14 : BAR, (band * 0.72 - (k - 1) * GAP) / Math.max(k, 1)));
  const groupSpan = k * thick + (k - 1) * GAP;
  const scale = (v: number) => (Math.max(0, v) / top) * (horizontal ? plotW : plotH);

  const groupText = (i: number) =>
    `${groupLabel(categories[i], i)}: ${series.map((s) => `${s.name} ${format(s.values[i] ?? 0)}`).join(", ")}`;

  const move = (to: number) => {
    const next = Math.max(0, Math.min(n - 1, to));
    setFocusIndex(next);
    refs.current[next]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<SVGGElement>, i: number) => {
    const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? i + 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (to !== null) {
      e.preventDefault();
      move(to);
    } else if (e.key === "Escape") {
      setActive(null);
    }
  };

  // Tooltip next to the hovered group, flipped when it would leave the chart; measured after each render so it stays inside.
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipW, setTipW] = useState(184);
  useLayoutEffect(() => {
    const w = tipRef.current?.offsetWidth;
    if (w && w !== tipW) setTipW(w);
  }, [active, tipW]);
  let tipStyle: CSSProperties = {};
  if (active !== null) {
    if (horizontal) {
      const end = x0 + Math.max(...series.map((s) => scale(s.values[active] ?? 0)));
      const y = Math.min(Math.max(0, active * band + 4), Math.max(0, plotH - 96));
      tipStyle = end + 196 < width ? { left: end + 12, top: y } : { right: 8, top: y };
    } else {
      const left = x0 + active * band;
      const x = left + band - 4 + tipW <= width ? left + band - 4 : left + 4 - tipW >= 0 ? left + 4 - tipW : Math.min(Math.max(0, left + band / 2 - tipW / 2), Math.max(0, width - tipW));
      tipStyle = { left: x, top: y0 + 12 };
    }
  }

  const ring = keyboard && active !== null;
  const spring = reduce ? { duration: 0 } : { duration: 0.7, ease };

  return (
    <div className={`flex w-full min-w-0 flex-col gap-4 ${className}`}>
      {legend && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {series.map((s, i) => (
            <span key={s.name} className="inline-flex h-6 items-center gap-1.5 text-[13px] leading-5 tracking-[-0.003em] text-fg-muted">
              <Marker color={colors[i]} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <div ref={boxRef} className="relative [contain:inline-size]" style={{ height: total }} onPointerLeave={() => !keyboard && setActive(null)}>
        <svg width={width} height={total} className="block overflow-visible" role="list" aria-label={label}>
          {/* Gridlines and value labels */}
          {tickValues.map((t, i) => {
            if (horizontal) {
              const x = x0 + scale(t);
              const anchor = i === 0 ? "start" : i === tickValues.length - 1 ? "end" : "middle";
              return (
                <g key={t} aria-hidden>
                  <line x1={x} x2={x} y1={0} y2={plotH} stroke="var(--border-soft)" />
                  <text x={x} y={plotH + 20} textAnchor={anchor} className="fill-fg-muted text-[12px] tabular-nums">
                    {formatAxis(t)}
                  </text>
                </g>
              );
            }
            const y = y0 + plotH - scale(t);
            return (
              <g key={t} aria-hidden>
                <line x1={x0} x2={x0 + plotW} y1={y} y2={y} stroke="var(--border-soft)" />
                <text x={x0 - 8} y={y} dy="0.35em" textAnchor="end" className="fill-fg-muted text-[12px] tabular-nums">
                  {formatAxis(t)}
                </text>
              </g>
            );
          })}

          {categories.map((c, i) => {
            const dim = active !== null && active !== i;
            const start = (horizontal ? 0 : x0) + i * band;
            return (
              <g
                key={c}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                role="listitem"
                tabIndex={i === Math.min(focusIndex, n - 1) ? 0 : -1}
                aria-label={groupText(i)}
                className="outline-none"
                onPointerEnter={() => {
                  setKeyboard(false);
                  setActive(i);
                }}
                onFocus={(e) => {
                  setFocusIndex(i);
                  setActive(i);
                  setKeyboard((e.currentTarget as Element).matches(":focus-visible"));
                }}
                onBlur={() => {
                  setKeyboard(false);
                  setActive(null);
                }}
                onKeyDown={(e) => onKeyDown(e, i)}
              >
                {/* Hit area and the hover band */}
                {horizontal ? (
                  <rect x={x0} y={start + 4} width={plotW} height={Math.max(band - 8, 0)} rx={10} fill="var(--hover-layer, color-mix(in srgb, var(--fg) 5%, transparent))" opacity={active === i ? 1 : 0} stroke={ring && active === i ? "var(--select)" : "none"} strokeWidth={2} style={{ transition: "opacity 150ms" }} />
                ) : (
                  <rect x={start + 4} y={y0} width={Math.max(band - 8, 0)} height={plotH} rx={10} fill="var(--hover-layer, color-mix(in srgb, var(--fg) 5%, transparent))" opacity={active === i ? 1 : 0} stroke={ring && active === i ? "var(--select)" : "none"} strokeWidth={2} style={{ transition: "opacity 150ms" }} />
                )}
                <rect x={horizontal ? 0 : start} y={horizontal ? start : 0} width={horizontal ? width : band} height={horizontal ? band : y0 + plotH} fill="transparent" />
                <motion.g initial={false} animate={{ opacity: dim ? 0.32 : 1 }} transition={{ duration: 0.15 }}>
                  {series.map((s, j) => {
                    const len = scale(s.values[i] ?? 0);
                    const off = (band - groupSpan) / 2 + j * (thick + GAP);
                    const full = horizontal ? barPath(x0, start + off, len, thick, true) : barPath(start + off, y0 + plotH - len, thick, len, false);
                    const zero = horizontal ? barPath(x0, start + off, 0, thick, true) : barPath(start + off, y0 + plotH, thick, 0, false);
                    return (
                      <motion.path
                        key={s.name}
                        fill={colors[j]}
                        initial={{ d: reduce ? full : zero }}
                        animate={{ d: inView || reduce ? full : zero }}
                        transition={{ ...spring, delay: reduce ? 0 : i * 0.05 + j * 0.03 }}
                      />
                    );
                  })}
                </motion.g>
                <text
                  aria-hidden
                  x={horizontal ? 28 : start + band / 2}
                  y={horizontal ? start + band / 2 : y0 + plotH + 22}
                  dy={horizontal ? "0.35em" : undefined}
                  textAnchor={horizontal ? "end" : "middle"}
                  className={`text-[12px] transition-colors ${active === i ? "fill-fg" : "fill-fg-muted"}`}
                >
                  {c}
                </text>
              </g>
            );
          })}
        </svg>

        <AnimatePresence>
          {active !== null && (
            <Tip
              key="tip"
              title={groupLabel(categories[active], active)}
              rows={series.map((s, j) => ({ color: colors[j], name: s.name, value: format(s.values[active] ?? 0) }))}
              style={tipStyle}
              boxRef={tipRef}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
