"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Copy } from "lucide-react";

export type CodeLanguage = "ts" | "tsx" | "js" | "jsx" | "json" | "python" | "go" | "bash" | "text";

export interface CodeBlockTab {
  id: string;
  /** The tab label, e.g. "Node.js" or "route.ts". */
  label: string;
  language: CodeLanguage;
  code: string;
  /** 1-based line numbers to highlight. */
  highlight?: number[];
}

export interface CodeBlockProps {
  /** Language or file tabs. With one tab (or `code`), the header shows its label instead. */
  tabs?: CodeBlockTab[];
  /** A single snippet, when there are no tabs. */
  code?: string;
  language?: CodeLanguage;
  /** 1-based line numbers to highlight (single snippet). */
  highlight?: number[];
  /** The header label for a single snippet, e.g. a file name. */
  title?: string;
  /** The open tab id. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Show line numbers (default true). */
  lineNumbers?: boolean;
  /** Wrap long lines instead of scrolling sideways. */
  wrap?: boolean;
  /** Scroll the code past this height, in px. */
  maxHeight?: number;
  copyLabel?: string;
  copiedLabel?: string;
  onCopy?: (code: string) => void;
  className?: string;
}

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;
// The Copy button sits on the card, so its ring offset is the card colour.
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]";
// Tabs draw an inset ring on a top layer: it stays inside the scrolling strip and above the sliding pill.
const tabRing =
  "outline-none after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[var(--select)]";

const noSubscribe = () => () => {};

/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  return hydrated && Boolean(prefers);
}

/* A tiny tokenizer: keywords, strings and comments get colour; everything else stays in the text colour. */

type Kind = "kw" | "str" | "com" | "plain";
type Tok = { k: Kind; v: string };

const JS =
  "import export from const let var function return await async new if else for while do of in class extends default type interface as satisfies true false null undefined try catch finally throw typeof instanceof void yield switch case break continue this";
const KEYWORDS: Record<CodeLanguage, Set<string>> = {
  ts: new Set(JS.split(" ")),
  tsx: new Set(JS.split(" ")),
  js: new Set(JS.split(" ")),
  jsx: new Set(JS.split(" ")),
  json: new Set(["true", "false", "null"]),
  python: new Set(
    "import from def return if elif else for while in not and or is class with as try except finally raise None True False await async lambda pass yield global break continue".split(" "),
  ),
  go: new Set("package import func return if else for range var const type struct interface map chan go defer nil true false switch case break continue select".split(" ")),
  bash: new Set("curl export echo if then else fi for do done in while case esac npm npx pnpm".split(" ")),
  text: new Set(),
};
const SLASH = new Set<CodeLanguage>(["ts", "tsx", "js", "jsx", "go"]);
const HASH = new Set<CodeLanguage>(["python", "bash"]);

export function tokenize(code: string, language: CodeLanguage): Tok[][] {
  const out: Tok[] = [];
  const kw = KEYWORDS[language];
  let plain = "";
  const push = (k: Kind, v: string) => {
    if (plain) out.push({ k: "plain", v: plain });
    plain = "";
    out.push({ k, v });
  };
  const toEol = (from: number) => {
    const j = code.indexOf("\n", from);
    return j < 0 ? code.length : j;
  };
  let i = 0;
  while (language !== "text" && i < code.length) {
    const c = code[i];
    if (SLASH.has(language) && code.startsWith("//", i)) {
      const j = toEol(i);
      push("com", code.slice(i, j));
      i = j;
    } else if (SLASH.has(language) && code.startsWith("/*", i)) {
      const end = code.indexOf("*/", i + 2);
      const j = end < 0 ? code.length : end + 2;
      push("com", code.slice(i, j));
      i = j;
    } else if (HASH.has(language) && c === "#" && (i === 0 || /\s/.test(code[i - 1]))) {
      const j = toEol(i);
      push("com", code.slice(i, j));
      i = j;
    } else if (c === '"' || c === "'" || (c === "`" && SLASH.has(language))) {
      let j = i + 1;
      while (j < code.length && code[j] !== c && (c === "`" || code[j] !== "\n")) j += code[j] === "\\" ? 2 : 1;
      const end = code[j] === c ? j + 1 : j;
      push("str", code.slice(i, end));
      i = end;
    } else if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < code.length && /[\w$]/.test(code[j])) j += 1;
      const word = code.slice(i, j);
      // A word followed by ":" in an object is a key, not a keyword ("default: …").
      if (kw.has(word) && code[j] !== ":") push("kw", word);
      else plain += word;
      i = j;
    } else {
      plain += c;
      i += 1;
    }
  }
  if (language === "text") plain = code;
  if (plain) out.push({ k: "plain", v: plain });

  const lines: Tok[][] = [[]];
  for (const t of out) {
    t.v.split("\n").forEach((part, n) => {
      if (n > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ k: t.k, v: part });
    });
  }
  return lines;
}

