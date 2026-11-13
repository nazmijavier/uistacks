"use client";

import {
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { AnimatePresence, Reorder, useDragControls, useReducedMotion } from "motion/react";
import { GripVertical, X } from "lucide-react";

const noSubscribe = () => () => {};
/** Reduced motion, read only after hydration so the server and the first client render match. */
function useReduce() {
  const prefers = useReducedMotion();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated && Boolean(prefers);
}

export interface SortableListItem {
  id: string;
  label: ReactNode;
  /** A second, muted line under the label. */
  description?: ReactNode;
  /** An icon, avatar or thumbnail before the label. */
  leading?: ReactNode;
  /** A count, badge or value at the end of the row. */
  trailing?: ReactNode;
  /** Plain text for announcements when `label` is not a string. */
  textValue?: string;
}

/** Drive the list from code, the same way the keyboard does (lift, move, drop). Focus is left where it is. */
export interface SortableListHandle {
  lift: (id: string) => void;
  /** Moves the lifted row by this many places (−1 is up). */
  move: (by: number) => void;
  drop: () => void;
  /** Puts the lifted row back where it started. */
  cancel: () => void;
}

export type SortableListSize = "sm" | "md";

export interface SortableListProps {
  items?: SortableListItem[];
  defaultItems?: SortableListItem[];
  /** Called with the new order after each move, and after a remove. */
  onItemsChange?: (items: SortableListItem[]) => void;
  /** Shows a round remove button on each row. */
  removable?: boolean;
  /** Called with the removed row, after `onItemsChange`. */
  onRemove?: (item: SortableListItem) => void;
  /** Shows each row's position (1, 2, 3…) before it. */
  numbered?: boolean;
  size?: SortableListSize;
  disabled?: boolean;
  /** Names the list for screen readers, e.g. "Pipeline stages". */
  "aria-label"?: string;
  ref?: Ref<SortableListHandle>;
  className?: string;
}

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;
const ring = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--select)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

const SIZES: Record<SortableListSize, { row: string; text: string; gap: string }> = {
  sm: { row: "min-h-11 gap-2 py-1.5 pl-1.5 pr-2", text: "text-[13px] leading-5", gap: "gap-1.5" },
  md: { row: "min-h-[52px] gap-2.5 py-2 pl-2 pr-2.5", text: "text-sm leading-5", gap: "gap-2" },
};

const textOf = (item: SortableListItem) => item.textValue ?? (typeof item.label === "string" ? item.label : item.id);

interface RowProps {
  item: SortableListItem;
  index: number;
  count: number;
  lifted: boolean;
  numbered: boolean;
  removable: boolean;
  disabled: boolean;
  size: SortableListSize;
  reduce: boolean;
  hintId: string;
  handleRef: (el: HTMLButtonElement | null) => void;
  onHandleKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  onHandleBlur: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onRemove: () => void;
  ref?: Ref<HTMLLIElement>;
}

