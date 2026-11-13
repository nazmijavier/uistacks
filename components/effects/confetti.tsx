"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";

/*
 * Confetti on one canvas 2D layer, no dependencies. Pieces are flat paper (they flip in 3D: one axis shrinks and the
 * back face is shaded), round dots (they fall a little faster) and thin streamers (a short wavy ribbon that curls as
 * it falls, with the most air drag). Each frame: velocity decays by the drag, gravity pulls down, a slow gust of wind
 * sways the whole cloud, and each piece wobbles on its own. A piece fades over its last third of life.
 *
 * One canvas per host (the viewport by default, or a container you pass). It is created on the first fire, sized to
 * the host at devicePixelRatio (capped at 2), never takes the pointer, and is removed again once the last piece is
 * gone, so nothing runs while nothing is falling. With reduced motion there is no fall at all: a small ring of
 * sparkles fades in round the origin and out again, in place.
 */

export type ConfettiShape = "rect" | "circle" | "ribbon";
export type ConfettiOrigin = "center" | "top" | "element" | { x: number; y: number };

export interface ConfettiOptions {
  /** Burst from the origin, or two cannons firing up and in from the bottom corners of the host. */
  mode?: "burst" | "cannons";
  /** Burst only. Center of the host, a shower from its top edge, the centre of `element`, or { x, y } as 0–1 of the host. */
  origin?: ConfettiOrigin;
  /** The element the burst comes from when origin is "element" (or when no origin is given). */
  element?: HTMLElement | null;
  /** Pieces per burst; per side for cannons (default 110 burst, 80 per side). */
  count?: number;
  /** Width of the cone in degrees (default 70; 50 per cannon). */
  spread?: number;
  /** Direction of the cone in degrees, 90 is straight up (default 90). */
  angle?: number;
  /** Launch speed multiplier (1). */
  velocity?: number;
  /** Any CSS colours, including var(--token) values, read from the host. Default: the kit's calm set. */
  colors?: string[];
  /** Which pieces to mix (all three by default). */
  shapes?: ConfettiShape[];
  /** Gravity multiplier (1). */
  gravity?: number;
  /** Air drag from 0 (none) to 1 (default 0.08). Ribbons always get a little more. */
  drag?: number;
  /** A steady push sideways, e.g. 1 to the right or -1 to the left; the gentle gusts come on top (default 0). */
  wind?: number;
  /** Piece size multiplier (1). */
  scalar?: number;
  /** Where the canvas lives: the viewport (default) or this element, which needs position relative or similar. */
  container?: HTMLElement | null;
  /** z-index of the canvas (100 on the viewport, 1 in a container). */
  zIndex?: number;
}

/** The kit's calm set: select blue, a lighter blue, violet, mint, amber and two greys. */
export const CONFETTI_COLORS = ["#1e6af1", "#7fb2ff", "#a78bfa", "#7dd3b0", "#f5c45e", "#a1a1aa", "#d4d4d8"];

type Piece = {
  shape: ConfettiShape | "spark";
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vrot: number;
  flip: number;
  vflip: number;
  wob: number;
  vwob: number;
  drag: number;
  grav: number;
  wind: number;
  age: number;
  life: number;
};

const MAX_PIECES = 1500;
const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[(Math.random() * xs.length) | 0];

function prefersReduced() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

class Layer {
  host: HTMLElement;
  viewport: boolean;
  canvas: HTMLCanvasElement | null = null;
  ctx: CanvasRenderingContext2D | null = null;
  pieces: Piece[] = [];
  raf = 0;
  last = 0;
  t = 0;
  w = 0;
  h = 0;
  dpr = 1;
  ro: ResizeObserver | null = null;
  zIndex: number;

  constructor(host: HTMLElement, viewport: boolean, zIndex: number) {
    this.host = host;
    this.viewport = viewport;
    this.zIndex = zIndex;
  }

