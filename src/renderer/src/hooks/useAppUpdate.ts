import { useTranslation } from "react-i18next";
import { useSyncExternalStore } from "react";
import type { AppUpdateState } from "../../../shared/appUpdate";
import { readAppUpdate, subscribeAppUpdate } from "../lib/appUpdateStore";
export function useAppUpdate() {
  return useSyncExternalStore(subscribeAppUpdate, readAppUpdate, readAppUpdate);
}

/** Whether the status center has update news to show. */
export function hasAppUpdateNews(
  update: AppUpdateState | null,
): update is AppUpdateState {
  return Boolean(update && !["idle", "current"].includes(update.phase));
}

export function useAppUpdateNotice(fallback?: string): string | undefined {
  const update = useAppUpdate();
  const { t } = useTranslation("components");
  return hasAppUpdateNews(update)
    ? t(`settings.update.phases.${update.phase}`, { version: update.version })
    : fallback;
}