/** One row. Its own drag controls let only the grip start a pointer drag, so the rest of the row stays clickable. */
function Row({
  item,
  index,
  count,
  lifted,
  numbered,
  removable,
  disabled,
  size,
  reduce,
  hintId,
  handleRef,
  onHandleKeyDown,
  onHandleBlur,
  onDragStart,
  onDragEnd,
  onRemove,
  ref,
}: RowProps) {
  const controls = useDragControls();
  const s = SIZES[size];
  const label = textOf(item);
  return (
    <Reorder.Item
      ref={ref}
      as="li"
      value={item.id}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: lifted && !reduce ? 1.01 : 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, transition: { duration: 0.16 } }}
      whileDrag={reduce ? undefined : { scale: 1.01 }}
      transition={reduce ? { duration: 0 } : spring}
      style={{ position: "relative", zIndex: lifted ? 2 : 0 }}
      className={`flex items-center rounded-[14px] bg-surface transition-shadow duration-150 ${s.row} ${
        lifted ? "shadow-[var(--shadow-overlay)]" : "shadow-[var(--shadow-control)]"
      }`}
    >
      <button
        ref={handleRef}
        type="button"
        disabled={disabled}
        aria-label={`Reorder ${label}, position ${index + 1} of ${count}`}
        aria-describedby={hintId}
        aria-pressed={lifted}
        onKeyDown={onHandleKeyDown}
        onBlur={onHandleBlur}
        onPointerDown={(e) => {
          if (disabled || e.button !== 0) return;
          e.preventDefault();
          controls.start(e);
        }}
        className={`grid size-8 shrink-0 touch-none place-items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${ring} ${
          lifted ? "cursor-grabbing bg-muted text-fg" : "cursor-grab text-fg-subtle hover:bg-muted hover:text-fg"
        }`}
      >
        <GripVertical size={size === "sm" ? 16 : 20} strokeWidth={1.5} aria-hidden />
      </button>
      {numbered && (
        <span aria-hidden className={`w-4 shrink-0 text-center tabular-nums text-fg-subtle ${s.text}`}>
          {index + 1}
        </span>
      )}
      {item.leading && <span className="flex shrink-0 items-center text-fg-muted">{item.leading}</span>}
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-medium text-fg ${s.text}`}>{item.label}</span>
        {item.description && <span className="block truncate text-[12px] leading-4 text-fg-muted">{item.description}</span>}
      </span>
      {item.trailing && <span className="flex shrink-0 items-center text-[13px] leading-5 text-fg-muted tabular-nums">{item.trailing}</span>}
      {removable && (
        <button
          type="button"
          disabled={disabled}
          aria-label={`Remove ${label}`}
          onClick={onRemove}
          className={`-mr-1 grid size-8 shrink-0 place-items-center rounded-full text-fg-subtle transition-colors hover:bg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 ${ring}`}
        >
          <X size={16} strokeWidth={1.5} aria-hidden />
        </button>
      )}
    </Reorder.Item>
  );
}

export function SortableList({
  items,
  defaultItems = [],
  onItemsChange,
  removable = false,
  onRemove,
  numbered = false,
  size = "md",
  disabled = false,
  "aria-label": ariaLabel = "Sortable list",
  ref,
  className = "",
}: SortableListProps) {
  const uid = useId();
  const hintId = `${uid}-hint`;
  const reduce = useReduce();
  const [own, setOwn] = useState(defaultItems);
  const list = items ?? own;

  // The keyboard-lifted row and the order it started from (Escape puts that back).
  const [lifted, setLifted] = useState<{ id: string; from: SortableListItem[] } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const handles = useRef(new Map<string, HTMLButtonElement>());
  // A moved row can lose focus while React reorders the DOM; this brings it back without dropping.
  const refocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    const id = refocus.current;
    if (!id) return;
    refocus.current = null;
    const el = handles.current.get(id);
    if (el && document.activeElement !== el) el.focus();
  });

  const commit = (next: SortableListItem[]) => {
    if (items === undefined) setOwn(next);
    onItemsChange?.(next);
  };

  const where = (id: string, order = list) => {
    const i = order.findIndex((x) => x.id === id);
    return `position ${i + 1} of ${order.length}`;
  };

  const lift = (id: string) => {
    const item = list.find((x) => x.id === id);
    if (!item || disabled) return;
    setLifted({ id, from: list });
    setAnnouncement(`Lifted ${textOf(item)}, ${where(id)}. Arrow keys move it, Space drops it, Escape cancels.`);
  };

  const moveTo = (to: number, keepFocus: boolean) => {
    if (!lifted) return;
    const from = list.findIndex((x) => x.id === lifted.id);
    const target = Math.max(0, Math.min(list.length - 1, to));
    if (from < 0 || target === from) return;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    if (keepFocus) refocus.current = lifted.id;
    commit(next);
    setAnnouncement(`${textOf(moved)}, ${where(moved.id, next)}.`);
  };

  const drop = () => {
    if (!lifted) return;
    const item = list.find((x) => x.id === lifted.id);
    setLifted(null);
    if (item) setAnnouncement(`Dropped ${textOf(item)} at ${where(item.id)}.`);
  };

  const cancel = () => {
    if (!lifted) return;
    const item = list.find((x) => x.id === lifted.id);
    const back = lifted.from.filter((x) => list.some((y) => y.id === x.id));
    setLifted(null);
    commit(back);
    if (item) setAnnouncement(`Cancelled. ${textOf(item)} is back at ${where(item.id, back)}.`);
  };

  useImperativeHandle(ref, () => ({
    lift,
    move: (by: number) => {
      const i = lifted ? list.findIndex((x) => x.id === lifted.id) : -1;
      if (i >= 0) moveTo(i + by, false);
    },
    drop,
    cancel,
  }));

  const remove = (item: SortableListItem) => {
    const i = list.findIndex((x) => x.id === item.id);
    const next = list.filter((x) => x.id !== item.id);
    if (lifted?.id === item.id) setLifted(null);
    commit(next);
    onRemove?.(item);
    setAnnouncement(`Removed ${textOf(item)}. ${next.length} left.`);
    // Focus moves to the row that took its place, else the one before.
    const neighbour = next[Math.min(i, next.length - 1)];
    if (neighbour) requestAnimationFrame(() => handles.current.get(neighbour.id)?.focus());
  };

  const onHandleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, item: SortableListItem, index: number) => {
    const isLifted = lifted?.id === item.id;
    const k = e.key;
    if (k === " " || k === "Enter") {
      e.preventDefault();
      if (isLifted) drop();
      else {
        if (lifted) drop();
        lift(item.id);
      }
    } else if (k === "Escape" && isLifted) {
      e.preventDefault();
      refocus.current = item.id;
      cancel();
    } else if (k === "ArrowUp" || k === "ArrowDown" || k === "Home" || k === "End") {
      e.preventDefault();
      const to = k === "Home" ? 0 : k === "End" ? list.length - 1 : index + (k === "ArrowUp" ? -1 : 1);
      if (isLifted) moveTo(to, true);
      else {
        // Not lifted: the arrows walk between the grips.
        const next = list[Math.max(0, Math.min(list.length - 1, to))];
        if (next) handles.current.get(next.id)?.focus();
      }
    }
  };

  return (
    <div className={className}>
      <Reorder.Group
        as="ul"
        axis="y"
        values={list.map((x) => x.id)}
        onReorder={(ids: string[]) => {
          const byId = new Map(list.map((x) => [x.id, x]));
          commit(ids.map((id) => byId.get(id)).filter((x): x is SortableListItem => Boolean(x)));
        }}
        aria-label={ariaLabel}
        className={`flex flex-col ${SIZES[size].gap}`}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {list.map((item, index) => (
            <Row
              key={item.id}
              item={item}
              index={index}
              count={list.length}
              lifted={lifted?.id === item.id || dragging === item.id}
              numbered={numbered}
              removable={removable}
              disabled={disabled}
              size={size}
              reduce={reduce}
              hintId={hintId}
              handleRef={(el) => {
                if (el) handles.current.set(item.id, el);
                else handles.current.delete(item.id);
              }}
              onHandleKeyDown={(e) => onHandleKeyDown(e, item, index)}
              onHandleBlur={() => {
                // Tabbing away drops the row where it is; a blur caused by the reorder itself does not.
                if (lifted?.id === item.id && refocus.current !== item.id) drop();
              }}
              onDragStart={() => {
                if (lifted) setLifted(null);
                setDragging(item.id);
                setAnnouncement(`Dragging ${textOf(item)}.`);
              }}
              onDragEnd={() => {
                setDragging(null);
                setAnnouncement(`Dropped ${textOf(item)} at ${where(item.id)}.`);
              }}
              onRemove={() => remove(item)}
            />
          ))}
        </AnimatePresence>
      </Reorder.Group>
      <span id={hintId} className="sr-only">
        Press Space to lift. Arrow keys move the row, Space drops it, Escape cancels.
      </span>
      <span aria-live="assertive" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
