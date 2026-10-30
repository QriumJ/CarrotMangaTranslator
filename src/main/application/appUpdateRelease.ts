import { z } from "zod";
import { APP_RELEASE_OWNER, APP_RELEASE_REPO } from "../../shared/appRelease";
import { readBoundedResponseText } from "../httpResponseBudget";

const repository = `${APP_RELEASE_OWNER}/${APP_RELEASE_REPO}`;
const assetSchema = z.object({
  name: z.string(),
  size: z.number().int().positive(),
  browser_download_url: z.string().url(),
});
const releaseSchema = z.object({
  tag_name: z.string(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  assets: z.array(assetSchema),
});
export type AppUpdateRelease = {
  version: string;
  tag: string;
  baseUrl: string;
  name: string;
  url: string;
  size: number;
  sha256: string;
};
export class AppUpdateError extends Error {
  constructor(
    readonly code:
      | "incomplete"
      | "integrity"
      | "storage"
      | "save"
      | "busy"
      | "install"
      | "unsupported",
    message: string,
  ) {
    super(message);
  }
}

export function compareAppVersions(left: string, right: string): number {
  const parse = (value: string) =>
    /^\d+\.\d+\.\d+$/.test(value) ? value.split(".").map(Number) : null;
  const a = parse(left),
    b = parse(right);
  if (!a || !b || [...a, ...b].some((n) => !Number.isSafeInteger(n)))
    throw new Error("Invalid app version");
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}

async function fetchText(
  url: string,
  signal: AbortSignal,
  fetcher: typeof fetch,
): Promise<string> {
  const response = await fetcher(url, {
    signal,
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok)
    throw new Error(`Update request failed: HTTP ${response.status}`);
  return readBoundedResponseText(response, {
    label: "App update",
    maximumBytes: 4 * 1024 * 1024,
    signal,
  });
}

export async function findAppUpdate(
  current: string,
  platform: "windows" | "macos",
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<AppUpdateRelease | null> {
  const body = await fetchText(
    `https://api.github.com/repos/${repository}/releases?per_page=100`,
    signal,
    fetcher,
  );
  const releases = z
    .array(releaseSchema)
    .parse(JSON.parse(body))
    .filter(
      (r) => !r.draft && !r.prerelease && /^v\d+\.\d+\.\d+$/.test(r.tag_name),
    );
  releases.sort((a, b) =>
    compareAppVersions(b.tag_name.slice(1), a.tag_name.slice(1)),
  );
  for (const release of releases) {
    const version = release.tag_name.slice(1);
    if (compareAppVersions(version, current) <= 0) continue;
    const update = await resolveReleaseUpdate(
      release,
      platform,
      signal,
      fetcher,
    );
    if (update) return update;
  }
  return null;
}

async function resolveReleaseUpdate(
  release: z.infer<typeof releaseSchema>,
  platform: "windows" | "macos",
  signal: AbortSignal,
  fetcher: typeof fetch,
): Promise<AppUpdateRelease | null> {
  const version = release.tag_name.slice(1);
  const name =
    platform === "windows"
      ? `CarrotMangaTranslator-Setup-${release.tag_name}.exe`
      : `CarrotMangaTranslator-${version}-macOS-arm64.dmg`;
  const artifact = release.assets.find((a) => a.name === name);
  // Model/runtime asset releases are not application updates.
  if (
    !release.assets.some(
      (a) =>
        /^(CarrotMangaTranslator-|당근망가번역기)/.test(a.name) &&
        /\.(exe|dmg)$/.test(a.name),
    )
  )
    return null;
  const sums = release.assets.find(
    (a) =>
      a.name ===
      (platform === "windows"
        ? "SHA256SUMS-windows.txt"
        : "SHA256SUMS-macOS-arm64.txt"),
  );
  if (
    !artifact ||
    !sums ||
    (platform === "windows" &&
      !release.assets.some((a) => a.name === "latest.yml"))
  )
    throw new AppUpdateError("incomplete", "Release assets are not ready");
  const baseUrl = `https://github.com/${repository}/releases/download/${release.tag_name}/`;
  for (const asset of [artifact, sums]) {
    if (asset.browser_download_url !== baseUrl + encodeURIComponent(asset.name))
      throw new AppUpdateError("integrity", "Unexpected release asset URL");
  }
  if (artifact.size > 4 * 1024 ** 3)
    throw new AppUpdateError("integrity", "Update exceeds the size limit");
  const checksum = await fetchText(sums.browser_download_url, signal, fetcher);
  const matches = checksum.split(/\r?\n/).flatMap((line) => {
    const match = /^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(line.trim());
    return match?.[2] === name ? [match[1].toLowerCase()] : [];
  });
  if (matches.length !== 1)
    throw new AppUpdateError(
      "integrity",
      "Missing or ambiguous update checksum",
    );
  return {
    version,
    tag: release.tag_name,
    baseUrl,
    name,
    url: artifact.browser_download_url,
    size: artifact.size,
    sha256: matches[0],
  };
}
