import React from "react";
import type { MenuPosition } from "./selectTypes";
import { resolveMenuPosition } from "./selectUtilities";

/** Shared viewport placement for portaled select and action menus. */
export function useAnchoredMenuPosition({
  open,
  triggerRef,
  menuRef,
  setPosition,
  contentVersion,
  align = "start",
  fitContent = false,
}: {
  open: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  setPosition: React.Dispatch<React.SetStateAction<MenuPosition | null>>;
  contentVersion: string;
  align?: "start" | "end";
  fitContent?: boolean;
}): void {
  React.useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      if (!triggerRef.current || !menuRef.current) return;
      setPosition(
        resolveMenuPosition(triggerRef.current, menuRef.current, {
          align,
          minWidth: fitContent
            ? Math.min(menuRef.current.scrollWidth, 320)
            : undefined,
        }),
      );
    };
    update();
    const frame = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [
    align,
    contentVersion,
    fitContent,
    menuRef,
    open,
    setPosition,
    triggerRef,
  ]);
}
