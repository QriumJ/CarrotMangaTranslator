import type { MangaApi } from "../../../shared/mangaApi";
import { normalizeErrorReportContext } from "../../../shared/errorReportContext";
import { appGateway as mangaGateway } from "../api/appGateway";

type ErrorReportGateway = Pick<
  MangaApi,
  | "copyErrorReport"
  | "githubReportAccount"
  | "submitGitHubReport"
  | "onErrorIncident"
  | "openErrorReportIssue"
  | "openLogFolder"
  | "prepareErrorReport"
  | "restartApp"
  | "writeLog"
>;

export const errorReportGateway: ErrorReportGateway = {
  githubReportAccount: (action) => mangaGateway.githubReportAccount(action),
  submitGitHubReport: (request) => mangaGateway.submitGitHubReport(request),
  copyErrorReport: (body) => mangaGateway.copyErrorReport(body),
  onErrorIncident: (callback) => mangaGateway.onErrorIncident(callback),
  openErrorReportIssue: (request) => mangaGateway.openErrorReportIssue(request),
  openLogFolder: () => mangaGateway.openLogFolder(),
  prepareErrorReport: (context) =>
    mangaGateway.prepareErrorReport(normalizeErrorReportContext(context)),
  restartApp: () => mangaGateway.restartApp(),
  writeLog: async (level, message, detail) =>
    mangaGateway.writeLog(level, message, rendererLogDetail(detail)),
};

// Electron's structured clone does not retain arbitrary Error properties.
// Convert them before crossing IPC; the main logger owns secret redaction.
function rendererLogDetail(value: unknown): unknown {
  if (value === undefined) return undefined;
  const seen = new WeakSet<object>();
  const serialized = JSON.stringify(value, (_key, child: unknown) => {
    if (typeof child === "bigint") return String(child);
    if (!child || typeof child !== "object") return child;
    if (seen.has(child)) return "[Circular]";
    seen.add(child);
    if (Array.isArray(child)) return child;
    return {
      ...(child instanceof Error ? { name: child.name } : {}),
      ...Object.fromEntries(
        Object.entries(Object.getOwnPropertyDescriptors(child))
          .filter(
            ([, descriptor]) => child instanceof Error || descriptor.enumerable,
          )
          .map(([key, descriptor]) => [
            key,
            "value" in descriptor
              ? descriptor.value
              : "[Accessor not evaluated]",
          ]),
      ),
    };
  });
  return serialized === undefined ? String(value) : JSON.parse(serialized);
}
