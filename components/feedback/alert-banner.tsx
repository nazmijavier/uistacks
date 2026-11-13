"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CircleCheck, Info, OctagonAlert, TriangleAlert, X } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type AlertBannerVariant = "info" | "success" | "warning" | "danger";

export interface AlertBannerAction {
  label: string;
  onClick?: () => void;
  /** Renders the action as a link. */
  href?: string;
}

export interface AlertBannerProps {
  /** Info and success are polite status messages; warning and danger are announced at once (role alert). */
  variant?: AlertBannerVariant;
  title: ReactNode;
  /** One or two lines under the title. */
  children?: ReactNode;
  /** Replaces the variant's icon; `false` hides it. */
  icon?: ReactNode | false;
  /** A small white pill: “Update card”, “View report”. */
  action?: AlertBannerAction;
  /** Shows the close button. The banner folds its height away when closed. */
  dismissible?: boolean;
  /** Accessible name of the close button. */
  dismissLabel?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
const ease = [0.22, 1, 0.36, 1] as const;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The close button is about to go: hand focus to the next control after the banner (or the one before it). */
function focusAround(box: HTMLElement) {
  const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !box.contains(el) && el.getClientRects().length > 0);
  const next =
    all.find((el) => box.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) ??
    all.reverse().find((el) => box.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
  next?.focus();
}

// In Dark every fill is a translucent tint of the saturated status colour, so the four read at the same weight (the
// pastel Dark status inks would turn the success and warning fills grey).
const VARIANTS: Record<AlertBannerVariant, { fill: string; ink: string; icon: ReactNode }> = {
  info: { fill: "bg-select-soft dark:bg-[color-mix(in_srgb,var(--select)_18%,transparent)]", ink: "text-select-text", icon: <Info size={20} strokeWidth={1.5} /> },
  success: { fill: "bg-success-soft dark:bg-[color-mix(in_srgb,#12a150_20%,transparent)]", ink: "text-success-text", icon: <CircleCheck size={20} strokeWidth={1.5} /> },
  warning: { fill: "bg-warning-soft dark:bg-[color-mix(in_srgb,#f5a524_18%,transparent)]", ink: "text-warning-text", icon: <TriangleAlert size={20} strokeWidth={1.5} /> },
  danger: { fill: "bg-danger-soft dark:bg-[color-mix(in_srgb,#e5484d_20%,transparent)]", ink: "text-danger-text", icon: <OctagonAlert size={20} strokeWidth={1.5} /> },
};

export function AlertBanner({
  variant = "info",
  title,
  children,
  icon,
  action,
  dismissible = false,
  dismissLabel = "Dismiss",
  open: openProp,
  defaultOpen = true,
  onOpenChange,
  className = "",
}: AlertBannerProps) {
  const [inner, setInner] = useState(defaultOpen);
  const open = openProp ?? inner;
  const reduce = useReduce();
  const v = VARIANTS[variant];
  const urgent = variant === "warning" || variant === "danger";
  const box = useRef<HTMLDivElement>(null);

  const close = () => {
    if (box.current?.contains(document.activeElement)) focusAround(box.current);
    if (openProp === undefined) setInner(false);
    onOpenChange?.(false);
  };

  const pill = `relative inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full bg-surface px-3 text-[13px] font-medium leading-[18px] text-fg shadow-[var(--shadow-btn-secondary)] transition-[scale] active:scale-[0.97] ${focusRing}`;

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="banner"
          ref={box}
          role={urgent ? "alert" : "status"}
          // Height (and any outer margin) folds on close; it only clips while it moves, so focus rings are never cut at rest.
          initial={{ height: reduce ? "auto" : 0, opacity: 0, overflow: "hidden" }}
          animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
          exit={reduce ? { opacity: 0 } : { height: 0, marginTop: 0, marginBottom: 0, opacity: 0, overflow: "hidden" }}
          transition={reduce ? { duration: 0.12 } : { duration: 0.3, ease, opacity: { duration: 0.2 } }}
          className={className}
        >
          <div className={`@container flex items-start gap-3 rounded-[14px] py-3 pl-3.5 ${dismissible ? "pr-2" : "pr-3.5"} transition-colors duration-200 ${v.fill}`}>
            {/* A banner that changes variant (failed, then resolved) crossfades its icon and copy over the fill's change. */}
            {icon !== false && (
              <span className="relative mt-px size-5 shrink-0">
                <AnimatePresence initial={false}>
                  <motion.span
                    key={variant}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.1 } }}
                    transition={{ duration: reduce ? 0 : 0.2 }}
                    className={`absolute inset-0 flex items-center justify-center [&_svg]:size-5 ${v.ink}`}
                  >
                    {icon ?? v.icon}
                  </motion.span>
                </AnimatePresence>
              </span>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-2.5 @md:flex-row @md:items-center @md:gap-4">
              <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={variant}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.1 } }}
                transition={{ duration: reduce ? 0 : 0.2 }}
                className="min-w-0 flex-1"
              >
                <p className="text-[14px] font-medium leading-5 text-fg">
                  {title}
                </p>
                {children && <div className="mt-0.5 text-[13px] leading-5 text-fg-muted">{children}</div>}
              </motion.div>
              </AnimatePresence>
              {action &&
                (action.href ? (
                  <a href={action.href} onClick={action.onClick} className={`${pill} self-start @md:self-center`}>
                    {action.label}
                  </a>
                ) : (
                  <button type="button" onClick={action.onClick} className={`${pill} self-start @md:self-center`}>
                    {action.label}
                  </button>
                ))}
            </div>
            {dismissible && (
              <motion.button
                type="button"
                aria-label={dismissLabel}
                onClick={close}
                whileTap={reduce ? undefined : { scale: 0.92 }}
                className={`-my-1 flex size-8 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-fg/[0.06] hover:text-fg ${focusRing}`}
              >
                <X size={16} strokeWidth={1.5} />
              </motion.button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
