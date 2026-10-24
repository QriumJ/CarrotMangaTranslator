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
import { GitHubReportService } from "../githubReportService";
import type { ActiveJobStore } from "../jobs/activeJob";
import {
  type RegisteredRendererIpcContext,
  PRODUCTION_TRUSTED_IPC_RUNTIME,
  registeredRendererHandleContract,
  type TrustedIpcRuntime,
} from "./trustedIpc";

const CLIPBOARD_FALLBACK_BODY = [
  "The report below is shortened to fit the browser URL. The expanded report was copied to the clipboard.",
  "",
  "You can paste the expanded report before submitting. The app logs retain more diagnostic detail.",
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
  const github = new GitHubReportService(context.appPaths.dataRoot);
  registeredRendererHandleContract(
    context,
    errorReportIpcContracts.githubReportAccount,
    (_event, action) => github.account(action),
    runtime,
  );
  registeredRendererHandleContract(
    context,
    errorReportIpcContracts.submitGitHubReport,
    (_event, request) => github.submit(request),
    runtime,
  );

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
  const sections = body
    .split(/(?=^## )/m)
    .filter((section) => section.trim())
    .map((section) =>
      prioritizeErrorMessage(section).replace(/```(?:text)?/g, ""),
    );
  const overhead = buildGitHubIssueUrl(
    title,
    CLIPBOARD_FALLBACK_BODY + "\n\n" + sections.map(() => "").join("\n\n"),
  ).length;
  if (overhead >= ERROR_REPORT_GITHUB_URL_MAX_LENGTH) {
    const prefix = CLIPBOARD_FALLBACK_BODY + "\n\n";
    return (
      prefix +
      compactSection(
        body,
        Math.max(
          0,
          ERROR_REPORT_GITHUB_URL_MAX_LENGTH -
            buildGitHubIssueUrl(title, prefix).length,
        ),
      )
    );
  }
  let remaining = Math.max(
    0,
    ERROR_REPORT_GITHUB_URL_MAX_LENGTH - overhead - 16,
  );
  const sizes = sections.map(encodedLength);
  const budgets = sections.map(() => 0);
  // Redistribute unused space from small sections rather than wasting a fixed
  // quota or dropping everything after the fourth section / 24th log record.
  while (remaining > 0) {
    const pending = sizes.flatMap((size, index) =>
      budgets[index] < size ? [index] : [],
    );
    if (!pending.length) break;
    const share = Math.max(1, Math.floor(remaining / pending.length));
    for (const index of pending) {
      const added = Math.min(remaining, share, sizes[index] - budgets[index]);
      budgets[index] += added;
      remaining -= added;
    }
  }
  return (
    CLIPBOARD_FALLBACK_BODY +
    "\n\n" +
    sections
      .map((section, index) => compactSection(section, budgets[index]))
      .join("\n\n")
  );
}

function encodedLength(text: string): number {
  return new URLSearchParams({ body: text }).toString().length - 5;
}

function compactSection(value: string, budget: number): string {
  if (encodedLength(value) <= budget) return value;
  const marker = "\n[... middle omitted ...]\n";
  if (encodedLength(marker) > budget) return "";
  const points = Array.from(value);
  const candidate = (count: number) => {
    const head = Math.ceil(count / 2),
      tail = Math.floor(count / 2);
    return (
      points.slice(0, head).join("") +
      marker +
      points.slice(points.length - tail).join("")
    );
  };
  let low = 0,
    high = points.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (encodedLength(candidate(middle)) <= budget) low = middle;
    else high = middle - 1;
  }
  return candidate(low);
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
