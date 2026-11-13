"use client";

import { useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type AvatarStackSize = 24 | 32 | 40;

export interface AvatarStackPerson {
  /** Stable key; the name is used when it is missing. */
  id?: string;
  name: string;
  /** Photo URL. The one-letter initial shows until it loads, and stays if it fails. */
  src?: string;
  /** A second line in the tooltip, such as “Editing” or “Owner”. */
  meta?: string;
}

export interface AvatarStackProps {
  people: AvatarStackPerson[];
  /** Faces before the +N chip (4). One extra person shows as a face, not as “+1”. */
  max?: number;
  /** 24, 32 or 40 px. */
  size?: AvatarStackSize;
  /** Hovering or focusing the stack fans the faces apart a little. */
  spread?: boolean;
  /** Turns each face into a button; the +N chip calls it with the hidden people. */
  onPersonClick?: (person: AvatarStackPerson) => void;
  onMoreClick?: (hidden: AvatarStackPerson[]) => void;
  /** Accessible name of the group; defaults to “5 people”. */
  "aria-label"?: string;
  className?: string;
}

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
const TEXT: Record<AvatarStackSize, string> = { 24: "text-[12px]", 32: "text-[13px]", 40: "text-[15px]" };

// The hue comes from a hash of the full name, so a person keeps the same colour everywhere.
const HUES = ["--select", "--success", "--warning"];
function hueStyle(name: string): CSSProperties {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = HUES[h % HUES.length];
  return { "--avatar-hue": `var(${hue})`, "--avatar-hue-text": `var(${hue}-text)` } as CSSProperties;
}
// The same tile as Avatar: Dark takes a larger share of the hue and the light -text token, so a person looks the same
// in both components and the initial stays readable.
const HUE_TILE =
  "bg-[color-mix(in_srgb,var(--avatar-hue)_16%,var(--surface))] text-[color-mix(in_srgb,var(--avatar-hue)_70%,var(--fg))] dark:bg-[color-mix(in_srgb,var(--avatar-hue)_24%,var(--surface))] dark:text-[var(--avatar-hue-text)]";

/** Photo with a one-letter fallback; the photo fades in once it has loaded. */
function Face({ person, px }: { person: AvatarStackPerson; px: number }) {
  const [state, setState] = useState<{ src?: string; ok: boolean | null }>({ src: person.src, ok: null });
  const ok = state.src === person.src ? state.ok : null;
  const initial = Array.from(person.name.trim())[0]?.toUpperCase() ?? "?";
  return (
    <span className={`relative grid size-full place-items-center overflow-hidden rounded-full font-medium leading-none ${HUE_TILE} ${TEXT[px as AvatarStackSize]}`} style={hueStyle(person.name)}>
      {initial}
      {person.src && ok !== false && (
        // eslint-disable-next-line @next/next/no-img-element -- a plain img keeps the component framework-free
        <img
          key={person.src}
          src={person.src}
          alt=""
          draggable={false}
          ref={(el) => {
            if (el?.complete && el.naturalWidth > 0 && ok === null) setState({ src: person.src, ok: true });
          }}
          onLoad={() => setState({ src: person.src, ok: true })}
          onError={() => setState({ src: person.src, ok: false })}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-300 ${ok ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
}

/** The dark name tag above a face. */
function Tag({ title, meta, reduce }: { title: string; meta?: string; reduce: boolean }) {
  return (
    // The face's accessible name already carries the name and meta, so the tag is visual only.
    <motion.span
      aria-hidden
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 2, scale: 0.96, transition: { duration: 0.1 } }}
      transition={spring}
      className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-30 flex w-max max-w-[220px] -translate-x-1/2 origin-bottom flex-col rounded-[10px] bg-[var(--inverse)] px-2.5 py-1.5 text-left text-[var(--inverse-fg)] shadow-[var(--shadow-card)]"
    >
      <span className="text-[12px] font-medium leading-4">{title}</span>
      {meta && <span className="text-[12px] leading-4 text-[color-mix(in_srgb,var(--inverse-fg)_64%,transparent)]">{meta}</span>}
    </motion.span>
  );
}

function listNames(people: AvatarStackPerson[]) {
  const names = people.map((p) => p.name);
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

export function AvatarStack({ people, max = 4, size = 32, spread = true, onPersonClick, onMoreClick, "aria-label": ariaLabel, className = "" }: AvatarStackProps) {
  const reduce = useReduce();
  const [hot, setHot] = useState(false);
  const [tip, setTip] = useState<number | null>(null);
  const [focus, setFocus] = useState(0);
  const items = useRef<(HTMLElement | null)[]>([]);

  // A +1 chip would take the same room as the face it hides, so the stack only collapses when two or more are hidden.
  const shown = people.length > Math.max(1, max) + 1 ? people.slice(0, Math.max(1, max)) : people;
  const hidden = people.slice(shown.length);
  const slots = shown.length + (hidden.length > 0 ? 1 : 0);
  const active = Math.min(focus, slots - 1);
  // Faces overlap by 30 % of their size; hovering the stack opens the overlap to a small gap.
  const overlap = Math.round(size * 0.3);
  const fanned = spread && hot && !reduce;
  const step = fanned ? 2 : -overlap;
  const ring = size === 24 ? 1.5 : 2;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key;
    const next = k === "ArrowRight" || k === "ArrowDown" ? active + 1 : k === "ArrowLeft" || k === "ArrowUp" ? active - 1 : k === "Home" ? 0 : k === "End" ? slots - 1 : null;
    if (next === null) {
      if (k === "Escape") setTip(null);
      return;
    }
    e.preventDefault();
    const i = Math.min(slots - 1, Math.max(0, next));
    setFocus(i);
    items.current[i]?.focus();
  };

  const slot = (i: number, label: string, title: string, meta: string | undefined, body: ReactNode, onClick?: () => void) => {
    const Tagname = onClick ? motion.button : motion.span;
    const open = tip === i;
    return (
      <Tagname
        key={i < shown.length ? (shown[i].id ?? shown[i].name) : "more"}
        ref={(el: HTMLElement | null) => {
          items.current[i] = el;
        }}
        {...(onClick ? { type: "button" as const, onClick } : { role: "img" })}
        // Entering and leaving faces grow from and fold into zero width (margin -size), so the others slide over.
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, marginLeft: -size }}
        animate={{ opacity: 1, scale: 1, marginLeft: i === 0 ? 0 : step, y: open && fanned ? -2 : 0 }}
        exit={reduce ? { opacity: 0, transition: { duration: 0.1 } } : { opacity: 0, scale: 0.6, marginLeft: -size, transition: { duration: 0.2 } }}
        transition={spring}
        tabIndex={i === active ? 0 : -1}
        aria-label={label}
        onPointerEnter={() => setTip(i)}
        onPointerLeave={() => setTip((t) => (t === i ? null : t))}
        onFocus={() => {
          setFocus(i);
          setTip(i);
        }}
        onBlur={() => setTip((t) => (t === i ? null : t))}
        className={`relative block shrink-0 rounded-full ${onClick ? "cursor-pointer" : ""} ${focusRing}`}
        // Each face sits on the one before it, so the +N chip at the end is never covered.
        style={{ width: size, height: size, zIndex: open ? slots + 1 : i + 1 }}
      >
        {/* The --surface ring: a disc behind the face, so it cuts the face underneath without a shadow. */}
        <span aria-hidden className="absolute -z-10 rounded-full bg-surface" style={{ inset: -ring }} />
        {body}
        {/* Dark: a 1 px hairline on each face (the +N chip has its own), so overlapping photos read as separate discs. */}
        {i < shown.length && <span aria-hidden className="pointer-events-none absolute inset-0 hidden rounded-full shadow-[inset_0_0_0_1px_var(--border)] dark:block" />}
        <AnimatePresence>{open && <Tag title={title} meta={meta} reduce={reduce} />}</AnimatePresence>
      </Tagname>
    );
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel ?? `${people.length} ${people.length === 1 ? "person" : "people"}`}
      onKeyDown={onKeyDown}
      onPointerEnter={() => setHot(true)}
      onPointerLeave={() => setHot(false)}
      onFocus={() => setHot(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setHot(false)}
      // Padding so the 2 px rings and the focus ring sit inside the box.
      className={`inline-flex items-center p-0.5 ${className}`}
    >
      <AnimatePresence initial={false}>
        {shown.map((p, i) => slot(i, p.meta ? `${p.name}, ${p.meta}` : p.name, p.name, p.meta, <Face person={p} px={size} />, onPersonClick ? () => onPersonClick(p) : undefined))}
        {hidden.length > 0 &&
          slot(
            shown.length,
            `${hidden.length} more: ${hidden.map((p) => p.name).join(", ")}`,
            `${hidden.length} more`,
            listNames(hidden),
            <span className={`grid size-full place-items-center rounded-full bg-muted font-medium leading-none tabular-nums text-fg-muted dark:shadow-[inset_0_0_0_1px_var(--border)] ${TEXT[size]}`}>
              {size === 24 && hidden.length > 9 ? "9+" : `+${hidden.length}`}
            </span>,
            onMoreClick ? () => onMoreClick(hidden) : undefined
          )}
      </AnimatePresence>
    </div>
  );
}
