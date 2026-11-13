"use client";

import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";

export type ChangeKind = "new" | "improved" | "fixed";

export interface ChangeItem {
  kind: ChangeKind;
  text: ReactNode;
}

export interface ChangelogAuthor {
  name: string;
  /** e.g. "Design engineer". */
  role?: string;
  /** A photo; without it the circle shows the first letter of the name. */
  avatar?: string;
}

export interface ChangelogEntryProps {
  /** e.g. "v1.16". */
  version: string;
  /** Shown as written, e.g. "Nov 12". Pass `dateTime` for the machine-readable date. */
  date: string;
  dateTime?: string;
  title: ReactNode;
  /** The short paragraph under the title. */
  description?: ReactNode;
  /** The list of changes, each with a New, Improved or Fixed tag. */
  changes?: ChangeItem[];
  /** Longer notes behind a "Read more" toggle that opens with a smooth height animation. */
  details?: ReactNode;
  /** Controlled open state of the details. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  readMoreLabel?: string;
  readLessLabel?: string;
  author?: ChangelogAuthor;
  /** Heading level of the title, to fit the page outline. Default 3. */
  headingLevel?: 2 | 3 | 4;
  /** Tag text per kind. */
  kindLabels?: Partial<Record<ChangeKind, string>>;
  className?: string;
}

const spring = { type: "spring", stiffness: 380, damping: 38 } as const;
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
const outline = "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--fg)_14%,transparent)]";
const LABELS: Record<ChangeKind, string> = { new: "New", improved: "Improved", fixed: "Fixed" };

const noSubscribe = () => () => {};

/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

/**
 * One release in a product changelog: version and date, title, a short paragraph, the list of changes with a small
 * outline tag each, optional longer notes behind Read more, and an optional author.
 */
export function ChangelogEntry({
  version,
  date,
  dateTime,
  title,
  description,
  changes = [],
  details,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  readMoreLabel = "Read more",
  readLessLabel = "Show less",
  author,
  headingLevel = 3,
  kindLabels,
  className = "",
}: ChangelogEntryProps) {
  const reduce = useReduce();
  const id = useId();
  const [own, setOwn] = useState(defaultOpen);
  const open = openProp ?? own;
  const setOpen = (v: boolean) => {
    if (openProp === undefined) setOwn(v);
    onOpenChange?.(v);
  };
  const H = `h${headingLevel}` as "h2" | "h3" | "h4";
  const labels = { ...LABELS, ...kindLabels };

  return (
    <article aria-labelledby={`${id}-title`} className={`w-full max-w-[640px] ${className}`}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5 text-fg-muted">
        <span className={`rounded-full px-2 py-0.5 font-mono text-[12px] leading-4 text-fg ${outline}`}>{version}</span>
        <time dateTime={dateTime}>{date}</time>
      </p>
      <H id={`${id}-title`} className="mt-3 text-balance text-[18px] font-medium leading-6 tracking-[-0.014em] text-fg">
        {title}
      </H>
      {description && <p className="mt-2 text-pretty text-[14px] leading-[22px] text-fg-muted">{description}</p>}

      {changes.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2.5">
          {changes.map((c, i) => (
            <li key={i} className="flex items-start gap-3 text-[14px] leading-[22px] text-fg">
              {/* Fixed width, so the change lines start on one edge whatever the tag says. */}
              <span className={`mt-px inline-flex h-5 w-[76px] shrink-0 items-center justify-center rounded-full text-[12px] font-medium leading-4 text-fg-muted ${outline}`}>
                {labels[c.kind]}
              </span>
              <span className="min-w-0 text-pretty">{c.text}</span>
            </li>
          ))}
        </ul>
      )}

      {details && (
        <>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                key="details"
                id={`${id}-details`}
                role="region"
                aria-labelledby={`${id}-toggle`}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={reduce ? { duration: 0 } : { height: spring, opacity: { duration: 0.2 } }}
                className="overflow-hidden"
              >
                <div className="pt-4 text-pretty text-[14px] leading-[22px] text-fg-muted [&_p+p]:mt-3">{details}</div>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            id={`${id}-toggle`}
            type="button"
            aria-expanded={open}
            aria-controls={open ? `${id}-details` : undefined}
            onClick={() => setOpen(!open)}
            className={`mt-3 -ml-1 inline-flex h-8 items-center gap-1 rounded-full px-1 text-[14px] font-medium text-fg ${focusRing}`}
          >
            {open ? readLessLabel : readMoreLabel}
            <motion.span initial={false} animate={{ rotate: open ? 180 : 0 }} transition={reduce ? { duration: 0 } : spring} className="grid size-4 place-items-center text-fg-muted">
              <ChevronDown size={16} strokeWidth={1.5} aria-hidden />
            </motion.span>
          </button>
        </>
      )}

      {author && (
        <div className="mt-4 flex items-center gap-2.5">
          {author.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={author.avatar} alt="" width={28} height={28} className="size-7 shrink-0 rounded-full object-cover" />
          ) : (
            <span aria-hidden className={`grid size-7 shrink-0 place-items-center rounded-full bg-surface text-[12px] font-medium text-fg ${outline}`}>
              {author.name.charAt(0).toUpperCase()}
            </span>
          )}
          <p className="min-w-0 truncate text-[13px] leading-5">
            <span className="font-medium text-fg">{author.name}</span>
            {author.role && <span className="text-fg-muted"> · {author.role}</span>}
          </p>
        </div>
      )}
    </article>
  );
}
