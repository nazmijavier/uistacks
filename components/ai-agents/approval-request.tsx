"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleAlert, Check, Landmark, ShieldCheck, Timer, TriangleAlert, X } from "lucide-react";

export type ApprovalStatus = "pending" | "approved" | "always" | "denied";

export interface ApprovalRequestProps {
  /** The agent and the app, above the title. */
  overline?: string;
  title: string;
  description?: string;
  /** A short red line about what can't be undone (high risk). */
  warning?: string;
  risk?: "low" | "high";
  /** Shown with a timer under the details while the request is pending, e.g. "Expires in 9 min". */
  expiry?: string;
  /** `mono` sets the value in the mono face, for a tool name such as `payments.create`. */
  details?: { label: string; value: string; mono?: boolean }[];
  icon?: ReactNode;
  /** Show the "Always allow" button. */
  allowAlways?: boolean;
  status?: ApprovalStatus;
  defaultStatus?: ApprovalStatus;
  onApprove?: (scope: "once" | "always") => void;
  onDeny?: () => void;
  className?: string;
}

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;
// Hover and press tint a ::before layer under the label (the kit button language); focus gets the select-blue ring.
const btn =
  "relative isolate h-9 shrink-0 whitespace-nowrap rounded-full px-3 text-[14px] @[400px]:px-3.5 font-medium outline-none transition active:scale-[0.97] before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-full before:opacity-0 before:transition-opacity focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]";
const secondary = `${btn} bg-surface text-fg shadow-[var(--shadow-btn-secondary)] before:bg-fg hover:before:opacity-[0.04] active:before:opacity-[0.08]`;
const primary = `${btn} text-[var(--inverse-fg)] shadow-[var(--shadow-btn-primary)] before:bg-[var(--inverse-fg)] hover:before:opacity-[0.08] active:before:opacity-[0.14]`;

export function ApprovalRequest({
  overline,
  title,
  description,
  warning,
  risk = "low",
  expiry,
  details,
  icon,
  allowAlways = true,
  status: statusProp,
  defaultStatus = "pending",
  onApprove,
  onDeny,
  className = "",
}: ApprovalRequestProps) {
  const [inner, setInner] = useState<ApprovalStatus>(defaultStatus);
  const status = statusProp ?? inner;
  const high = risk === "high";
  const result = status === "approved" ? "Allowed once" : status === "always" ? "Always allowed for this tool" : status === "denied" ? "Denied" : "";
  // The pressed button unmounts with the pending row: focus moves to the result line (only after a click here).
  const decided = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!decided.current || status === "pending") return;
    decided.current = false;
    resultRef.current?.focus();
  }, [status]);

  const approve = (scope: "once" | "always") => {
    decided.current = true;
    setInner(scope === "once" ? "approved" : "always");
    onApprove?.(scope);
  };

  const riskPill = (place: string) => (
    <span
      className={`h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-sm ${high ? "bg-danger-soft text-danger" : "bg-muted text-fg-muted"} ${place}`}
    >
      {high ? <TriangleAlert size={16} strokeWidth={1.5} /> : <ShieldCheck size={16} strokeWidth={1.5} />}
      {high ? "High risk" : "Low risk"}
    </span>
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring}
      className={`@container w-full max-w-[460px] rounded-[20px] bg-surface p-5 shadow-[var(--shadow-card)] ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className={`grid size-10 shrink-0 place-items-center rounded-[14px] ${high ? "bg-danger-soft text-danger" : "bg-surface shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--fg)_10%,transparent)] text-fg"}`}>
          {icon ?? <Landmark size={20} strokeWidth={1.5} />}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          {overline && <p className="text-[13px] font-medium text-fg-muted">{overline}</p>}
          <p className="mt-0.5 text-[17px] font-medium leading-6 text-fg">{title}</p>
          {/* A narrow card moves the risk pill under the title, so the overline and the title keep their words. */}
          {riskPill("mt-2 inline-flex @[400px]:hidden")}
        </div>
        {riskPill("mt-2 hidden @[400px]:inline-flex")}
      </div>

      {description && <p className="mt-3 text-base leading-[26px] text-fg-muted">{description}</p>}

      {warning && (
        <div className="mt-3 flex items-center gap-2.5 rounded-[14px] bg-danger-soft px-4 py-3 text-[15px] text-danger">
          <CircleAlert size={16} strokeWidth={1.5} className="shrink-0" />
          {warning}
        </div>
      )}

      {details && details.length > 0 && (
        // A narrow card tightens the label column; values wrap rather than cut a payee or an amount.
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 rounded-[18px] bg-subtle p-4 text-[15px] @[400px]:grid-cols-[minmax(96px,auto)_1fr] @[400px]:gap-x-6">
          {details.map((d) => (
            <div key={d.label} className="contents">
              <dt className="text-fg-muted">{d.label}</dt>
              <dd className={`min-w-0 break-words text-fg ${d.mono ? "font-mono text-[14px]" : ""}`}>{d.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* The expiry is a meta line of its own, so the three buttons always share one row. */}
      {expiry && status === "pending" && (
        <p className="mt-3 flex items-center gap-1 text-[13px] text-fg-muted">
          <Timer size={16} strokeWidth={1.5} className="shrink-0" />
          {expiry}
        </p>
      )}

      <div className="mt-4 flex min-h-9 items-center gap-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {status === "pending" ? (
            // Deny on the left, the approvals on the right.
            <motion.div key="pending" className="flex w-full items-center gap-1.5" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring}>
              <button
                type="button"
                className={`${secondary} mr-auto`}
                onClick={() => {
                  decided.current = true;
                  setInner("denied");
                  onDeny?.();
                }}
              >
                Deny
              </button>
              {allowAlways && !high && (
                <button type="button" className={secondary} onClick={() => approve("always")}>
                  Always allow
                </button>
              )}
              <button
                type="button"
                onClick={() => approve("once")}
                className={primary}
                style={{ backgroundImage: "var(--grad-primary)" }}
              >
                Allow once
              </button>
            </motion.div>
          ) : (
            <motion.div
              key={status}
              ref={resultRef}
              tabIndex={-1}
              className={`flex items-center gap-2 rounded-full text-[15px] font-medium outline-none ${status === "denied" ? "text-fg-muted" : "text-success"}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={spring}
            >
              <motion.span
                className={`grid size-7 place-items-center rounded-full ${status === "denied" ? "bg-muted" : "bg-success-soft"}`}
                initial={{ scale: 0.4, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 520, damping: 18 }}
              >
                {status === "denied" ? <X size={16} strokeWidth={2} /> : <Check size={16} strokeWidth={2} />}
              </motion.span>
              {result}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {result}
      </span>
    </motion.div>
  );
}
