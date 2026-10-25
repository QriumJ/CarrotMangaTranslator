import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  APP_RELEASE_OWNER,
  APP_RELEASE_REPO,
  APP_ISSUES_URL,
} from "../shared/appRelease";
import type { SubmitGitHubReport } from "../shared/githubReport";
import { SubmitGitHubReportSchema } from "../shared/githubReport";
import { GitHubReportHttp } from "./githubReportHttp";
import type { GitHubCredentials } from "./githubReportCredentials";
import {
  loadReportSnapshot,
  readReportPart,
  reportSnapshotDirectory,
} from "./errorReportSnapshot";
import { redactDiagnosticText } from "./errorReportRedaction";
import { writeDurableJsonFile } from "./libraryStore/libraryTransactionStorage";
import {
  uploadReportGist,
  clearDefiniteRejection,
  type GistFiles,
} from "./githubReportUpload";

const uploadStateSchema = z.object({
  id: z
    .string()
    .regex(/^[a-f0-9]+$/)
    .optional(),
  attempted: z.boolean().optional(),
});
const journalSchema = z.object({
  accountId: z.number(),
  request: SubmitGitHubReportSchema,
  uploads: z.array(uploadStateSchema),
  issue: z.object({
    number: z.number().int().positive().optional(),
    attempted: z.boolean().optional(),
  }),
});
type Journal = z.infer<typeof journalSchema>;
const issuePath = `/repos/${APP_RELEASE_OWNER}/${APP_RELEASE_REPO}/issues`;

export async function submitGitHubReport(
  dataRoot: string,
  request: SubmitGitHubReport,
  account: GitHubCredentials,
  http: GitHubReportHttp,
): Promise<string> {
  const snapshot = await loadReportSnapshot(dataRoot, request.reportId);
  const directory = reportSnapshotDirectory(dataRoot, snapshot.id);
  const journalPath = join(directory, "submission.json");
  const journal = await loadJournal(journalPath, request, account.id);
  const save = () => writeDurableJsonFile(journalPath, journal);
  if (journal.issue.number) return `${APP_ISSUES_URL}/${journal.issue.number}`;
  const parts = snapshot.parts.filter(
    (part) =>
      part.kind === "error" ||
      (part.kind === "system" ? request.includeSystem : request.includeLogs),
  );
  const links: string[] = [];
  // Gist's file-list limit is 300; small batches also avoid giant HTTP requests.
  for (let offset = 0; offset < parts.length; offset += 16) {
    const batch = parts.slice(offset, offset + 16);
    const files: GistFiles = {};
    for (const part of batch)
      files[part.name] = { content: await readReportPart(directory, part) };
    files["manifest.json"] = {
      content: JSON.stringify(
        {
          reportId: snapshot.id,
          capturedAt: snapshot.capturedAt,
          normalization:
            "UTF-8, LF line endings; sensitive values redacted; no log length or entry limit",
          missingLogs: snapshot.missingLogs,
          parts: batch,
        },
        null,
        2,
      ),
    };
    const index = offset / 16;
    const state = (journal.uploads[index] ??= {});
    const url = await uploadReportGist({
      http,
      account,
      files,
      state,
      save,
      marker: `Carrot report ${snapshot.id} part ${index + 1}`,
    });
    links.push(`- [Diagnostic files ${index + 1}](${url})`);
  }
  const body = [
    `<!-- carrot-report:${snapshot.id} -->`,
    "## Description",
    redactDiagnosticText(request.description).text ||
      "No description supplied.",
    "## Complete diagnostic report",
    ...links,
    `Captured: ${snapshot.capturedAt}`,
    `Files: ${parts.length}; UTF-8 bytes: ${parts.reduce((sum, part) => sum + part.bytes, 0)}.`,
    "Files are ordered by their numbered names. Each manifest records byte counts and SHA-256 hashes.",
    "Sensitive values were redacted. Every uploaded file was downloaded and verified before this issue was created.",
    request.includeLogs && snapshot.missingLogs.length
      ? `Log files absent at capture: ${snapshot.missingLogs.join(", ")}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  // Refuse an oversized index instead of silently dropping links or log parts.
  if (body.length > 60_000)
    throw new Error(
      "The diagnostic index exceeds GitHub's issue limit; all uploaded parts are saved locally.",
    );
  const number = await createIssue(http, account, journal, body, save);
  return `${APP_ISSUES_URL}/${number}`;
}

async function loadJournal(
  path: string,
  request: SubmitGitHubReport,
  accountId: number,
): Promise<Journal> {
  let journal: Journal;
  try {
    journal = journalSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { accountId, request, uploads: [], issue: {} };
    throw error;
  }
  if (journal.accountId !== accountId)
    throw new Error(
      "Resume this report with the GitHub account that started it.",
    );
  if (
    JSON.stringify(journal.request) !==
    JSON.stringify(SubmitGitHubReportSchema.parse(request))
  )
    throw new Error(
      "This report has already started uploading. Restore its original fields to retry.",
    );
  return journal;
}

async function createIssue(
  http: GitHubReportHttp,
  account: GitHubCredentials,
  journal: Journal,
  body: string,
  save: () => Promise<void>,
): Promise<number> {
  if (journal.issue.attempted) {
    const number = await recoverIssue(http, account, journal.request.reportId);
    if (!number)
      throw new Error(
        "GitHub issue submission outcome is unknown. Retry later to check; no duplicate issue was sent.",
      );
    journal.issue.number = number;
    await save();
    return number;
  }
  journal.issue.attempted = true;
  await save();
  try {
    const result = z.object({ number: z.number().int().positive() }).parse(
      await http.api(issuePath, account.accessToken, {
        title: redactDiagnosticText(journal.request.title).text,
        body,
      }),
    );
    journal.issue.number = result.number;
    await save();
    return result.number;
  } catch (error) {
    await clearDefiniteRejection(error, journal.issue, save);
    throw error;
  }
}

async function recoverIssue(
  http: GitHubReportHttp,
  account: GitHubCredentials,
  id: string,
): Promise<number | undefined> {
  for (let page = 1; ; page++) {
    const issues = z
      .array(
        z.object({
          number: z.number().int().positive(),
          body: z.string().nullable(),
        }),
      )
      .parse(
        await http.api(
          `${issuePath}?state=all&creator=${account.login}&per_page=100&page=${page}`,
          account.accessToken,
        ),
      );
    const found = issues.find((issue) =>
      issue.body?.includes(`<!-- carrot-report:${id} -->`),
    );
    if (found) return found.number;
    if (issues.length < 100) return undefined;
  }
}
