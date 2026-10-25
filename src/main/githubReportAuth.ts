import { z } from "zod";
import type {
  GitHubReportAuthAction,
  GitHubReportAuthState,
} from "../shared/githubReport";
import { GitHubReportHttp, githubIdentitySchema } from "./githubReportHttp";
import type {
  GitHubCredentials,
  GitHubReportCredentials,
} from "./githubReportCredentials";

const deviceSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.literal("https://github.com/login/device"),
  expires_in: z.number().positive(),
  interval: z.number().positive(),
});
const tokenSchema = z.object({
  access_token: z.string().min(1),
  scope: z.string().optional(),
  refresh_token: z.string().optional(),
  expires_in: z.number().positive().optional(),
});
const oauthErrorSchema = z.object({ error: z.string() });
type PendingLogin = z.infer<typeof deviceSchema> & {
  expiresAt: number;
  nextPoll: number;
};

export class GitHubReportAuth {
  private pending?: PendingLogin;
  private operation: Promise<unknown> = Promise.resolve();
  private refreshing?: Promise<GitHubCredentials>;
  constructor(
    private readonly clientId: string,
    private readonly store: Pick<GitHubReportCredentials, "load" | "save">,
    private readonly http: GitHubReportHttp,
    private readonly openExternal: (url: string) => Promise<void>,
    private readonly now = Date.now,
  ) {}

  action(action: GitHubReportAuthAction): Promise<GitHubReportAuthState> {
    const operation = this.operation.then(() => this.perform(action));
    // Queue different actions: signing out during a pending poll must still sign out.
    this.operation = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async credentials(): Promise<GitHubCredentials> {
    if (!this.clientId)
      throw new Error(
        "GitHub OAuth Client ID is not configured in this build.",
      );
    const current = await this.store.load();
    if (!current || current.clientId !== this.clientId)
      throw new Error("Sign in to GitHub first.");
    if (!current.expiresAt || current.expiresAt > this.now() + 60_000)
      return current;
    this.refreshing ??= this.refresh(current).finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  private async perform(
    action: GitHubReportAuthAction,
  ): Promise<GitHubReportAuthState> {
    if (!this.clientId) return { configured: false };
    if (action === "disconnect") {
      this.pending = undefined;
      await this.store.save(null);
    } else if (action === "start") {
      // A new sign-in also repairs credentials copied from another OS account.
      // Verify encrypted persistence before asking the user to authorize anything.
      await this.store.save(null);
      const device = deviceSchema.parse(
        await this.http.oauth({
          client_id: this.clientId,
          scope: "gist public_repo",
        }),
      );
      this.pending = {
        ...device,
        expiresAt: this.now() + device.expires_in * 1000,
        nextPoll: this.now() + device.interval * 1000,
      };
      await this.openExternal(device.verification_uri);
    } else if (action === "poll") {
      await this.poll();
    } else if (action === "reopen" && this.pending) {
      // Only the fixed verification page validated at sign-in start is opened.
      await this.openExternal(this.pending.verification_uri);
    }
    return this.status();
  }

  private async status(): Promise<GitHubReportAuthState> {
    const credentials = await this.store.load();
    const pending = this.pending;
    return {
      configured: true,
      login:
        credentials?.clientId === this.clientId ? credentials.login : undefined,
      userCode: pending?.user_code,
      expiresAt: pending?.expiresAt,
    };
  }

  private async poll(): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    if (this.now() >= pending.expiresAt) {
      this.pending = undefined;
      throw new Error("GitHub sign-in expired. Start sign-in again.");
    }
    if (this.now() < pending.nextPoll) return;
    pending.nextPoll = this.now() + pending.interval * 1000;
    const result = await this.http.oauth({
      client_id: this.clientId,
      device_code: pending.device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    const failure = oauthErrorSchema.safeParse(result);
    if (failure.success) {
      if (failure.data.error === "authorization_pending") return;
      if (failure.data.error === "slow_down") {
        pending.interval += 5;
        pending.nextPoll = this.now() + pending.interval * 1000;
        return;
      }
      this.pending = undefined;
      throw new Error(
        "GitHub sign-in was denied or expired. Start sign-in again.",
      );
    }
    await this.acceptToken(result);
    this.pending = undefined;
  }

  private async acceptToken(
    result: unknown,
    expectedId?: number,
  ): Promise<GitHubCredentials> {
    const token = tokenSchema.parse(result);
    if (token.scope !== undefined) {
      const scopes = token.scope.split(/[ ,]+/);
      if (
        !scopes.includes("gist") ||
        !(scopes.includes("public_repo") || scopes.includes("repo"))
      )
        throw new Error(
          "GitHub authorization requires Gist and public repository access.",
        );
    }
    const user = githubIdentitySchema.parse(
      await this.http.api("/user", token.access_token),
    );
    if (expectedId !== undefined && user.id !== expectedId)
      throw new Error("GitHub account changed during token refresh.");
    const credentials: GitHubCredentials = {
      clientId: this.clientId,
      ...user,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: token.expires_in
        ? this.now() + token.expires_in * 1000
        : undefined,
    };
    await this.store.save(credentials);
    return credentials;
  }

  private async refresh(
    current: GitHubCredentials,
  ): Promise<GitHubCredentials> {
    if (!current.refreshToken) {
      await this.store.save(null);
      throw new Error("GitHub session expired. Sign in again.");
    }
    const result = await this.http.oauth({
      client_id: this.clientId,
      refresh_token: current.refreshToken,
      grant_type: "refresh_token",
    });
    if (oauthErrorSchema.safeParse(result).success) {
      await this.store.save(null);
      throw new Error("GitHub session expired. Sign in again.");
    }
    return this.acceptToken(result, current.id);
  }
}
