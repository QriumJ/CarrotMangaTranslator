import React from "react";
import styles from "./ResizeHandle.module.css";

const KEYBOARD_STEP_PX = 16;
const KEYBOARD_LARGE_STEP_PX = 64;

export type ResizeHandleProps = {
  /**
   * Separator orientation (WAI-ARIA): `vertical` sits between side-by-side
   * panes and drags horizontally; `horizontal` sits between stacked panes.
   */
  orientation: "vertical" | "horizontal";
  label: string;
  title?: string;
  className?: string;
  valueNow?: number;
  valueMin?: number;
  valueMax?: number;
  valueText?: string;
  /** Snapshots the sizes the following offsets are measured from. */
  onResizeStart: (handle: HTMLElement) => void;
  /** Pointer or keyboard offset from the start, in CSS px along the drag axis. */
  onResize: (offsetPx: number) => void;
  onResizeEnd: () => void;
  /** Double-click restores the default size. */
  onReset: () => void;
};

/**
 * A focusable pane splitter: pointer drag, arrow keys (Shift for larger
 * steps) and double-click to reset. Callers own sizes and clamping.
 */
export function ResizeHandle({
  orientation,
  label,
  title,
  className,
  valueNow,
  valueMin,
  valueMax,
  valueText,
  onResizeStart,
  onResize,
  onResizeEnd,
  onReset,
}: ResizeHandleProps): React.JSX.Element {
  const dragRef = React.useRef<{ pointerId: number; start: number } | null>(
    null,
  );
  const [dragging, setDragging] = React.useState(false);
  const axis = (event: { clientX: number; clientY: number }): number =>
    orientation === "vertical" ? event.clientX : event.clientY;

  const finish = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    onResizeEnd();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const [back, forward] =
      orientation === "vertical"
        ? ["ArrowLeft", "ArrowRight"]
        : ["ArrowUp", "ArrowDown"];
    if (event.key !== back && event.key !== forward) return;
    event.preventDefault();
    const step = event.shiftKey ? KEYBOARD_LARGE_STEP_PX : KEYBOARD_STEP_PX;
    onResizeStart(event.currentTarget);
    onResize(event.key === forward ? step : -step);
    onResizeEnd();
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuenow={valueNow}
      aria-valuemin={valueMin}
      aria-valuemax={valueMax}
      aria-valuetext={valueText}
      title={title ?? label}
      data-dragging={dragging || undefined}
      className={[styles.handle, styles[orientation], className ?? ""]
        .filter(Boolean)
        .join(" ")}
      onPointerDown={(event) => {
        if (event.button !== 0 || dragRef.current) return;
        // Keeps the drag from selecting sidebar text.
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture?.(event.pointerId);
        dragRef.current = { pointerId: event.pointerId, start: axis(event) };
        setDragging(true);
        onResizeStart(event.currentTarget);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        onResize(axis(event) - drag.start);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
    />
  );
}
