import React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { normalizeHexColor } from "../../lib/cssColor";
import { ColorPickerPanel } from "./ColorPickerPanel";
import { usePopupController } from "./usePopupController";
import styles from "./ColorPicker.module.css";

const PANEL_WIDTH_PX = 248;
const PANEL_GAP_PX = 6;
const VIEWPORT_MARGIN_PX = 8;

type PanelPosition = { left: number; top: number };

export type ColorPickerTriggerProps = {
  /** Names the edited color, e.g. "글자색". Used for the trigger and dialog. */
  label: string;
  value: string;
  disabled?: boolean;
  mixed?: boolean;
  className?: string;
  /** Custom trigger face; defaults to a round swatch of `value`. */
  children?: React.ReactNode;
  onChange: (value: string) => void;
};

/**
 * The single in-app color control. Replaces the OS color dialog with an
 * anchored popover holding the picker, an eyedropper and the shared palette,
 * so every color field in the app behaves the same way.
 */
export function ColorPickerTrigger({
  label,
  value,
  disabled = false,
  mixed = false,
  className,
  children,
  onChange,
}: ColorPickerTriggerProps): React.JSX.Element {
  const { t } = useTranslation("components");
  const [open, setOpen] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const panelId = React.useId();
  const color = normalizeHexColor(value) ?? "#000000";
  const isInsidePopup = React.useCallback(
    (target: Node) => Boolean(panelRef.current?.contains(target)),
    [],
  );
  const { close, rootRef, toggle, triggerRef } = usePopupController({
    disabled,
    isInsidePopup,
    open,
    onOpenChange: setOpen,
  });
  const position = useAnchoredPanelPosition(open, triggerRef, panelRef);

  return (
    <div ref={rootRef} className={styles.anchor}>
      <button
        ref={triggerRef}
        type="button"
        className={[styles.trigger, className].filter(Boolean).join(" ")}
        aria-label={t("colorPicker.open", { label })}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        data-mixed={mixed ? "" : undefined}
        disabled={disabled}
        onClick={toggle}
      >
        {children ?? (
          <span
            className={styles.triggerSwatch}
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
        )}
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-label={label}
              className={styles.panel}
              style={panelPositionStyle(position)}
              data-ui-color-picker=""
            >
              <ColorPickerPanel
                label={label}
                value={color}
                onChange={onChange}
                onDone={() => close(true)}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function useAnchoredPanelPosition(
  open: boolean,
  triggerRef: React.RefObject<HTMLButtonElement | null>,
  panelRef: React.RefObject<HTMLDivElement | null>,
): PanelPosition | null {
  const [position, setPosition] = React.useState<PanelPosition | null>(null);
  React.useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const update = (): void => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (trigger && panel) setPosition(resolvePanelPosition(trigger, panel));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, panelRef, triggerRef]);
  return position;
}

function resolvePanelPosition(
  trigger: HTMLElement,
  panel: HTMLElement,
): PanelPosition {
  const rect = trigger.getBoundingClientRect();
  const height = panel.offsetHeight;
  const maxLeft = window.innerWidth - PANEL_WIDTH_PX - VIEWPORT_MARGIN_PX;
  const left = Math.max(VIEWPORT_MARGIN_PX, Math.min(rect.left, maxLeft));
  const below = rect.bottom + PANEL_GAP_PX;
  const fitsBelow =
    below + height <= window.innerHeight - VIEWPORT_MARGIN_PX ||
    rect.top - PANEL_GAP_PX - height < VIEWPORT_MARGIN_PX;
  const top = fitsBelow ? below : rect.top - PANEL_GAP_PX - height;
  const maxTop = window.innerHeight - height - VIEWPORT_MARGIN_PX;
  return { left, top: Math.max(VIEWPORT_MARGIN_PX, Math.min(top, maxTop)) };
}

function panelPositionStyle(
  position: PanelPosition | null,
): React.CSSProperties {
  // The first frame is measured invisibly so the panel never flashes at 0,0.
  if (!position) return { visibility: "hidden" };
  return { left: position.left, top: position.top };
}
