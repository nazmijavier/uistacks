"use client";

import { useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export type TreeBadgeTone = "neutral" | "select" | "success" | "warning" | "danger";

export interface TreeNode {
  id: string;
  label: string;
  /** Replaces the folder or file icon (20 px). */
  icon?: ReactNode;
  /** A small pill on the right, e.g. "M" or "+2". */
  badge?: string;
  /** What the badge means, read by screen readers instead of the bare text, e.g. "Modified" for "M". */
  badgeLabel?: string;
  badgeTone?: TreeBadgeTone;
  /** Any array, even an empty one, makes the row a folder that opens and closes. */
  children?: TreeNode[];
  /** Can be reached with the keyboard, but not selected. */
  disabled?: boolean;
}

export interface TreeViewProps {
  items: TreeNode[];
  /** Id of the selected row; it sits on the selected pill. */
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (id: string, node: TreeNode) => void;
  /** Ids of the open folders. */
  expanded?: string[];
  defaultExpanded?: string[];
  onExpandedChange?: (ids: string[]) => void;
  /** Folder and file icons on rows without their own. */
  icons?: boolean;
  /** 1 px lines under each open folder. */
  guides?: boolean;
  /** Px each level steps in. */
  indent?: number;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
}

const PAD = 6; // left padding of a top-level row
const spring = { type: "spring", stiffness: 520, damping: 40 } as const;
const ease = [0.22, 1, 0.36, 1] as const;

const TONES: Record<TreeBadgeTone, string> = {
  neutral: "bg-muted text-fg-muted",
  select: "bg-select-soft text-select-text",
  success: "bg-success-soft text-success-text",
  warning: "bg-warning-soft text-warning-text",
  danger: "bg-danger-soft text-danger-text",
};

type Row = { node: TreeNode; parent: string | null };

/** The rows a person can see right now, top to bottom: open folders show their children. */
function visibleRows(items: TreeNode[], open: Set<string>, parent: string | null = null, out: Row[] = []) {
  for (const node of items) {
    out.push({ node, parent });
    if (node.children && open.has(node.id)) visibleRows(node.children, open, node.id, out);
  }
  return out;
}

/** Every node's parent, so a closed folder can take focus back from a hidden child. */
function parentsOf(items: TreeNode[], parent: string | null = null, out = new Map<string, string | null>()) {
  for (const node of items) {
    out.set(node.id, parent);
    if (node.children) parentsOf(node.children, node.id, out);
  }
  return out;
}

export function TreeView({
  items,
  value,
  defaultValue = null,
  onValueChange,
  expanded,
  defaultExpanded = [],
  onExpandedChange,
  icons = true,
  guides = true,
  indent = 20,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  className = "",
}: TreeViewProps) {
  const [innerValue, setInnerValue] = useState(defaultValue);
  const selected = value === undefined ? innerValue : value;
  const [innerOpen, setInnerOpen] = useState(defaultExpanded);
  const openIds = expanded ?? innerOpen;
  const open = new Set(openIds);
  const [focusId, setFocusId] = useState<string | null>(null);
  const reduce = useReduce();
  const uid = useId();
  const els = useRef(new Map<string, HTMLLIElement>());
  const typed = useRef({ text: "", at: 0 });

  const rows = visibleRows(items, open);
  const visible = (id: string | null) => !!id && rows.some((r) => r.node.id === id);
  // One row is in the Tab order: the last focused, else the selected, else the first.
  const tabStop = visible(focusId) ? focusId : visible(selected) ? selected : (rows[0]?.node.id ?? null);

  const setOpenIds = (next: string[]) => {
    if (expanded === undefined) setInnerOpen(next);
    onExpandedChange?.(next);
  };
  const toggle = (node: TreeNode, to = !open.has(node.id)) => {
    if (to === open.has(node.id)) return;
    if (!to) {
      // Focus inside the folder that closes moves up to it.
      const parents = parentsOf(items);
      for (let p = focusId ? parents.get(focusId) : null; p; p = parents.get(p) ?? null) {
        if (p === node.id) {
          setFocusId(node.id);
          if (document.activeElement && els.current.get(node.id)?.contains(document.activeElement)) els.current.get(node.id)?.focus({ preventScroll: true });
          break;
        }
      }
    }
    setOpenIds(to ? [...openIds, node.id] : openIds.filter((id) => id !== node.id));
  };
  const select = (node: TreeNode) => {
    if (node.disabled) return;
    if (value === undefined) setInnerValue(node.id);
    onValueChange?.(node.id, node);
  };
  const focusRow = (id: string | undefined) => {
    if (!id) return;
    setFocusId(id);
    const el = els.current.get(id);
    el?.focus({ preventScroll: true });
    el?.firstElementChild?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const id = (e.target as HTMLElement).dataset.treeId;
    const at = rows.findIndex((r) => r.node.id === id);
    if (at < 0 || e.altKey || e.ctrlKey || e.metaKey) return;
    const { node, parent } = rows[at];
    const folder = !!node.children;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    switch (e.key) {
      case "ArrowDown":
        handled();
        return focusRow(rows[at + 1]?.node.id);
      case "ArrowUp":
        handled();
        return focusRow(rows[at - 1]?.node.id);
      case "Home":
        handled();
        return focusRow(rows[0]?.node.id);
      case "End":
        handled();
        return focusRow(rows[rows.length - 1]?.node.id);
      case "ArrowRight":
        handled();
        if (!folder) return;
        if (!open.has(node.id)) return toggle(node, true);
        return focusRow(node.children?.[0]?.id);
      case "ArrowLeft":
        handled();
        if (folder && open.has(node.id)) return toggle(node, false);
        return focusRow(parent ?? undefined);
      case "Enter":
        handled();
        select(node);
        if (folder) toggle(node);
        return;
      case " ":
        handled();
        return select(node);
      case "*": {
        // Opens every folder at the focused row's level.
        handled();
        const siblings = parent ? (rows.find((r) => r.node.id === parent)?.node.children ?? []) : items;
        const add = siblings.filter((n) => n.children && !open.has(n.id)).map((n) => n.id);
        if (add.length) setOpenIds([...openIds, ...add]);
        return;
      }
    }
    // Type-ahead: the next visible row starting with what was typed in the last half second.
    if (e.key.length !== 1 || e.key === " ") return;
    const t = typed.current;
    t.text = e.timeStamp - t.at > 500 ? e.key.toLowerCase() : t.text + e.key.toLowerCase();
    t.at = e.timeStamp;
    const from = t.text.length === 1 ? at + 1 : at;
    for (let k = 0; k < rows.length; k++) {
      const r = rows[(from + k) % rows.length];
      if (r.node.label.toLowerCase().startsWith(t.text)) {
        e.preventDefault();
        return focusRow(r.node.id);
      }
    }
  };

  const level = (nodes: TreeNode[], depth: number): ReactNode =>
    nodes.map((node, i) => {
      const folder = !!node.children;
      const isOpen = folder && open.has(node.id);
      const on = selected === node.id;
      const x = PAD + depth * indent;
      return (
        <li
          key={node.id}
          ref={(el) => {
            if (el) els.current.set(node.id, el);
            else els.current.delete(node.id);
          }}
          data-tree-id={node.id}
          role="treeitem"
          aria-level={depth + 1}
          aria-setsize={nodes.length}
          aria-posinset={i + 1}
          aria-expanded={folder ? isOpen : undefined}
          aria-selected={on}
          aria-disabled={node.disabled || undefined}
          tabIndex={tabStop === node.id ? 0 : -1}
          onFocus={(e) => {
            if (e.target === e.currentTarget) setFocusId(node.id);
          }}
          className="outline-none [&:focus-visible>[data-row]]:ring-2 [&:focus-visible>[data-row]]:ring-[var(--select)] [&:focus-visible>[data-row]]:ring-offset-2 [&:focus-visible>[data-row]]:ring-offset-[var(--bg)]"
        >
          <div
            data-row
            onClick={() => {
              select(node);
              if (folder) toggle(node);
            }}
            style={{ paddingLeft: x }}
            className={`relative flex h-8 cursor-default select-none items-center gap-1.5 rounded-[10px] pr-1.5 text-[14px] leading-5 transition-colors ${
              on ? "text-select-text" : "text-fg hover:bg-fg/[0.04]"
            } ${node.disabled ? "opacity-50" : ""}`}
          >
            {on && (
              <motion.span
                layoutId={`${uid}selected`}
                layoutDependency={selected}
                aria-hidden
                className="absolute inset-0 rounded-[10px] bg-select-soft dark:bg-[color-mix(in_srgb,var(--select)_18%,transparent)]"
                transition={reduce ? { duration: 0 } : spring}
              />
            )}
            <span
              aria-hidden
              onClick={(e) => {
                // The chevron only opens and closes; the rest of the row also selects.
                if (!folder) return;
                e.stopPropagation();
                toggle(node);
              }}
              className={`relative flex size-5 shrink-0 items-center justify-center ${on ? "" : "text-fg-subtle"}`}
            >
              {folder && (
                <motion.span initial={false} animate={{ rotate: isOpen ? 90 : 0 }} transition={reduce ? { duration: 0 } : spring} className="flex">
                  <ChevronRight size={16} strokeWidth={1.5} />
                </motion.span>
              )}
            </span>
            {(node.icon || icons) && (
              <span aria-hidden className={`relative flex size-5 shrink-0 items-center justify-center [&_svg]:size-5 ${on ? "" : "text-fg-muted"}`}>
                {node.icon ?? (folder ? isOpen ? <FolderOpen strokeWidth={1.5} /> : <Folder strokeWidth={1.5} /> : <File strokeWidth={1.5} />)}
              </span>
            )}
            <span className={`relative min-w-0 flex-1 truncate pl-0.5 ${on ? "font-medium" : ""}`}>{node.label}</span>
            {node.badge && (
              <span
                className={`relative inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[12px] font-medium leading-4 tabular-nums ${TONES[node.badgeTone ?? "neutral"]}`}
              >
                {node.badgeLabel ? (
                  <>
                    <span aria-hidden>{node.badge}</span>
                    <span className="sr-only">, {node.badgeLabel}</span>
                  </>
                ) : (
                  <>
                    <span className="sr-only">, </span>
                    {node.badge}
                  </>
                )}
              </span>
            )}
          </div>
          {folder && (
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.ul
                  key="group"
                  role="group"
                  // Clips only while it opens or closes, so the pill and focus rings are never cut at rest.
                  initial={{ height: reduce ? "auto" : 0, opacity: 0, overflow: "hidden" }}
                  animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
                  exit={{ height: reduce ? "auto" : 0, opacity: 0, overflow: "hidden" }}
                  transition={reduce ? { duration: 0.12 } : { height: { duration: 0.26, ease }, opacity: { duration: 0.18 } }}
                  className="relative flex flex-col gap-px pt-px"
                >
                  {guides && <span aria-hidden className="pointer-events-none absolute bottom-1 top-0 w-px bg-border" style={{ left: x + 9.5 }} />}
                  {level(node.children ?? [], depth + 1)}
                </motion.ul>
              )}
            </AnimatePresence>
          )}
        </li>
      );
    });

  return (
    <ul role="tree" aria-label={ariaLabel} aria-labelledby={ariaLabelledby} onKeyDown={onKeyDown} className={`flex flex-col gap-px ${className}`}>
      {level(items, 0)}
    </ul>
  );
}
