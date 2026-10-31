type LinkedWorkspaceSaveNotifier = (
  chapterId: string,
  pageIds: readonly string[],
  options?: { organizationChanged?: boolean },
) => Promise<void>;

let notifier: LinkedWorkspaceSaveNotifier | null = null;
let reportError: ((message: string, detail?: unknown) => void) | null = null;
type OrganizationTarget = { workId: string; chapterId?: string };
let organizationNotifier:
  ((target: OrganizationTarget) => Promise<unknown>) | null = null;

export function installLinkedWorkspaceSaveNotifier(
  nextNotifier: LinkedWorkspaceSaveNotifier,
  nextReportError: (message: string, detail?: unknown) => void,
  nextOrganizationNotifier?: (target: OrganizationTarget) => Promise<unknown>,
): () => void {
  notifier = nextNotifier;
  reportError = nextReportError;
  organizationNotifier = nextOrganizationNotifier ?? null;
  return () => {
    if (notifier === nextNotifier) notifier = null;
    if (reportError === nextReportError) reportError = null;
    if (organizationNotifier === nextOrganizationNotifier)
      organizationNotifier = null;
  };
}

export function notifyLinkedWorkspaceTitleChanged(
  target: OrganizationTarget,
): void {
  const callback = organizationNotifier;
  if (!callback) return;
  // The organization transaction still holds the library write boundary here.
  // Run after release; all desktop/MCP rename and Undo paths use this commit.
  setTimeout(() => {
    if (organizationNotifier !== callback) return;
    void callback(target).catch((error: unknown) => {
      reportError?.(
        "Failed to organize linked result folders after rename",
        error,
      );
    });
  }, 0);
}

export function notifyLinkedWorkspacePagesSaved(
  chapterId: string,
  pageIds: readonly string[],
  options?: { organizationChanged?: boolean },
): void {
  if (!notifier || pageIds.length === 0) return;
  void notifier(chapterId, pageIds, options).catch((error: unknown) => {
    reportError?.("Failed to queue linked workspace pages after save", error);
  });
}