  size() {
    if (this.viewport) {
      this.w = window.innerWidth;
      this.h = window.innerHeight;
    } else {
      this.w = this.host.clientWidth;
      this.h = this.host.clientHeight;
    }
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas) {
      this.canvas.width = Math.max(1, Math.round(this.w * this.dpr));
      this.canvas.height = Math.max(1, Math.round(this.h * this.dpr));
    }
  }

  onResize = () => this.size();

  mount() {
    if (this.canvas) return;
    const c = document.createElement("canvas");
    c.setAttribute("aria-hidden", "true");
    c.dataset.confetti = "";
    Object.assign(c.style, {
      position: this.viewport ? "fixed" : "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: String(this.zIndex),
    });
    this.host.appendChild(c);
    this.canvas = c;
    this.ctx = c.getContext("2d");
    this.size();
    if (this.viewport) window.addEventListener("resize", this.onResize);
    else {
      this.ro = new ResizeObserver(this.onResize);
      this.ro.observe(this.host);
    }
  }

  unmount() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.pieces = [];
    window.removeEventListener("resize", this.onResize);
    this.ro?.disconnect();
    this.ro = null;
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
  }

  /** The host's box in viewport coordinates, so element origins can be turned into canvas coordinates. */
  box() {
    if (this.viewport) return { left: 0, top: 0 };
    const r = this.host.getBoundingClientRect();
    return { left: r.left, top: r.top };
  }

  add(ps: Piece[]) {
    this.mount();
    const room = MAX_PIECES - this.pieces.length;
    if (room < ps.length) this.pieces.splice(0, ps.length - room);
    this.pieces.push(...ps);
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  frame = (now: number) => {
    const ctx = this.ctx;
    if (!ctx) return;
    // Steps are in 60 fps frames; a long gap (a hidden tab) is clamped so nothing jumps.
    const dt = Math.min((now - this.last) / (1000 / 60), 3);
    this.last = now;
    this.t += dt;
    const gust = Math.sin(this.t * 0.013) * 0.35 + Math.sin(this.t * 0.031 + 1.7) * 0.15;
    const { w, h } = this;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas!.width, this.canvas!.height);

    let n = 0;
    for (const p of this.pieces) {
      p.age += dt;
      if (p.shape !== "spark") {
        const k = Math.pow(1 - p.drag, dt);
        p.vx = p.vx * k + (gust * 0.04 + p.wind * 0.06) * dt;
        p.vy = p.vy * k + p.grav * dt;
        p.wob += p.vwob * dt;
        p.x += (p.vx + Math.sin(p.wob) * p.size * 0.06) * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
        p.flip += p.vflip * dt;
      }
      if (p.age >= p.life || p.y > h + 40 || p.x < -60 || p.x > w + 60) continue;
      this.pieces[n++] = p;
      this.draw(ctx, p);
    }
    this.pieces.length = n;

    if (n === 0) this.unmount();
    else this.raf = requestAnimationFrame(this.frame);
  };

  draw(ctx: CanvasRenderingContext2D, p: Piece) {
    const d = this.dpr;
    const left = p.life - p.age;
    let alpha = Math.min(1, left / (p.life * 0.33));
    if (p.shape === "spark") {
      // Fade in for the first third, hold, fade out: an envelope, no movement.
      const u = p.age / p.life;
      alpha = u < 0.3 ? u / 0.3 : u > 0.65 ? (1 - u) / 0.35 : 1;
    }
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;

    const cos = Math.cos(p.rot);
    const sin = Math.sin(p.rot);
    if (p.shape === "rect") {
      // The flip squeezes one axis; the back face (cos < 0) is drawn a little dimmer, which reads as shading.
      const f = Math.cos(p.flip);
      if (f < 0) ctx.globalAlpha *= 0.72;
      const sx = Math.max(Math.abs(f), 0.08);
      ctx.setTransform(cos * sx * d, sin * sx * d, -sin * d, cos * d, p.x * d, p.y * d);
      ctx.fillRect(-p.size / 2, -p.size * 0.32, p.size, p.size * 0.64);
    } else if (p.shape === "circle") {
      const sy = 0.6 + 0.4 * Math.abs(Math.cos(p.flip));
      ctx.setTransform(cos * d, sin * d, -sin * sy * d, cos * sy * d, p.x * d, p.y * d);
      ctx.beginPath();
      ctx.arc(0, 0, p.size * 0.3, 0, TAU);
      ctx.fill();
    } else if (p.shape === "ribbon") {
      // A short wavy streamer whose curl travels along it as it falls.
      ctx.setTransform(cos * d, sin * d, -sin * d, cos * d, p.x * d, p.y * d);
      const len = p.size * 1.6;
      const amp = p.size * 0.22 * Math.sin(p.flip);
      ctx.lineWidth = Math.max(1.4, p.size * 0.16);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.bezierCurveTo(-len / 6, -amp * 2, len / 6, amp * 2, len / 2, 0);
      ctx.stroke();
    } else {
      // Sparkle: a four-point star.
      ctx.setTransform(cos * d, sin * d, -sin * d, cos * d, p.x * d, p.y * d);
      const r = p.size / 2;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.quadraticCurveTo(0, 0, 0, r);
      ctx.quadraticCurveTo(0, 0, -r, 0);
      ctx.quadraticCurveTo(0, 0, 0, -r);
      ctx.fill();
    }
  }
}

