import type { AppUpdateState } from "../../../shared/appUpdate";
import { appUpdateGateway } from "../api/appUpdateGateway";

let state: AppUpdateState | null = null;
const listeners = new Set<() => void>();
export const readAppUpdate = () => state;
export function receiveAppUpdate(next: AppUpdateState): void {
  if (state && state.revision > next.revision) return;
  state = next;
  for (const listener of listeners) listener();
}
export function subscribeAppUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export async function refreshAppUpdate(): Promise<void> {
  receiveAppUpdate(await appUpdateGateway.getAppUpdateState());
}
