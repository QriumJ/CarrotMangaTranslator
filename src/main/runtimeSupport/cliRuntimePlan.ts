export type ManagedCli = "claude" | "codex" | "grok";

// Official npm tarballs, verified against registry SHA-512 integrity before
// pinning these SHA-256 digests. Never resolve a moving latest tag at runtime.
const assets = {
  "grok/win32-x64": {
    url: "https://registry.npmjs.org/@xai-official/grok-win32-x64/-/grok-win32-x64-1.0.70.tgz",
    bytes: 50678046,
    sha256: "c306b220eca458f1a2e1f3f2701dcd5a739ded121628367abfed2176bcd94534",
    version: "1.0.70",
    executable: "bin/grok.exe",
    compressedExecutable: "bin/grok.exe.br",
  },
  "grok/darwin-arm64": {
    url: "https://registry.npmjs.org/@xai-official/grok-darwin-arm64/-/grok-darwin-arm64-1.0.70.tgz",
    bytes: 49911569,
    sha256: "613073e81e99f34bc9024df52e391cef4c302d5a2a865cca8831de4a250efb80",
    version: "1.0.70",
    executable: "bin/grok",
    compressedExecutable: "bin/grok.br",
  },
  "claude/win32-x64": {
    url: "https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-win32-x64/-/claude-agent-sdk-win32-x64-0.3.311.tgz",
    bytes: 136547702,
    sha256: "fe08ba7ddc7cdd78ad643fcdea4f7ba664b2acf3f56fb1473900cd29ab3db8a9",
    version: "0.3.311",
    executable: "claude.exe",
  },
  "claude/darwin-arm64": {
    url: "https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-darwin-arm64/-/claude-agent-sdk-darwin-arm64-0.3.311.tgz",
    bytes: 122944761,
    sha256: "afeee39f9186e18d715d6a0cde8fb599c9643a0ca2ac06694698ad6ef07c185d",
    version: "0.3.311",
    executable: "claude",
  },
  "codex/win32-x64": {
    url: "https://registry.npmjs.org/@openai/codex/-/codex-0.164.0-win32-x64.tgz",
    bytes: 172854349,
    sha256: "4fbd23473a2fc223396cdd8490d3f658d368438134c12a3f1dac9d1e2041a65b",
    version: "0.164.0-win32-x64",
    executable: "vendor/x86_64-pc-windows-msvc/bin/codex.exe",
  },
  "codex/darwin-arm64": {
    url: "https://registry.npmjs.org/@openai/codex/-/codex-0.164.0-darwin-arm64.tgz",
    bytes: 140709294,
    sha256: "9b5a35be1975ceb332eaf274032f375b017ab644ff0165737ead03277fae77cd",
    version: "0.164.0-darwin-arm64",
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
