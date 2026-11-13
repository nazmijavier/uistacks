"use client";

import {
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useReducedMotionConfig, useTransform, type AnimationPlaybackControls } from "motion/react";
import { ChevronRight, CircleAlert, FileText, LoaderCircle, Pause, Play } from "lucide-react";

export type AudioPlayerLayout = "compact" | "card";

export interface AudioPlayerHandle {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** Jumps to a time in seconds (it eases there while paused). */
  seek: (seconds: number) => void;
}

export interface AudioPlayerProps {
  /** compact: a 48 px pill for message threads. card: title, skips, times and a transcript row (default). */
  layout?: AudioPlayerLayout;
  /** An audio file. Without one, a timer stands in for playback (previews, prototypes) and `duration` sets the length. */
  src?: string;
  /** Length in seconds, shown until the file's own length loads (default 60). */
  duration?: number;
  /** Bar heights from 0 to 1, e.g. from your own audio analysis; resampled to the width. Leave it out for a voice-like shape. */
  peaks?: number[];
  /** Card: the recording's name, e.g. "Call with Dana Whitfield". */
  title?: ReactNode;
  /** Card: the line under the title, e.g. "Zoom · Oct 21 · 4:12". */
  meta?: ReactNode;
  /** Card: a 16 px source logo before the meta line. */
  icon?: ReactNode;
  /** Card: the top-right slot, e.g. a More button. */
  actions?: ReactNode;
  playing?: boolean;
  defaultPlaying?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  /** Where playback starts, in seconds. */
  defaultTime?: number;
  /** The position in whole seconds, as it ticks and after every seek. */
  onTimeUpdate?: (seconds: number) => void;
  speed?: number;
  defaultSpeed?: number;
  onSpeedChange?: (speed: number) => void;
  /** The steps the speed chip cycles through (default 1, 1.5 and 2). */
  speeds?: number[];
  /** Seconds the skip buttons jump (default 10). */
  skip?: number;
  /** A spinner in the play button and dimmed controls. A file also sets it while it buffers. */
  loading?: boolean;
  /** true or a message: the error state with Retry. A file that fails to load sets it too. */
  error?: boolean | string;
  onRetry?: () => void;
  /** Card: adds the transcript row at the bottom. */
  onTranscript?: () => void;
  /** The transcript row's label (default "View transcript"). */
  transcriptLabel?: string;
  disabled?: boolean;
  ref?: Ref<AudioPlayerHandle>;
  /** The player's name for assistive tech. Defaults to the title when it is text. */
  "aria-label"?: string;
  className?: string;
}

const MINUS = "−";
const spring = { type: "spring", stiffness: 520, damping: 34 } as const;
const ring = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
// The kit's call-recording shape (80 bars): quiet starts, louder phrases, short pauses.
const SHAPE = [
  4, 8, 12, 18, 26, 30, 20, 22, 12, 6, 8, 14, 18, 22, 16, 14, 10, 4, 18, 28, 28, 16, 6, 16, 24, 16, 4, 20, 30, 32, 20, 6, 8, 12, 14, 18, 14, 12, 12, 8, 4,
  10, 12, 16, 14, 8, 6, 14, 22, 26, 22, 26, 16, 10, 4, 8, 10, 12, 12, 8, 6, 14, 20, 18, 12, 6, 22, 28, 18, 4, 4, 8, 12, 18, 16, 18, 12, 8, 4, 4,
].map((h) => h / 32);
const LAYOUT = {
  card: { bars: 80, max: 32, min: 4, box: "h-10" },
  compact: { bars: 40, max: 18, min: 4, box: "h-6" },
} as const;

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

/** 4:12 */
function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** n values from a list of peaks: the loudest in each slice, or the nearest when stretching. */
function resample(peaks: number[], n: number) {
  if (!peaks.length) return Array.from({ length: n }, () => 0.3);
  return Array.from({ length: n }, (_, i) => {
    const a = Math.floor((i * peaks.length) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * peaks.length) / n));
    let top = 0;
    for (let j = a; j < b && j < peaks.length; j++) top = Math.max(top, peaks[j]);
    return Math.min(1, Math.max(0, top));
  });
}

