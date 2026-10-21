import { useSyncExternalStore } from "react";
import type { PanelTextSelection } from "../../../shared/panelBridgeTypes";

let current: PanelTextSelection | null = null;
const listeners = new Set<() => void>();
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function publishTextSelectionPreview(value: PanelTextSelection): void {
  if (value.start === value.end && current?.blockId !== value.blockId) return;
  const next = value.start === value.end ? null : value;
  if (JSON.stringify(current) === JSON.stringify(next)) return;
  current = next;
  listeners.forEach((listener) => listener());
}
export function useTextSelectionPreview(
  blockId: string,
  translatedText: string,
  selected: boolean,
): PanelTextSelection | null {
  return useSyncExternalStore(subscribe, () =>
    selected &&
    current?.blockId === blockId &&
    current.translatedText === translatedText
      ? current
      : null,
  );
}
