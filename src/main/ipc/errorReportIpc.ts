import { app, clipboard, shell } from "electron";
import {
  APP_MAC_ALPHA_ISSUE_URL,
  APP_NEW_ISSUE_URL,
} from "../../shared/appRelease";
import { errorReportIpcContracts } from "../../shared/ipcContracts";
import {
  ERROR_REPORT_GITHUB_URL_MAX_LENGTH,
  type ErrorReportContext,
  type ErrorReportDraft,
  type OpenErrorReportIssueResult,
} from "../../shared/errorReportTypes";
import type { AppPaths } from "../appPaths";
import { prepareErrorReportDraft } from "../errorReport";
import type { ActiveJobStore } from "../jobs/activeJob";
import {
  type RegisteredRendererIpcContext,
  PRODUCTION_TRUSTED_IPC_RUNTIME,
  registeredRendererHandleContract,
  type TrustedIpcRuntime,
} from "./trustedIpc";

const CLIPBOARD_FALLBACK_BODY = [
  "A compact diagnostic report is included below. Full details were copied to the clipboard.",
  "",
  "You can replace this summary with the copied report before submitting this public issue.",
].join("\n");

export type ErrorReportIpcContext = RegisteredRendererIpcContext & {
  appPaths: AppPaths;
  jobs?: ActiveJobStore;
};

export type ErrorReportIpcRuntime = TrustedIpcRuntime & {
  prepareDraft: (
    context: ErrorReportContext,
    appPaths: AppPaths,
    jobs?: ReturnType<ActiveJobStore["reportDiagnostics"]["snapshot"]>,
  ) => Promise<ErrorReportDraft>;
  writeClipboard: (text: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  relaunch: () => void;
  quit: () => void;
  schedule: (callback: () => void, delayMs: number) => void;
};

const productionErrorReportIpcRuntime: ErrorReportIpcRuntime = {
  prepareDraft: prepareErrorReportDraft,
  writeClipboard: (text) => clipboard.writeText(text),
  openExternal: (url) => shell.openExternal(url),
  relaunch: () => app.relaunch(),
  quit: () => app.quit(),
  schedule: (callback, delayMs) => {
    setTimeout(callback, delayMs);
  },
  ...PRODUCTION_TRUSTED_IPC_RUNTIME,
};

export function registerErrorReportIpc(
  context: ErrorReportIpcContext,
  runtime: ErrorReportIpcRuntime = productionErrorReportIpcRuntime,
): void {
  let restartScheduled = false;

  registeredRendererHandleContract(
    context,
    errorReportIpcContracts.prepareErrorReport,
    (_event, reportContext) =>
      runtime.prepareDraft(
        reportContext,
        context.appPaths,
        context.jobs?.reportDiagnostics.snapshot(),
      ),
    runtime,
  );

  registeredRendererHandleContract(
    context,
    errorReportIpcContracts.copyErrorReport,
    async (_event, body) => {
      await runtime.writeClipboard(body);
      return { copied: true };
    },
    runtime,
  );

  registeredRendererHandleContract(
    context,
    errorReportIpcContracts.openErrorReportIssue,
    async (_event, request) => openErrorReportIssue(request, runtime),
    runtime,
  );

  registeredRendererHandleContract(
    context,
    errorReportIpcContracts.restartApp,
    () => {
      if (!restartScheduled) {
        restartScheduled = true;
        runtime.relaunch();
        runtime.schedule(() => runtime.quit(), 100);
      }
      return { restarting: true };
    },
    runtime,
  );
}

export async function openErrorReportIssue(
  request: { title: string; body: string },
  runtime: Pick<
    ErrorReportIpcRuntime,
    "openExternal" | "writeClipboard"
  > = productionErrorReportIpcRuntime,
): Promise<OpenErrorReportIssueResult> {
  const prefilledUrl = buildGitHubIssueUrl(request.title, request.body);
  if (prefilledUrl.length <= ERROR_REPORT_GITHUB_URL_MAX_LENGTH) {
    await runtime.openExternal(prefilledUrl);
    return { opened: true, mode: "prefilled" };
  }

  await runtime.writeClipboard(request.body);
  const fallbackUrl = buildGitHubIssueUrl(
    request.title,
    compactIssueBody(request.title, request.body),
  );
  await runtime.openExternal(fallbackUrl);
  return { opened: true, mode: "clipboard" };
}

function compactIssueBody(title: string, body: string): string {
  const allSections = body
    .split(/(?=^## )/m)
    .filter((section) => section.trim());
  const diagnosticSections = allSections.filter((section) =>
    /^## (?:Error|System information|Recent )/.test(section),
  );
  const sections = [
    ...diagnosticSections,
    ...allSections.filter((section) => !diagnosticSections.includes(section)),
  ].slice(0, 4);
  const overhead = buildGitHubIssueUrl(
    title,
    `${CLIPBOARD_FALLBACK_BODY}\n\n`,
  ).length;
  const budget = Math.max(
    0,
    ERROR_REPORT_GITHUB_URL_MAX_LENGTH - overhead - 32,
  );
  const quota = Math.floor(budget / sections.length);
  const compact = sections.map((section) => {
    // Keep the latest diagnostics as well as the section heading.
    const lines = prioritizeErrorMessage(section).split("\n");
    const candidates =
      /logs|warnings and errors/i.test(lines[0]) && lines.length > 4
        ? [lines[0], ...lines.slice(-24)]
        : lines;
    const value = candidates.join("\n").replace(/```(?:text)?/g, "");
    let result = "";
    for (const point of value) {
      const next = result + point;
      if (
        new URLSearchParams({ body: `${next}\n[section shortened]` }).toString()
          .length > quota
      )
        break;
      result = next;
    }
    return result.length < value.length
      ? `${result}\n[section shortened]`
      : result;
  });
  return `${CLIPBOARD_FALLBACK_BODY}\n\n${compact.join("\n\n")}`;
}

function prioritizeErrorMessage(section: string): string {
  if (!section.startsWith("## Error\n")) return section;
  const parts = section.split(/(?=^### )/m);
  const message = parts.findIndex((part) => part.startsWith("### Message\n"));
  if (message < 1) return section;
  const [cause] = parts.splice(message, 1);
  parts.splice(1, 0, cause);
  return parts.join("");
}

export function buildGitHubIssueUrl(title: string, body: string): string {
  const url = new URL(
    title.trimStart().startsWith("[macOS Alpha]")
      ? APP_MAC_ALPHA_ISSUE_URL
      : APP_NEW_ISSUE_URL,
  );
  url.searchParams.set("title", title);
  url.searchParams.set("body", body);
  return url.toString();
}
