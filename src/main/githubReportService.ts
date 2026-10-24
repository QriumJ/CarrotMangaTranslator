import { shell } from "electron";
import type {
  GitHubReportAuthAction,
  GitHubReportResult,
  SubmitGitHubReport,
} from "../shared/githubReport";
import { GitHubReportAuth } from "./githubReportAuth";
import { GitHubReportCredentials } from "./githubReportCredentials";
import { GitHubReportHttp } from "./githubReportHttp";
import { submitGitHubReport } from "./githubReportSubmission";

// Public identifier, never a client secret. Set once when registering the app.
const GITHUB_REPORT_CLIENT_ID = "Ov23liJoT9AnmQO7bvej";

export class GitHubReportService {
  private readonly auth: GitHubReportAuth;
  private readonly http = new GitHubReportHttp();
  private submitting?: Promise<GitHubReportResult>;
  constructor(
    private readonly dataRoot: string,
    clientId = GITHUB_REPORT_CLIENT_ID,
  ) {
    this.auth = new GitHubReportAuth(
      clientId || process.env.CARROT_GITHUB_CLIENT_ID?.trim() || "",
      new GitHubReportCredentials(dataRoot),
      this.http,
      (url) => shell.openExternal(url),
    );
  }
  account(action: GitHubReportAuthAction) {
    if (this.submitting && action !== "status")
      throw new Error(
        "Wait for the current report upload before changing GitHub accounts.",
      );
    return this.auth.action(action);
  }
  submit(request: SubmitGitHubReport): Promise<GitHubReportResult> {
    if (this.submitting)
      throw new Error("A GitHub report is already being submitted.");
    this.submitting = this.performSubmit(request).finally(() => {
      this.submitting = undefined;
    });
    return this.submitting;
  }
  private async performSubmit(
    request: SubmitGitHubReport,
  ): Promise<GitHubReportResult> {
    const account = await this.auth.credentials();
    const issueUrl = await submitGitHubReport(
      this.dataRoot,
      request,
      account,
      this.http,
    );
    try {
      await shell.openExternal(issueUrl);
      return { issueUrl, opened: true };
    } catch (error) {
      void error; // Expected optional browser failure; the persisted issue remains authoritative.
      // The issue already exists: a browser failure must not resubmit it.
      return { issueUrl, opened: false };
    }
  }
}
