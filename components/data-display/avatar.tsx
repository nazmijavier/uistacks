"use client";

import { useState, useSyncExternalStore, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { User } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";
export type AvatarShape = "circle" | "square";
export type AvatarStatus = "online" | "away" | "busy" | "offline";

export interface AvatarProps extends Omit<ComponentProps<"span">, "children"> {
  /** Full name. Gives the one-letter initial, the hue and the accessible name. */
  name?: string;
  /** Photo URL. The initial shows until it loads, and stays if it fails. */
  src?: string;
  /** Replaces the person glyph shown when there is no name or photo. */
  icon?: ReactNode;
  /** A company or workspace logo, centred on a white tile in place of the initial. `name` stays the accessible name. */
  logo?: ReactNode;
  /** 24, 32, 40, 48 and 64 px. */
  size?: AvatarSize;
  /** Circle for people, square for workspaces and teams. */
  shape?: AvatarShape;
  /** Presence dot, cut out of the corner so it reads on any background. */
  status?: AvatarStatus;
}

export interface AvatarGroupPerson {
  name: string;
  src?: string;
}

type NativeDiv = Omit<ComponentProps<"div">, "children" | "onAnimationStart" | "onAnimationEnd" | "onDrag" | "onDragStart" | "onDragEnd">;

export interface AvatarGroupProps extends NativeDiv {
  people: AvatarGroupPerson[];
  size?: AvatarSize;
  /** Faces shown before the +N counter (default 4). */
  max?: number;
}

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;

// at = the status dot's centre from the top-left corner; cut = the radius cut out around it.
// logo = the logo's box on the white tile, about 60% of the avatar.
const SIZES: Record<AvatarSize, { px: number; text: string; glyph: number; logo: number; radius: number; dot: number; cut: number; at: number; count: string }> = {
  xs: { px: 24, text: "text-[12px]", glyph: 14, logo: 14, radius: 8, dot: 5, cut: 4.5, at: 20, count: "text-[12px]" },
  sm: { px: 32, text: "text-[13px]", glyph: 18, logo: 20, radius: 10, dot: 8, cut: 6, at: 27, count: "text-[12px]" },
  md: { px: 40, text: "text-[16px] tracking-[-0.01em]", glyph: 22, logo: 24, radius: 12, dot: 10, cut: 7, at: 34, count: "text-[13px]" },
  lg: { px: 48, text: "text-[18px] tracking-[-0.01em]", glyph: 26, logo: 28, radius: 14, dot: 12, cut: 8, at: 41, count: "text-[15px]" },
  xl: { px: 64, text: "text-[24px] tracking-[-0.02em]", glyph: 34, logo: 40, radius: 18, dot: 16, cut: 10, at: 55, count: "text-[18px]" },
};

const STATUS: Record<AvatarStatus, { label: string; dot: string }> = {
  online: { label: "online", dot: "bg-success" },
  away: { label: "away", dot: "bg-warning" },
  // Busy and offline differ by shape too, not only by colour.
  busy: { label: "busy", dot: "bg-danger after:absolute after:inset-x-[22%] after:top-1/2 after:h-[1.5px] after:-translate-y-1/2 after:rounded-full after:bg-white" },
  offline: { label: "offline", dot: "bg-surface shadow-[inset_0_0_0_1.5px_var(--fg-subtle)]" },
};

// The hue comes from a hash of the full name, so a person keeps the same colour everywhere.
const HUES = ["--select", "--success", "--warning"];
function hueStyle(name: string): CSSProperties {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = HUES[h % HUES.length];
  return { "--avatar-hue": `var(${hue})`, "--avatar-hue-text": `var(${hue}-text)` } as CSSProperties;
}
// Dark takes a larger share of the hue and the light -text token, so amber reads as amber instead of olive brown
// (every pair stays above 4.5:1).
const HUE_TILE =
  "bg-[color-mix(in_srgb,var(--avatar-hue)_16%,var(--surface))] text-[color-mix(in_srgb,var(--avatar-hue)_70%,var(--fg))] dark:bg-[color-mix(in_srgb,var(--avatar-hue)_24%,var(--surface))] dark:text-[var(--avatar-hue-text)]";

type Load = "loading" | "loaded" | "error";

export function Avatar({ name, src, icon, logo, size = "md", shape = "circle", status, className = "", style, ...rest }: AvatarProps) {
  const reduce = useReduce();
  const s = SIZES[size];
  // Keyed by src, so a new photo starts over without an effect.
  const [load, setLoad] = useState<{ src?: string; state: Load }>({ src, state: "loading" });
  const state: Load = load.src === src ? load.state : "loading";
  const initial = name && logo == null ? Array.from(name.trim())[0]?.toUpperCase() : undefined;
  const cut = status ? `radial-gradient(circle at ${s.at}px ${s.at}px, transparent ${s.cut}px, #000 ${s.cut + 0.5}px)` : undefined;
  const label = rest["aria-label"] ?? (name ? (status ? `${name}, ${STATUS[status].label}` : name) : undefined);

  return (
    <span
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
      {...rest}
      aria-label={label}
      className={`relative inline-flex shrink-0 select-none ${className}`}
      // Same radius as the face, so a background passed in className follows the shape (owner, Nov 17: no square behind a photo).
      style={{ width: s.px, height: s.px, borderRadius: shape === "circle" ? 9999 : s.radius, ...style }}
    >
      <span
        className={`relative grid size-full place-items-center overflow-hidden font-medium leading-none ${
          logo != null ? "bg-white shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]" : initial ? HUE_TILE : "bg-muted text-fg-muted"
        } ${s.text}`}
        style={{ borderRadius: shape === "circle" ? 9999 : s.radius, maskImage: cut, WebkitMaskImage: cut, ...(initial ? hueStyle(name!) : null) }}
      >
        {logo != null ? (
          // flex, not grid: an <img> logo then fits the box by its own aspect ratio instead of overflowing it.
          <span className="flex items-center justify-center [&>img]:max-h-full [&>img]:max-w-full [&>svg]:size-full" style={{ width: s.logo, height: s.logo }}>
            {logo}
          </span>
        ) : initial ?? (
          <span className="grid place-items-center [&>svg]:size-full" style={{ width: s.glyph, height: s.glyph }}>
            {icon ?? <User strokeWidth={1.5} />}
          </span>
        )}
        {src && state !== "error" && (
          // eslint-disable-next-line @next/next/no-img-element -- a plain img keeps the component framework-free
          <img
            key={src}
            src={src}
            alt=""
            draggable={false}
            // A cached photo can finish before hydration, so check once it is in the DOM.
            ref={(el) => {
              if (el?.complete && el.naturalWidth > 0 && state === "loading") setLoad({ src, state: "loaded" });
            }}
            onLoad={() => setLoad({ src, state: "loaded" })}
            onError={() => setLoad({ src, state: "error" })}
            // A CSS transition, not motion: the photo can turn "loaded" in the same commit that mounts it.
            className={`absolute inset-0 size-full object-cover transition-[opacity,scale] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              state === "loaded" ? "scale-100 opacity-100" : "scale-[1.08] opacity-0 motion-reduce:scale-100"
            }`}
          />
        )}
      </span>
      {status && (
        <motion.span
          key={status}
          aria-hidden
          className={`absolute rounded-full ${STATUS[status].dot}`}
          style={{ width: s.dot, height: s.dot, left: s.at - s.dot / 2, top: s.at - s.dot / 2 }}
          initial={reduce ? { opacity: 0 } : { scale: 0 }}
          animate={reduce ? { opacity: 1 } : { scale: 1 }}
          transition={{ type: "spring", stiffness: 520, damping: 22 }}
        />
      )}
    </span>
  );
}

export function AvatarGroup({ people, size = "sm", max = 4, className = "", ...rest }: AvatarGroupProps) {
  const reduce = useReduce();
  const [spread, setSpread] = useState(false);
  const s = SIZES[size];
  const shown = people.length > max ? people.slice(0, max) : people;
  const extra = people.length - shown.length;
  const count = shown.length + (extra > 0 ? 1 : 0);
  // Faces overlap by a quarter of their size and the first sits on top. Each later face is cut
  // 2 px around the one before it; --gap animates, so on hover the faces part and the cut closes.
  const gap = spread && !reduce ? 4 : -s.px / 4;
  const cut = `radial-gradient(circle at calc(${-s.px / 2}px - var(--gap)) 50%, transparent ${s.px / 2 + 2}px, #000 ${s.px / 2 + 2.5}px)`;
  const face = (i: number): CSSProperties => ({
    zIndex: count - i,
    marginLeft: i ? "var(--gap)" : undefined,
    maskImage: i ? cut : undefined,
    WebkitMaskImage: i ? cut : undefined,
  });

  return (
    <motion.div
      role="group"
      aria-label={`${people.length} people`}
      {...rest}
      className={`inline-flex items-center ${className}`}
      initial={false}
      animate={{ "--gap": `${gap}px` }}
      transition={spring}
      onPointerEnter={() => setSpread(true)}
      onPointerLeave={() => setSpread(false)}
    >
      {shown.map((p, i) => (
        <span key={`${p.name}-${i}`} className="relative flex shrink-0" style={face(i)}>
          <Avatar name={p.name} src={p.src} size={size} />
        </span>
      ))}
      {extra > 0 && (
        <span
          role="img"
          // Names the hidden people so the count isn't a dead end for screen readers.
          aria-label={`${extra} more: ${people
            .slice(shown.length)
            .map((p) => p.name)
            .join(", ")}`}
          className={`grid shrink-0 place-items-center rounded-full bg-muted font-medium leading-none text-fg-muted ${s.count}`}
          style={{ ...face(count - 1), width: s.px, height: s.px, paddingLeft: "max(0px, calc(-1 * var(--gap)))" }}
        >
          +{size === "xs" && extra > 9 ? "9" : extra}
        </span>
      )}
    </motion.div>
  );
}
