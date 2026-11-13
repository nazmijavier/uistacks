"use client";

import { useId, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type AccordionVariant = "plain" | "contained" | "separated";

export interface AccordionItem {
  value: string;
  title: string;
  content: ReactNode;
  /** A glyph before the title. */
  icon?: ReactNode;
  disabled?: boolean;
}

export interface AccordionProps {
  items: AccordionItem[];
  /** Plain divider rows, rows inside one card, or one card per item. */
  variant?: AccordionVariant;
  size?: "sm" | "md";
  /** "single" keeps one item open at a time; "multiple" lets several stay open. */
  type?: "single" | "multiple";
  /** The open items, by value. */
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  /** Heading level that wraps each header button, to fit the page outline. Default 3. */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
const card = "bg-surface shadow-[var(--shadow-card)] dark:shadow-[var(--shadow-hairline)]";

const ROOT: Record<AccordionVariant, string> = {
  plain: "flex flex-col",
  contained: `flex flex-col gap-0.5 rounded-[16px] p-1 ${card}`,
  separated: "flex flex-col",
};

const SIZE = {
  md: {
    text: "text-sm leading-5",
    trigger: { plain: "min-h-12 gap-3 px-3 py-3", contained: "min-h-12 gap-3 px-3 py-3", separated: "min-h-12 gap-3 px-4 py-3" },
    body: { plain: "px-3 pb-3", contained: "px-3 pb-4", separated: "px-4 pb-4" },
    radius: "rounded-[14px]",
    // separated cards sit 12 px apart so their shadows don't meet
    stack: "gap-3",
  },
  sm: {
    text: "text-[13px] leading-5",
    trigger: { plain: "min-h-10 gap-2.5 px-2.5 py-2.5", contained: "min-h-10 gap-2.5 px-2.5 py-2.5", separated: "min-h-10 gap-2.5 px-3.5 py-2.5" },
    body: { plain: "px-2.5 pb-2.5", contained: "px-2.5 pb-3", separated: "px-3.5 pb-3" },
    radius: "rounded-[12px]",
    stack: "gap-2",
  },
};

export function Accordion({ items, variant = "plain", size = "md", type = "single", value, defaultValue = [], onValueChange, headingLevel = 3, className = "" }: AccordionProps) {
  const id = useId();
  const Heading = `h${headingLevel}` as const;
  const reduce = useReduce();
  const [inner, setInner] = useState<string[]>(defaultValue);
  const openValues = value ?? inner;
  const s = SIZE[size];

  const toggle = (v: string) => {
    const isOpen = openValues.includes(v);
    const next = type === "single" ? (isOpen ? [] : [v]) : isOpen ? openValues.filter((x) => x !== v) : [...openValues, v];
    setInner(next);
    onValueChange?.(next);
  };

  // Up / Down / Home / End move between the headers (Enter and Space toggle natively).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const target = e.target as HTMLElement;
    if (target.dataset.accordion !== id) return;
    const triggers = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-accordion]:not(:disabled)")).filter((b) => b.dataset.accordion === id);
    const at = triggers.indexOf(target as HTMLButtonElement);
    e.preventDefault();
    const to = e.key === "Home" ? 0 : e.key === "End" ? triggers.length - 1 : (at + (e.key === "ArrowDown" ? 1 : -1) + triggers.length) % triggers.length;
    triggers[to]?.focus();
  };

  return (
    <div onKeyDown={onKeyDown} className={`w-full ${ROOT[variant]} ${variant === "separated" ? s.stack : ""} ${className}`}>
      {items.map((item) => {
        const open = openValues.includes(item.value);
        const triggerId = `${id}-trigger-${item.value}`;
        const panelId = `${id}-panel-${item.value}`;
        const shape =
          variant === "separated" ? (open ? "rounded-t-[16px]" : "rounded-[16px]") : s.radius;
        const wrapper =
          variant === "plain"
            ? "border-b border-border py-1"
            : variant === "contained"
              ? `${s.radius} transition-colors ${open ? "bg-muted" : ""}`
              : `rounded-[16px] ${card}`;

        return (
          <div key={item.value} className={wrapper}>
            <Heading>
              <button
                type="button"
                id={triggerId}
                data-accordion={id}
                aria-expanded={open}
                // The panel is only mounted while open.
                aria-controls={open ? panelId : undefined}
                disabled={item.disabled}
                onClick={() => toggle(item.value)}
                className={`flex w-full items-center text-left ${s.trigger[variant]} ${shape} transition-colors enabled:hover:bg-fg/5 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
              >
                {item.icon && <span className="flex shrink-0 text-fg-muted">{item.icon}</span>}
                <span className={`min-w-0 flex-1 font-medium text-fg ${s.text}`}>{item.title}</span>
                <motion.span aria-hidden initial={false} animate={{ rotate: open ? 180 : 0 }} transition={reduce ? { duration: 0 } : spring} className="flex shrink-0 text-fg-muted">
                  <ChevronDown size={size === "md" ? 20 : 16} strokeWidth={1.5} />
                </motion.span>
              </button>
            </Heading>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  key="panel"
                  id={panelId}
                  role="region"
                  aria-labelledby={triggerId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={reduce ? { duration: 0 } : { height: spring, opacity: { duration: 0.2 } }}
                  className="overflow-hidden"
                >
                  <div className={`${s.body[variant]} ${s.text} text-pretty text-fg-muted`}>{item.content}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
