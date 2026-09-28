const { execFile } = require("node:child_process");
const { mkdir, mkdtemp, rm, writeFile } = require("node:fs/promises");
const { join, relative, resolve } = require("node:path");
const { promisify } = require("node:util");
const exec = promisify(execFile);
const root = resolve(__dirname, "..");

// Only the frame and synthetic state are fixtures. Controls, tabs, modal and CSS
// come from production components; the repository's QA runner supplies the bridge.
const fixture = `import React from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_MCP_PREFERENCES, type McpDesktopStatus, type McpDiagnostics } from "../../shared/mcpDesktopTypes";
import { McpSettingsView } from "../src/components/settingsModal/McpSettingsPanel";
import { SettingsTabs } from "../src/components/settingsModal/SettingsTabs";
import { Modal } from "../src/components/ui/Modal";
import { SettingsModalFooter } from "../src/components/settingsModal/SettingsModalFooter";
import { AppI18nProvider } from "../src/i18n";
import { initializeAppI18n } from "../src/appI18n";
import "../src/styles.css";
const scenario = new URLSearchParams(location.search).get("scenario");
const status: McpDesktopStatus = {
  state: scenario === "error" ? "error" : scenario === "off" ? "off" : "online", provider: "tailscale",
  url: "https://carrot-manga-translator-desktop-device.tail-user-network.ts.net/mcp",
  message: scenario === "error" ? "Tailscale HTTPS 443 포트는 다른 앱이 사용 중입니다. 기존 공유 설정을 덮어쓰지 않습니다." : null,
  setupUrl: null,
  preferences: { ...DEFAULT_MCP_PREFERENCES },
  pending: scenario === "pairing" ? [{ id: "synthetic", clientName: "ChatGPT 개인 연결 · 확인 코드를 대조하세요", code: "739412", scope: "carrot.read carrot.images carrot.edit carrot.process offline_access", expiresAt: Date.now() + 300000 }] : [],
  connections: [
    ...Array.from({length: 12}, (_, index) => ({ id: "revoked-" + index, clientName: "철회된 연결", scope: "carrot.read", createdAt: 1, revoked: true })),
    ...(scenario === "off" ? [] : [{ id: "approved", clientName: scenario === "zoom" ? "ChatGPT · A very long connection name for international workspace testing 日本語 연결 이름" : "ChatGPT", scope: "carrot.read carrot.images carrot.edit carrot.process offline_access", createdAt: Date.UTC(2026, 8, 24, 12, 30), revoked: false }]),
  ],
};
const diagnostics: McpDiagnostics | null = scenario === "diagnostics" ? {
  ok: false,
  checks: [
    { name: "OAuth 보호 리소스", passed: true, message: "확인 완료" },
    { name: "OAuth 인증 서버", passed: false, message: "OAuth issuer 또는 인증 경로가 앱의 고정 주소와 일치하지 않습니다." },
    { name: "무인증 MCP POST 차단", passed: false, message: "예상한 401 Bearer 거부와 정확한 OAuth 메타데이터 주소를 확인하지 못했습니다." },
  ],
} : null;
function audit() {
  const page = document.documentElement;
  const dialog = document.querySelector('[role="dialog"]');
  const panel = document.querySelector('[role="tabpanel"]');
  if (!dialog || !panel) throw new Error("MCP settings did not render");
  if (scenario === "chatgpt") {
    const pictures = [...document.querySelectorAll<HTMLImageElement>('ol > li > figure > div > img')];
    if (pictures.length !== 7 || pictures.some(image => !image.complete || image.naturalWidth === 0)) throw new Error("ChatGPT guide screenshot failed to load");
    for (const image of pictures) {
      const box = image.getBoundingClientRect();
      if (box.left < 0 || box.right > innerWidth) throw new Error("Guide screenshot exceeds viewport width");
    }
    const preview = [...document.querySelectorAll('[role="dialog"]')].at(1);
    if (preview) {
      const box = preview.getBoundingClientRect();
      if (box.left < 0 || box.right > innerWidth || box.top < 0 || box.bottom > innerHeight) throw new Error("Guide preview exceeds viewport");
    }
  }
  const rect = dialog.getBoundingClientRect();
  if (page.scrollWidth > innerWidth + 1 || page.scrollHeight > innerHeight + 1 ||
      rect.left < -1 || rect.top < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1 ||
      panel.scrollWidth > panel.clientWidth + 1) throw new Error("MCP settings overflow the viewport");
  if (document.querySelector('input[type="password"]')) throw new Error("Unexpected pairing password control");
  if (panel.textContent?.includes("철회된 연결")) throw new Error("Revoked connections must not remain in the settings list");
  if ([...document.querySelectorAll("button")].some(item => item.textContent?.includes("새 연결 허용"))) throw new Error("Retired enrollment timer button is still present");
  const options = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  if (options.length !== 4 || options.some(item => !item.checked)) throw new Error("First-use defaults must all be checked");
  for (const input of document.querySelectorAll('input[type="checkbox"]')) {
    const label = input.closest("label");
    const text = label?.querySelector("span");
    if (!label || !text) throw new Error("Checkbox has no associated label");
    const box = input.getBoundingClientRect(), caption = text.getBoundingClientRect();
    if (caption.left < box.right || caption.bottom < box.top || caption.top > box.bottom || label.getBoundingClientRect().height < 24)
      throw new Error("MCP checkbox caption or target size regressed");
  }
  if (scenario === "pairing") {
    const button = [...document.querySelectorAll("button")].find(item => item.textContent?.includes("같은 코드 확인"));
    if (!button) throw new Error("Missing app approval control");
    button.scrollIntoView({ block: "center" });
    const bounds = button.getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > innerHeight) throw new Error("Approval control is unreachable");
  }
  if (scenario === "diagnostics") {
    const section = [...document.querySelectorAll('[role="status"]')].find(item => item.textContent?.includes("통과 · OAuth 보호 리소스"));
    if (!section || !section.textContent?.includes("통과 · OAuth 보호 리소스") ||
        !section.textContent.includes("실패 · OAuth 인증 서버") || !section.textContent.includes("실패 · 무인증 MCP POST 차단"))
      throw new Error("Missing independent diagnostic result rows");
    section.scrollIntoView({ block: "end" });
    const bounds = section.getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > innerHeight)
      throw new Error("Diagnostic result or explanation is unreachable");
  }
}
async function main() {
  await initializeAppI18n("ko");
  const target = document.getElementById("root");
  if (!target) throw new Error("Missing QA root");
  createRoot(target).render(<AppI18nProvider><Modal title="설정" width="min(920px, 100%)" fillHeight bodyClassName="settings-modal-body" onClose={() => {}}
    footer={<SettingsModalFooter canSubmit={false} controlsBusy={false} onCancel={() => {}} onOpenErrorReport={() => {}} onOpenLogFolder={() => {}} onReset={() => {}} submit={() => {}} onRevealIssue={() => {}} />}>
    <div className="settings-layout"><SettingsTabs activeTab="mcp" onChange={() => {}} />
      <div className="settings-tabpanel modal-section" role="tabpanel" id="settings-panel-mcp" aria-labelledby="settings-tab-mcp">
        <McpSettingsView status={status} busy={false} error={null} diagnostics={diagnostics} run={async action => { await action(); }} diagnose={async () => {}} />
      </div></div></Modal></AppI18nProvider>);
  setTimeout(() => {
    if (scenario === "diagnostics" || scenario === "codex" || scenario === "chatgpt") {
      const help = [...document.querySelectorAll("button")].find(item => item.textContent?.includes("연결 방법 및 도움말"));
      help?.click();
    }
    if (scenario === "pairing") {
      const approval = [...document.querySelectorAll("button")].find(item => item.textContent?.includes("같은 코드 확인"));
      approval?.focus({ focusVisible: true } as FocusOptions);
    }
    setTimeout(() => {
      if (scenario === "chatgpt") document.querySelector<HTMLButtonElement>('[role="tab"][id$="-chatgpt"]')?.click();
      if (scenario === "codex" || scenario === "chatgpt") {
        document.querySelector('[aria-label="연결할 AI 앱"]')?.scrollIntoView({ block: "start" });
      }
      setTimeout(() => {
        const focus = new URLSearchParams(location.search).get("focus");
        if (focus === "tools") {
          document.querySelector('img[alt="권한 메뉴의 모든 도구 허용"]')?.closest("figure")?.previousElementSibling?.scrollIntoView({ block: "start" });
        } else if (focus === "preview") {
          document.querySelector<HTMLButtonElement>('button[aria-label="MCP 앱 만들기 · 연결 주소는 가린 예시 크게 보기"]')?.click();
        } else if (focus) {
          document.querySelector('[data-guide-step="' + focus + '"]')?.scrollIntoView({ block: "start" });
        } else if (scenario === "chatgpt") {
          document.querySelector('[aria-label="연결할 AI 앱"]')?.scrollIntoView({ block: "start" });
        }
        setTimeout(audit, 150);
      }, 150);
    }, 150);
  }, 500);
}
void main();
`;