/** Calm syntax, as on the component pages: keywords violet, strings green, comments gray. All pass AA on the panel and on a highlighted line. */
const TOKEN_CLASS: Record<Kind, string> = {
  kw: "text-[#7c3aed] dark:text-[#c4b5fd]",
  str: "text-[#157438] dark:text-[#86efac]",
  com: "text-fg-subtle",
  plain: "",
};

export function CodeBlock({
  tabs: tabsProp,
  code = "",
  language = "ts",
  highlight,
  title,
  value: valueProp,
  defaultValue,
  onValueChange,
  lineNumbers = true,
  wrap = false,
  maxHeight,
  copyLabel = "Copy code",
  copiedLabel = "Copied",
  onCopy,
  className = "",
}: CodeBlockProps) {
  const reduce = useReduce();
  const id = useId();
  const tabs = useMemo<CodeBlockTab[]>(() => (tabsProp?.length ? tabsProp : [{ id: "code", label: title ?? "", language, code, highlight }]), [tabsProp, title, language, code, highlight]);
  const [innerValue, setInnerValue] = useState(defaultValue ?? tabs[0]?.id);
  const value = valueProp ?? innerValue;
  const tab = tabs.find((t) => t.id === value) ?? tabs[0];
  const lines = useMemo(() => tokenize(tab.code.replace(/\n$/, ""), tab.language), [tab]);
  const marked = new Set(tab.highlight ?? []);
  const [copied, setCopied] = useState(false);
  // A blocked clipboard: Copied is not shown, the sr-only status line says so instead.
  const [copyFailed, setCopyFailed] = useState(false);
  // Bumped on every copy, so a second click restarts the Copied timer.
  const [round, setRound] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");
  // Long lines that run past the right edge get a soft fade there (scrollbars are hidden on touch and macOS), gone at the scroll end.
  const [fade, setFade] = useState(false);
  const checkEdge = (el: HTMLElement) => setFade(el.scrollWidth - el.clientWidth - el.scrollLeft > 1);

  // The panel eases to the new tab's height.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const pre = bodyRef.current?.querySelector<HTMLElement>(`pre[data-tab="${CSS.escape(tab.id)}"]`);
    if (!pre) return;
    // The observer fires once on observe, so this also takes the first reading.
    const ro = new ResizeObserver(() => checkEdge(pre));
    ro.observe(pre);
    return () => ro.disconnect();
  }, [tab.id]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied, round]);

  const select = (next: string) => {
    if (valueProp === undefined) setInnerValue(next);
    onValueChange?.(next);
  };

  const onTabKey = (e: KeyboardEvent, i: number) => {
    let n = -1;
    if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = tabs.length - 1;
    else return;
    e.preventDefault();
    select(tabs[n].id);
    tabRefs.current[n]?.focus();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tab.code);
      setCopyFailed(false);
      setCopied(true);
      setRound((r) => r + 1);
    } catch {
      /* Clipboard blocked: no Copied state; the callback still gets the text. */
      setCopied(false);
      setCopyFailed(true);
    }
    onCopy?.(tab.code);
  };

  const multi = tabs.length > 1;
  // At least two digits, so the code column doesn't shift between a 7-line and a 13-line tab.
  const gutter = Math.max(2, String(lines.length).length);

  return (
    <div className={`@container w-full max-w-[640px] rounded-[20px] bg-surface p-1.5 shadow-[var(--shadow-card)] ${className}`}>
      {/* The header lines up with the code panel's edges, so the frame is 6 px on every side. */}
      <div className="flex items-center gap-3 pb-1.5">
        {multi ? (
          <div
            role="tablist"
            aria-label="Language"
            className="isolate flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-full bg-[color-mix(in_srgb,var(--fg)_6%,transparent)] p-0.5 dark:bg-subtle"
          >
            {tabs.map((t, i) => {
              const on = t.id === tab.id;
              return (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`${id}-tab-${t.id}`}
                  aria-selected={on}
                  aria-controls={`${id}-panel`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => select(t.id)}
                  onKeyDown={(e) => onTabKey(e, i)}
                  className={`relative h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium leading-5 transition-colors @max-[26rem]:px-3 ${on ? "text-fg" : "text-fg-muted hover:text-fg"} ${tabRing}`}
                >
                  {on && (
                    <motion.span
                      layoutId={`${id}-indicator`}
                      className="absolute inset-0 rounded-full bg-surface shadow-[var(--shadow-btn-secondary)] dark:bg-raised"
                      transition={reduce ? { duration: 0 } : spring}
                    />
                  )}
                  {/* Above the pill, which paints over earlier tabs while it slides across them. */}
                  <span className="relative z-10">{t.label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <span className="min-w-0 truncate pl-3 text-[13px] font-medium leading-5 text-fg">{tab.label || tab.language}</span>
        )}
        <motion.button
          type="button"
          whileTap={reduce ? undefined : { scale: 0.97 }}
          onClick={copy}
          aria-label={copied ? copiedLabel : copyLabel}
          // In a narrow card the button folds to its icon; the label stays for screen readers.
          className={`ml-auto inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-surface pl-2.5 pr-3 text-[13px] font-medium leading-5 text-fg shadow-[var(--shadow-btn-secondary)] dark:bg-raised @max-[26rem]:w-8 @max-[26rem]:px-0 ${focusRing}`}
        >
          <span className="relative grid size-4 place-items-center">
            <AnimatePresence mode="popLayout" initial={false}>
              {copied ? (
                <motion.svg key="check" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <motion.path
                    d="M4 12l5 5L20 6"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={reduce ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.28 }}
                  />
                </motion.svg>
              ) : (
                <motion.span key="copy" className="grid place-items-center" initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                  <Copy size={16} strokeWidth={1.5} aria-hidden />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          <span className="@max-[26rem]:sr-only">
            {copied ? copiedLabel : copyLabel}
          </span>
        </motion.button>
        <span role="status" aria-live="polite" className="sr-only">
          {copied ? copiedLabel : copyFailed ? "Couldn't copy. Select the code to copy it." : ""}
        </span>
      </div>

      <motion.div
        id={`${id}-panel`}
        role={multi ? "tabpanel" : undefined}
        aria-labelledby={multi ? `${id}-tab-${tab.id}` : undefined}
        className="overflow-hidden rounded-[14px] bg-subtle"
        initial={false}
        animate={{ height }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 38 }}
      >
        <div ref={bodyRef}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.pre
              key={tab.id}
              data-tab={tab.id}
              tabIndex={0}
              onScroll={(e) => checkEdge(e.currentTarget)}
              aria-label={`${tab.label || tab.language} code`}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ duration: 0.2 }}
              style={{
                maxHeight,
                ...(fade && !wrap ? { maskImage: "linear-gradient(to right, #000 calc(100% - 48px), transparent)", WebkitMaskImage: "linear-gradient(to right, #000 calc(100% - 48px), transparent)" } : null),
              }}
              className={`overflow-auto py-3 font-mono text-[13px] leading-[22px] text-fg outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--select)] ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}
            >
              <code className={`block ${wrap ? "" : "min-w-max"}`}>
                {lines.map((line, n) => {
                  const hl = marked.has(n + 1);
                  return (
                    <span key={n} className={`relative flex pr-4 ${hl ? "bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]" : ""} ${lineNumbers ? "" : "pl-4"}`} data-highlighted={hl || undefined}>
                      {hl && <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-fg-subtle" />}
                      {lineNumbers && (
                        <span
                          aria-hidden
                          className={`shrink-0 select-none pl-3 pr-4 text-right tabular-nums ${hl ? "text-fg-muted" : "text-fg-subtle"}`}
                          style={{ width: `calc(${gutter}ch + 1.75rem + 2px)` }}
                        >
                          {n + 1}
                        </span>
                      )}
                      <span className={wrap ? "min-w-0 flex-1" : ""}>
                        {line.length === 0
                          ? "​"
                          : line.map((t, j) =>
                              t.k === "plain" ? (
                                t.v
                              ) : (
                                <span key={j} className={TOKEN_CLASS[t.k]}>
                                  {t.v}
                                </span>
                              ),
                            )}
                      </span>
                    </span>
                  );
                })}
              </code>
            </motion.pre>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
