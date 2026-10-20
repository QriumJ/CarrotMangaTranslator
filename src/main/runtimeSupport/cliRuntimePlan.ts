export type ManagedCli = "claude" | "codex" | "grok";

// Official npm tarballs, verified against registry SHA-512 integrity before
// pinning these SHA-256 digests. Never resolve a moving latest tag at runtime.
const assets = {
  "grok/win32-x64": {
    url: "https://registry.npmjs.org/@xai-official/grok-win32-x64/-/grok-win32-x64-1.0.62.tgz",
    bytes: 50049748,
    sha256: "d3b8142a4cac1289536cf6d16407f5a9695ba3e884cc2d03f3e0d3967677a832",
    version: "1.0.62",
    executable: "bin/grok.exe",
    compressedExecutable: "bin/grok.exe.br",
  },
  "grok/darwin-arm64": {
    url: "https://registry.npmjs.org/@xai-official/grok-darwin-arm64/-/grok-darwin-arm64-1.0.62.tgz",
    bytes: 49049727,
    sha256: "c3405e6181a34e193b0680828a230a157dafbb313d628b8da7e1e8c42d227a8a",
    version: "1.0.62",
    executable: "bin/grok",
    compressedExecutable: "bin/grok.br",
  },
  "claude/win32-x64": {
    url: "https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-win32-x64/-/claude-agent-sdk-win32-x64-0.3.294.tgz",
    bytes: 115936334,
    sha256: "3918343c5c651dfc2d0078edf3cbe4330609a945d2a1fa8c9bb4212a904a68f4",
    version: "0.3.294",
    executable: "claude.exe",
  },
  "claude/darwin-arm64": {
    url: "https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-darwin-arm64/-/claude-agent-sdk-darwin-arm64-0.3.294.tgz",
    bytes: 103276853,
    sha256: "471c95f94a6d3de0c8f83a412bdf17d7322352ce8d91250a7d683a97361f9ea0",
    version: "0.3.294",
    executable: "claude",
  },
  "codex/win32-x64": {
    url: "https://registry.npmjs.org/@openai/codex/-/codex-0.160.0-win32-x64.tgz",
    bytes: 162643563,
    sha256: "1f4c46470317bf5fabb308ed3e39a80ff544069cedc2cb477005545e694058b9",
    version: "0.160.0-win32-x64",
    executable: "vendor/x86_64-pc-windows-msvc/bin/codex.exe",
  },
  "codex/darwin-arm64": {
    url: "https://registry.npmjs.org/@openai/codex/-/codex-0.160.0-darwin-arm64.tgz",
    bytes: 134311083,
    sha256: "fc789bcd655d903f92e1a23c8dc5315ba38f43b3586eafb7bd3b195970b57466",
    version: "0.160.0-darwin-arm64",
    executable: "vendor/aarch64-apple-darwin/bin/codex",
  },
} as const;

export function cliRuntimePlan(
  provider: ManagedCli,
  platform: string = process.platform,
  arch: string = process.arch,
) {
  const key = `${provider}/${platform}-${arch}`;
  const asset = assets[key as keyof typeof assets];
  if (!asset)
    throw new Error(`CLI 자동 설치를 지원하지 않는 플랫폼입니다: ${key}`);
  return {
    ...asset,
    provider,
    target: `${platform}-${arch}`,
    compressedExecutable:
      "compressedExecutable" in asset ? asset.compressedExecutable : undefined,
  };
}