async function main() {
  if (process.argv.includes("--help")) {
    console.log(
      "Usage: node scripts/mcp-ui-qa.cjs [--chatgpt-only | --permissions-only]\nCaptures synthetic production MCP settings with the repository UI QA runner. No account, model or tunnel is used.",
    );
    return;
  }
  const renderer = join(root, "src/renderer");
  const directory = await mkdtemp(join(renderer, "mcp-qa-"));
  const output = join(root, ".tmp", `mcp-ui-qa-${Date.now()}`);
  try {
    await mkdir(output, { recursive: true });
    await writeFile(join(directory, "main.tsx"), fixture);
    await writeFile(
      join(directory, "index.html"),
      '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MCP QA</title></head><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>',
    );
    const scenarios = process.argv.includes("--permissions-only")
      ? [
          ["chatgpt-manage-wide", 1600, 980, "chatgpt&focus=manage"],
          ["chatgpt-manage-narrow", 620, 760, "chatgpt&focus=manage"],
        ]
      : process.argv.includes("--chatgpt-only")
        ? [
            ["chatgpt-wide", 1600, 980, "chatgpt"],
            ["chatgpt-narrow", 620, 760, "chatgpt"],
            ["chatgpt-create-wide", 1600, 980, "chatgpt&focus=create"],
            ["chatgpt-create-narrow", 620, 760, "chatgpt&focus=create"],
            [
              "chatgpt-permissions-wide",
              1600,
              980,
              "chatgpt&focus=permissions",
            ],
            [
              "chatgpt-permissions-narrow",
              620,
              760,
              "chatgpt&focus=permissions",
            ],
            ["chatgpt-tools-narrow", 620, 760, "chatgpt&focus=tools"],
            ["chatgpt-preview-narrow", 620, 760, "chatgpt&focus=preview"],
          ]
        : [
            ["wide", 1600, 980, "online"],
            ["narrow", 1240, 760, "online"],
            ["pairing", 1240, 760, "pairing"],
            ["error", 1240, 760, "error"],
            ["diagnostics-wide", 1600, 980, "diagnostics"],
            ["diagnostics-narrow", 1240, 760, "diagnostics"],
            ["off", 1240, 760, "off"],
            ["codex-wide", 1600, 980, "codex"],
            ["codex-narrow", 1240, 760, "codex"],
            ["chatgpt-narrow", 1240, 760, "chatgpt"],
            // 1240×760 at 200% browser zoom has a 620×380 CSS viewport.
            // CSS zoom on <html> is not equivalent: it leaves vh/media queries unchanged.
            ["zoom-equivalent", 620, 380, "zoom"],
          ];
    for (const [name, width, height, scenario] of scenarios) {
      const entry = `${relative(renderer, directory).replaceAll("\\", "/")}/index.html?scenario=${scenario}`;
      const result = await exec(
        process.execPath,
        [
          join(root, "scripts/ui-qa.mjs"),
          "--entry",
          entry,
          "--output",
          join(output, `${name}.png`),
          "--width",
          String(width),
          "--height",
          String(height),
          "--wait",
          "1800",
        ],
        { cwd: root, timeout: 90_000 },
      );
      console.log(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      console.log(
        `PASS production MCP settings ${name} capture and layout assertions`,
      );
    }
  } finally {
    // This newly created directory contains only our two temporary QA files.
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
