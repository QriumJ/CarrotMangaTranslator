import { safeStorage } from "electron";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { writeDurableFile } from "./libraryStore/libraryTransactionStorage";

const githubCredentialsSchema = z.object({
  clientId: z.string(),
  id: z.number().int(),
  login: z.string(),
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
});
export type GitHubCredentials = z.infer<typeof githubCredentialsSchema>;

const encryption = {
  available: () =>
    safeStorage.isEncryptionAvailable() &&
    !(
      process.platform === "linux" &&
      safeStorage.getSelectedStorageBackend() === "basic_text"
    ),
  encrypt: (text: string) => safeStorage.encryptString(text),
  decrypt: (value: Buffer) => safeStorage.decryptString(value),
};

export class GitHubReportCredentials {
  private readonly path: string;
  constructor(
    dataRoot: string,
    private readonly codec = encryption,
  ) {
    this.path = join(dataRoot, "github-report-private", "authorization.enc");
  }
  async load(): Promise<GitHubCredentials | null> {
    this.assertEncryption();
    let bytes: Buffer;
    try {
      bytes = await readFile(this.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    return githubCredentialsSchema
      .nullable()
      .parse(JSON.parse(this.codec.decrypt(bytes)));
  }
  async save(value: GitHubCredentials | null): Promise<void> {
    this.assertEncryption();
    await writeDurableFile(
      this.path,
      this.codec.encrypt(JSON.stringify(value)),
    );
  }
  private assertEncryption(): void {
    if (!this.codec.available())
      throw new Error("OS credential encryption is unavailable.");
  }
}