const layers = new WeakMap<HTMLElement, Layer>();

function layerFor(container: HTMLElement | null | undefined, zIndex?: number) {
  const host = container ?? document.body;
  let l = layers.get(host);
  if (!l) {
    l = new Layer(host, !container, zIndex ?? (container ? 1 : 100));
    layers.set(host, l);
  }
  return l;
}

function resolveColors(colors: string[], host: HTMLElement) {
  const style = colors.some((c) => c.startsWith("var(")) ? getComputedStyle(host) : null;
  return colors.map((c) => {
    const m = style && c.match(/^var\((--[\w-]+)\)$/);
    return m ? style!.getPropertyValue(m[1]).trim() || "#1e6af1" : c;
  });
}

function makePiece(x: number, y: number, deg: number, speed: number, o: Required<Pick<ConfettiOptions, "colors" | "shapes" | "gravity" | "drag" | "scalar" | "wind">>): Piece {
  const shape = pick(o.shapes);
  const a = (deg * Math.PI) / 180;
  const size = (shape === "ribbon" ? rand(9, 14) : shape === "circle" ? rand(6, 9) : rand(8, 12)) * o.scalar;
  const p: Piece = {
    shape,
    color: pick(o.colors),
    x,
    y,
    vx: Math.cos(a) * speed,
    vy: -Math.sin(a) * speed,
    size,
    rot: rand(0, TAU),
    vrot: rand(-0.12, 0.12),
    flip: rand(0, TAU),
    vflip: rand(0.08, 0.2),
    wob: rand(0, TAU),
    vwob: rand(0.04, 0.1),
    drag: Math.min(0.5, o.drag * (shape === "ribbon" ? 1.35 : shape === "circle" ? 0.85 : 1)),
    grav: 0.24 * o.gravity * (shape === "ribbon" ? 0.8 : shape === "circle" ? 1.15 : 1),
    age: 0,
    life: rand(210, 300),
    wind: o.wind,
  };
  return p;
}

/** Fires once. Safe to call from any event handler; does nothing on the server. */
export function fireConfetti(options: ConfettiOptions = {}) {
  if (typeof window === "undefined") return;
  const layer = layerFor(options.container, options.zIndex);
  layer.mount();
  const host = layer.host;
  const colors = resolveColors(options.colors?.length ? options.colors : CONFETTI_COLORS, host);
  const o = {
    colors,
    shapes: options.shapes?.length ? options.shapes : (["rect", "rect", "circle", "ribbon"] as ConfettiShape[]),
    gravity: options.gravity ?? 1,
    drag: options.drag ?? 0.08,
    scalar: options.scalar ?? 1,
    wind: options.wind ?? 0,
  };
  const { w, h } = layer;
  const box = layer.box();
  const v = options.velocity ?? 1;
  // Launch speed grows a little with the host, so a phone and a wide screen both fill.
  const reach = Math.min(1.25, Math.max(0.7, Math.sqrt(Math.min(w, h * 1.4) / 700)));

  // Where the burst starts.
  let ox = w / 2;
  let oy = h / 2;
  let jitter = 6;
  let half = { x: 20, y: 20 };
  const origin = options.origin ?? (options.element ? "element" : "center");
  if (origin === "element" && options.element) {
    const r = options.element.getBoundingClientRect();
    ox = r.left + r.width / 2 - box.left;
    oy = r.top + r.height / 2 - box.top;
    jitter = Math.min(r.width, r.height) / 4;
    half = { x: r.width / 2, y: r.height / 2 };
  } else if (typeof origin === "object") {
    ox = origin.x * w;
    oy = origin.y * h;
  }

  if (prefersReduced()) {
    // No fall: a quiet ring of sparkles just outside the element (or round the middle of the host).
    const wide = options.mode === "cannons" || origin === "top";
    const cx = wide ? w / 2 : ox;
    const cy = wide ? h / 2 : oy;
    const n = 12;
    const rx = (wide ? 40 : half.x) + 18;
    const ry = (wide ? 40 : half.y) + 18;
    layer.add(
      Array.from({ length: n }, (_, i) => {
        // Spread evenly along the edge of the element's box grown by 18 px, so none lands on the element itself.
        let d = ((i + rand(0.3, 0.7)) / n) * 4 * (rx + ry);
        let x = -rx;
        let y = ry - (d - 4 * rx - 2 * ry);
        if (d < 2 * rx) {
          x = -rx + d;
          y = -ry;
        } else if ((d -= 2 * rx) < 2 * ry) {
          x = rx;
          y = -ry + d;
        } else if ((d -= 2 * ry) < 2 * rx) {
          x = rx - d;
          y = ry;
        }
        const p = makePiece(cx + x + rand(-4, 4), cy + y + rand(-4, 4), 0, 0, o);
        p.shape = i % 2 === 0 ? "spark" : "circle";
        p.size = p.shape === "spark" ? rand(11, 14) : rand(5, 7);
        p.rot = 0;
        p.life = 66;
        return p;
      })
    );
    return;
  }

  const ps: Piece[] = [];
  if (options.mode === "cannons") {
    const count = options.count ?? 80;
    const spread = options.spread ?? 50;
    // Cannons fly through thinner air, and their speed is set from the host's height so the peaks land between
    // a third and three quarters of the way up, on a phone or on a wide screen.
    const co = { ...o, drag: options.drag ?? 0.05 };
    for (const side of [0, 1]) {
      const base = side === 0 ? 60 : 120;
      for (let i = 0; i < count; i++) {
        const deg = base + rand(-spread / 2, spread / 2);
        const sp = ((h * rand(0.33, 0.75)) / 11 + 2) * v;
        ps.push(makePiece(side === 0 ? rand(-8, 4) : w + rand(-4, 8), h + rand(0, 10), deg, sp, co));
      }
    }
  } else if (origin === "top") {
    const count = options.count ?? 110;
    for (let i = 0; i < count; i++) {
      const p = makePiece(rand(0, w), rand(-h * 0.25, -8), 270 + rand(-15, 15), rand(0.5, 2.5) * v, o);
      p.life = rand(200, 300);
      ps.push(p);
    }
  } else {
    const count = options.count ?? 110;
    const spread = options.spread ?? 70;
    const angle = options.angle ?? 90;
    for (let i = 0; i < count; i++) {
      const deg = angle + rand(-spread / 2, spread / 2);
      ps.push(makePiece(ox + rand(-jitter, jitter), oy + rand(-jitter, jitter), deg, rand(10, 24) * v * reach, o));
    }
  }
  layer.add(ps);
}