/** Back or forward by n seconds: the circular arrow with the count inside. */
function SkipGlyph({ forward, seconds }: { forward: boolean; seconds: number }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <g transform={forward ? "matrix(-1 0 0 1 24 0)" : undefined}>
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </g>
      <text x="12" y="12.6" fill="currentColor" stroke="none" fontSize="7.5" fontWeight="500" textAnchor="middle" dominantBaseline="central" className="tabular-nums">
        {seconds}
      </text>
    </svg>
  );
}

/**
 * A player for short recordings: voice notes, calls and AI voice replies. Click or drag the
 * waveform to seek; the played part fills in as it plays.
 */
export function AudioPlayer({
  layout = "card",
  src,
  duration = 60,
  peaks,
  title,
  meta,
  icon,
  actions,
  playing: playingProp,
  defaultPlaying = false,
  onPlayingChange,
  defaultTime = 0,
  onTimeUpdate,
  speed: speedProp,
  defaultSpeed = 1,
  onSpeedChange,
  speeds = [1, 1.5, 2],
  skip = 10,
  loading = false,
  error,
  onRetry,
  onTranscript,
  transcriptLabel = "View transcript",
  disabled = false,
  ref,
  "aria-label": ariaLabel,
  className = "",
}: AudioPlayerProps) {
  const uid = useId().replace(/[^\w-]/g, "");
  const reduce = useReduce();
  const card = layout === "card";
  const L = LAYOUT[layout];
  const audio = useRef<HTMLAudioElement>(null);

  const [ownPlaying, setOwnPlaying] = useState(defaultPlaying);
  const playing = playingProp ?? ownPlaying;
  const [ownSpeed, setOwnSpeed] = useState(defaultSpeed);
  const speed = speedProp ?? ownSpeed;
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const total = Math.max(1, fileDuration ?? duration);
  const [buffering, setBuffering] = useState(false);
  const [fileFailed, setFileFailed] = useState(false);
  // A new file (the next voice note in the same player) starts clean: its own length, no old error, from the top.
  const [prevSrc, setPrevSrc] = useState(src);
  if (prevSrc !== src) {
    setPrevSrc(src);
    setFileDuration(null);
    setFileFailed(false);
    setBuffering(false);
  }
  const failed = Boolean(error) || fileFailed;
  const busy = !failed && (loading || buffering);
  const message = typeof error === "string" ? error : "Couldn’t load audio";
  const off = disabled || busy || failed;

  // Time lives in a motion value (the waveform fill follows it every frame); the labels follow whole seconds.
  const time = useMotionValue(Math.min(defaultTime, total));
  const [sec, setSec] = useState(Math.floor(Math.min(defaultTime, total)));
  const secRef = useRef(sec);
  // Nothing to skip past at either end: the skip buttons dim there instead of doing nothing.
  const atStart = sec <= 0;
  const atEnd = sec >= Math.floor(total);
  const tween = useRef<AnimationPlaybackControls | null>(null);
  const timeCb = useRef(onTimeUpdate);
  useEffect(() => {
    timeCb.current = onTimeUpdate;
  });
  useMotionValueEvent(time, "change", (v) => {
    const s = Math.floor(v);
    if (s === secRef.current) return;
    secRef.current = s;
    setSec(s);
    timeCb.current?.(s);
  });
  // Back to the start when the file changes (the render above already cleared its length and error).
  const firstSrc = useRef(src);
  useEffect(() => {
    if (firstSrc.current === src) return;
    firstSrc.current = src;
    tween.current?.stop();
    time.set(0);
  }, [src, time]);
  const played = useTransform(time, (v) => `inset(0 ${(100 - Math.min(1, Math.max(0, v / total)) * 100).toFixed(3)}% 0 0)`);

  const [said, setSaid] = useState("");
  const setPlaying = (next: boolean, say = true) => {
    if (playingProp === undefined) setOwnPlaying(next);
    if (next !== playing) {
      onPlayingChange?.(next);
      if (say) setSaid(next ? "Playing" : "Paused");
    }
  };

  const seek = (to: number, ease = true) => {
    const s = Math.min(total, Math.max(0, to));
    tween.current?.stop();
    if (audio.current && src) audio.current.currentTime = s;
    if (ease && !reduce && !playing) tween.current = animate(time, s, { duration: 0.22, ease: [0.22, 1, 0.36, 1] });
    else time.set(s);
  };

  const play = () => {
    if (off) return;
    // A seek still easing in would fight the clock: land it first. Playing again from the end starts over.
    tween.current?.stop();
    if (time.get() >= total - 0.05) seek(0, false);
    setPlaying(true);
  };
  const toggle = () => (playing ? setPlaying(false) : play());

  // Read the latest handlers from the imperative handle without re-creating it each render.
  const api = useRef({ play, toggle, seek, setPlaying });
  useEffect(() => {
    api.current = { play, toggle, seek, setPlaying };
  });
  useImperativeHandle(
    ref,
    () => ({
      play: () => api.current.play(),
      pause: () => api.current.setPlaying(false),
      toggle: () => api.current.toggle(),
      seek: (s: number) => api.current.seek(s),
    }),
    []
  );

  // The clock: the file's own position, or a timer when there is no file.
  useEffect(() => {
    const el = audio.current;
    if (src && el) {
      el.playbackRate = speed;
      if (playing && !failed && !disabled) el.play().catch(() => setPlaying(false, false));
      else el.pause();
    }
    if (!playing || busy || failed || disabled) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (src && el) time.set(el.currentTime);
      else {
        const next = time.get() + dt * speed;
        if (next >= total) {
          time.set(total);
          setPlaying(false, false);
          setSaid("Finished");
          return;
        }
        time.set(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // setPlaying reads the latest props; the loop restarts when these change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, busy, failed, disabled, speed, src, total]);

  // Disabled mid-play: stop, since the play button can no longer pause it.
  useEffect(() => {
    if (disabled) api.current.setPlaying(false, false);
  }, [disabled]);

  // Announce loading and errors when they start.
  const [prevState, setPrevState] = useState({ busy, failed });
  if (prevState.busy !== busy || prevState.failed !== failed) {
    setPrevState({ busy, failed });
    if (failed && !prevState.failed) setSaid(message);
    else if (busy && !prevState.busy) setSaid("Loading audio");
  }

  // After the inline Retry (which unmounts once the error clears), focus lands on the play button.
  const mainRef = useRef<HTMLButtonElement>(null);
  const retried = useRef(false);
  useEffect(() => {
    if (failed || !retried.current) return;
    retried.current = false;
    mainRef.current?.focus();
  }, [failed]);

  const retry = () => {
    setFileFailed(false);
    audio.current?.load();
    onRetry?.();
  };

  const cycleSpeed = () => {
    const i = speeds.indexOf(speed);
    const next = speeds[(i + 1) % speeds.length] ?? 1;
    if (speedProp === undefined) setOwnSpeed(next);
    onSpeedChange?.(next);
    setSaid(`Speed ${next}×`);
  };

  // Bars: as many 2 px bars on a 4 px pitch as the width holds.
  const wave = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState<number>(L.bars);
  useLayoutEffect(() => {
    const el = wave.current;
    if (!el) return;
    const measure = () => setCount(Math.max(8, Math.floor((el.clientWidth + 2) / 4)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const heights = resample(peaks ?? SHAPE, count).map((p) => Math.max(L.min, Math.round(p * L.max)));

  // Seeking: pointer (click or drag) and keys. Screen px throughout, so it stays true inside zoomed previews.
  const dragging = useRef(false);
  const [hover, setHover] = useState<number | null>(null);
  const fractionAt = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width)));
  };
  const onWaveDown = (e: PointerEvent<HTMLDivElement>) => {
    if (off) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    seek(fractionAt(e) * total);
  };
  const onWaveMove = (e: PointerEvent<HTMLDivElement>) => {
    if (off) return;
    const f = fractionAt(e);
    if (dragging.current) seek(f * total, false);
    if (e.pointerType === "mouse") setHover(f);
  };
  const onWaveUp = () => {
    dragging.current = false;
  };
  const onWaveKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (off) return;
    const now = time.get();
    const to =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? now + 5
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? now - 5
          : e.key === "PageUp"
            ? now + skip
            : e.key === "PageDown"
              ? now - skip
              : e.key === "Home"
                ? 0
                : e.key === "End"
                  ? total
                  : null;
    if (to === null) return;
    e.preventDefault();
    seek(to);
  };

  const label = ariaLabel ?? (typeof title === "string" ? title : "Audio player");
  const barTone = busy || failed ? "bg-track" : "bg-track-strong";

  const waveform = (
    <div
      ref={wave}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(total)}
      aria-valuenow={Math.min(sec, Math.round(total))}
      aria-valuetext={`${clock(sec)} of ${clock(total)}`}
      aria-disabled={off || undefined}
      onPointerDown={onWaveDown}
      onPointerMove={onWaveMove}
      onPointerUp={onWaveUp}
      onPointerCancel={onWaveUp}
      onPointerLeave={() => setHover(null)}
      onKeyDown={onWaveKey}
      className={`relative min-w-0 flex-1 touch-none select-none rounded-[6px] ${L.box} ${off ? "cursor-default" : "cursor-pointer"} ${ring}`}
    >
      {/* Unplayed bars, a hover preview up to the pointer, and the played bars clipped to the time. */}
      <div aria-hidden className="absolute inset-0 flex items-center justify-between">
        {heights.map((h, i) => (
          <span key={i} className={`w-[2px] shrink-0 rounded-full transition-colors duration-300 ${barTone}`} style={{ height: h }} />
        ))}
      </div>
      {hover !== null && !off && (
        <div aria-hidden className="absolute inset-0 flex items-center justify-between" style={{ clipPath: `inset(0 ${(1 - hover) * 100}% 0 0)` }}>
          {heights.map((h, i) => (
            <span key={i} className="w-[2px] shrink-0 rounded-full bg-[color-mix(in_srgb,var(--fg)_38%,var(--track-strong))]" style={{ height: h }} />
          ))}
        </div>
      )}
      {!failed && !busy && (
        <motion.div aria-hidden className="absolute inset-0 flex items-center justify-between" style={{ clipPath: played }}>
          {heights.map((h, i) => (
            <span key={i} className="w-[2px] shrink-0 rounded-full bg-fg" style={{ height: h }} />
          ))}
        </motion.div>
      )}
    </div>
  );

  const glyph = failed ? "error" : busy ? "busy" : playing ? "pause" : "play";
  const swap = reduce ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } } : { initial: { opacity: 0, scale: 0.6 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.6 } };
  const iconSize = card ? 20 : 16;
  const mainButton = (
    <motion.button
      ref={mainRef}
      type="button"
      onClick={failed ? retry : toggle}
      disabled={disabled}
      aria-label={failed ? "Retry loading the audio" : playing ? "Pause" : "Play"}
      aria-busy={busy || undefined}
      whileTap={disabled || reduce ? undefined : { scale: 0.94 }}
      className={`relative grid shrink-0 place-items-center rounded-full transition-[background-color,box-shadow,color] duration-200 disabled:opacity-50 ${card ? "size-10" : "size-9"} ${
        failed
          ? "bg-danger-soft text-danger-text"
          : "bg-[image:var(--grad-primary)] text-[var(--inverse-fg)] shadow-[var(--shadow-btn-primary)]"
      } ${ring}`}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span key={glyph} {...swap} transition={reduce ? { duration: 0.12 } : spring} className="grid place-items-center">
          {glyph === "error" ? (
            <CircleAlert size={iconSize} strokeWidth={1.5} aria-hidden />
          ) : glyph === "busy" ? (
            <LoaderCircle size={iconSize} strokeWidth={1.5} aria-hidden className="motion-safe:animate-spin" />
          ) : glyph === "pause" ? (
            <Pause size={iconSize} strokeWidth={1.5} aria-hidden />
          ) : (
            // The triangle sits a pixel right of centre so it looks centred.
            <Play size={iconSize} strokeWidth={1.5} aria-hidden className="translate-x-px" />
          )}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );

  const speedChip = (
    <button
      type="button"
      // aria-disabled, not disabled: buffering after a seek must not drop focus off the chip.
      onClick={() => !off && cycleSpeed()}
      aria-disabled={off || undefined}
      aria-label={`Playback speed ${speed}×`}
      className={`relative inline-flex h-6 min-w-8 shrink-0 items-center justify-center overflow-hidden whitespace-nowrap rounded-full px-2 text-[12px] font-medium leading-4 text-fg tabular-nums transition-[background-color,opacity,box-shadow] duration-200 aria-disabled:cursor-default ${
        card
          ? "bg-muted hover:bg-track aria-disabled:opacity-40 aria-disabled:hover:bg-muted"
          : "bg-surface dark:bg-track dark:shadow-[var(--shadow-hairline)] aria-disabled:bg-transparent aria-disabled:text-fg-subtle aria-disabled:shadow-none dark:aria-disabled:bg-transparent dark:aria-disabled:shadow-none"
      } ${ring}`}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={speed}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={reduce ? { duration: 0.12 } : spring}
        >
          {speed}×
        </motion.span>
      </AnimatePresence>
    </button>
  );

  const status = (
    <span role="status" aria-live="polite" className="sr-only">
      {said}
    </span>
  );
  const file = src ? (
    <audio
      ref={audio}
      src={src}
      preload="metadata"
      onLoadedMetadata={(e) => {
        const el = e.currentTarget;
        const d = el.duration;
        if (Number.isFinite(d) && d > 0) setFileDuration(d);
        // Start the file where the player already stands (defaultTime, or a seek made before it loaded).
        const at = Math.min(time.get(), Number.isFinite(d) && d > 0 ? d : time.get());
        if (at > 0) el.currentTime = at;
        if (at !== time.get()) time.set(at);
      }}
      onWaiting={() => setBuffering(true)}
      onCanPlay={() => setBuffering(false)}
      onPlaying={() => setBuffering(false)}
      onError={() => {
        setFileFailed(true);
        setPlaying(false, false);
      }}
      onEnded={() => {
        setPlaying(false, false);
        setSaid("Finished");
      }}
      className="hidden"
    />
  ) : null;

  const retryLine = (
    <p className={`flex min-w-0 items-center gap-1 text-danger-text ${card ? "text-[12px] leading-4" : "text-[13px] leading-5"}`}>
      <span className="truncate">{message}</span>
      <span aria-hidden>·</span>
      <button
        type="button"
        onClick={() => {
          retried.current = true;
          retry();
        }}
        className={`shrink-0 rounded-[4px] font-medium underline decoration-[color-mix(in_srgb,var(--danger-text)_45%,transparent)] underline-offset-2 hover:decoration-current ${ring}`}>
        Retry
      </button>
    </p>
  );

  if (!card) {
    return (
      <div
        role="group"
        aria-label={label}
        className={`flex h-12 w-full min-w-0 items-center gap-3 rounded-full bg-muted py-1.5 pl-1.5 pr-3.5 shadow-[var(--shadow-control)] ${className}`}
      >
        {mainButton}
        {failed ? (
          <div className="min-w-0 flex-1">{retryLine}</div>
        ) : (
          <>
            {waveform}
            <span className={`shrink-0 text-[14px] font-medium leading-5 tabular-nums transition-colors ${busy ? "text-fg-subtle" : "text-fg-muted"}`}>
              {/* The length until it starts, then the time played. */}
              {clock(playing || sec > 0 ? sec : total)}
            </span>
            {speedChip}
          </>
        )}
        {status}
        {file}
      </div>
    );
  }

  return (
    <div role="group" aria-label={label} className={`flex w-full min-w-0 flex-col gap-4 rounded-[24px] bg-surface p-5 shadow-[var(--shadow-card)] ${className}`}>
      {(title || meta || actions) && (
        <div className="flex min-w-0 items-start gap-3">
          <div className={`flex min-w-0 flex-1 flex-col gap-0.5 ${actions ? "pt-[7px]" : ""}`}>
            {title && <p className="truncate text-[15px] font-medium leading-[22px] tracking-[-0.009em] text-fg">{title}</p>}
            {(meta || icon) && (
              <p className="flex min-w-0 items-center gap-1.5 text-[13px] leading-5 tracking-[-0.003em] text-fg-subtle">
                {icon && <span className="grid size-4 shrink-0 place-items-center overflow-hidden [&>svg]:size-4">{icon}</span>}
                <span className="truncate">{meta}</span>
              </p>
            )}
          </div>
          {/* The kit's 32 × 36 More slot: the title line and the button centre on each other. */}
          {actions && <div className="flex h-9 shrink-0 items-center">{actions}</div>}
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0">{waveform}</div>
        <div className="relative h-4">
          <AnimatePresence initial={false} mode="popLayout">
            {failed ? (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                {retryLine}
              </motion.div>
            ) : (
              <motion.div
                key="times"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                aria-hidden
                className="flex items-center justify-between text-[12px] leading-4 text-fg-subtle tabular-nums"
              >
                <span>{clock(sec)}</span>
                <span>
                  {MINUS}
                  {clock(total - sec)}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center">
        <span aria-hidden />
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => !off && !atStart && seek(time.get() - skip)}
            aria-disabled={off || atStart || undefined}
            aria-label={`Back ${skip} seconds`}
            className={`grid size-10 shrink-0 place-items-center rounded-full text-fg-muted transition-[background-color,color,opacity] duration-150 hover:bg-muted hover:text-fg aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-fg-muted ${ring}`}
          >
            <SkipGlyph forward={false} seconds={skip} />
          </button>
          {mainButton}
          <button
            type="button"
            onClick={() => !off && !atEnd && seek(time.get() + skip)}
            aria-disabled={off || atEnd || undefined}
            aria-label={`Forward ${skip} seconds`}
            className={`grid size-10 shrink-0 place-items-center rounded-full text-fg-muted transition-[background-color,color,opacity] duration-150 hover:bg-muted hover:text-fg aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-fg-muted ${ring}`}
          >
            <SkipGlyph forward seconds={skip} />
          </button>
        </div>
        <div className="flex justify-end">{speedChip}</div>
      </div>

      {onTranscript && (
        <div className="-mb-1 border-t border-border pt-3">
          <button
            type="button"
            onClick={onTranscript}
            aria-describedby={`${uid}-len`}
            className={`group -mx-2 flex w-[calc(100%+16px)] min-w-0 items-center gap-2 rounded-[10px] px-2 py-1 text-left transition-colors duration-150 hover:bg-subtle ${ring}`}
          >
            <FileText size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-fg-muted" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5 tracking-[-0.003em] text-fg">{transcriptLabel}</span>
            <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-fg-subtle transition-[translate,color] duration-200 group-hover:translate-x-0.5 group-hover:text-fg" />
          </button>
          {/* Outside the button: the length is its description, not part of its name. */}
          <span id={`${uid}-len`} className="sr-only">
            Recording length {clock(total)}
          </span>
        </div>
      )}
      {status}
      {file}
    </div>
  );
}
