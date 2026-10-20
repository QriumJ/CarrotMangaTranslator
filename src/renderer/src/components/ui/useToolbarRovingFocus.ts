import React from "react";
import { resolveRovingFocusIndex } from "./useRovingFocus";

/** One tab stop per toolbar. Nested menus retain their own keyboard handling. */
export function useToolbarRovingFocus(
  rootRef: React.RefObject<HTMLDivElement | null>,
) {
  const active = React.useRef<HTMLButtonElement | null>(null);
  const buttons = React.useCallback(
    () =>
      Array.from(
        rootRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? [],
      ).filter(
        (button) =>
          button.closest('[role="toolbar"]') === rootRef.current &&
          !button.closest('[role="menu"], [role="listbox"]'),
      ),
    [rootRef],
  );
  const sync = React.useCallback(() => {
    const items = buttons();
    const current =
      active.current !== null && items.includes(active.current)
        ? active.current
        : (items.find(
            (button) => button.getAttribute("aria-pressed") === "true",
          ) ?? items[0]);
    active.current = current ?? null;
    for (const button of items) button.tabIndex = button === current ? 0 : -1;
  }, [buttons]);
  React.useLayoutEffect(() => {
    sync();
    const root = rootRef.current;
    if (!root) return;
    const observer = new MutationObserver(sync);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["disabled"],
    });
    return () => observer.disconnect();
  }, [rootRef, sync]);
  return {
    "aria-orientation": "vertical" as const,
    onFocusCapture: (event: React.FocusEvent<HTMLDivElement>) => {
      const target = event.target;
      if (target instanceof HTMLButtonElement && buttons().includes(target)) {
        active.current = target;
        sync();
      }
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        event.defaultPrevented ||
        !(event.target instanceof HTMLButtonElement) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      // Horizontal arrows belong to flyouts and editable controls.
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      const items = buttons();
      const index = items.indexOf(event.target);
      if (index < 0) return;
      const next = resolveRovingFocusIndex(event.key, index, items.length);
      if (next === null) return;
      event.preventDefault();
      items[next]?.focus();
    },
  };
}