/** Removes every piece from a host (the viewport by default) right away. */
export function clearConfetti(container?: HTMLElement | null) {
  if (typeof window === "undefined") return;
  const host = container ?? document.body;
  layers.get(host)?.unmount();
}

/**
 * The imperative way: attach `ref` to the element it should come from (a button, a check mark) and call `fire()`.
 * `defaults` apply to every fire; options passed to `fire` win.
 */
export function useConfetti<T extends HTMLElement = HTMLElement>(defaults: ConfettiOptions = {}) {
  const ref = useRef<T | null>(null);
  const opts = useRef(defaults);
  useLayoutEffect(() => {
    opts.current = defaults;
  });
  const fire = useCallback((o: ConfettiOptions = {}) => {
    const merged = { ...opts.current, ...o };
    fireConfetti({ ...merged, element: merged.element ?? ref.current });
  }, []);
  const clear = useCallback(() => clearConfetti(opts.current.container), []);
  return { ref, fire, clear };
}

export interface ConfettiProps extends Omit<ConfettiOptions, "container" | "element"> {
  /** Fires each time this number changes to a new value above 0 (a counter you bump). */
  fire?: number;
  /** The element for origin "element". When the component wraps children, it defaults to them. */
  target?: RefObject<HTMLElement | null>;
  /** Keeps the confetti inside the nearest positioned parent instead of over the whole viewport. */
  contained?: boolean;
  /** Optional: what it wraps (and bursts from, with origin "element"). */
  children?: ReactNode;
  className?: string;
}

/** The declarative way: `<Confetti fire={n} />` fires whenever n goes up. */
export function Confetti({ fire = 0, target, contained = false, children, className = "", ...options }: ConfettiProps) {
  const wrap = useRef<HTMLSpanElement>(null);
  const stage = useRef<HTMLSpanElement>(null);
  const opts = useRef(options);
  useLayoutEffect(() => {
    opts.current = options;
  });

  // Only a new `fire` value fires; other prop changes are read at that moment.
  useEffect(() => {
    if (!fire) return;
    const element = target?.current ?? wrap.current;
    fireConfetti({ ...opts.current, element, container: stage.current });
  }, [fire, target]);

  useEffect(() => {
    const host = stage.current;
    return () => {
      if (host) clearConfetti(host);
    };
  }, []);

  return (
    <>
      {contained && <span ref={stage} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" />}
      {children ? (
        <span ref={wrap} className={`inline-flex ${className}`}>
          {children}
        </span>
      ) : null}
    </>
  );
}
