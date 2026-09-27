import { withTimeout } from "./pageExportLifecycle";

/** Use the same Chromium sanitizer as preview/export, before storing any bytes. */
export async function validateCustomFontLoad(bytes: Buffer): Promise<void> {
  const { BrowserWindow } = await import("electron");
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  try {
    await withTimeout(
      loadFont(window, bytes),
      15_000,
      "폰트 검사 시간이 초과되었습니다. 다시 시도해 주세요.",
    );
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

async function loadFont(
  window: Electron.BrowserWindow,
  bytes: Buffer,
): Promise<void> {
  await window.loadURL(
    "data:text/html," +
      encodeURIComponent(
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'">',
      ),
  );
  // Only base64-encoded bytes cross into the sandbox; no paths or font names.
  const loaded: unknown = await window.webContents.executeJavaScript(`
    (async () => {
      const bytes = Uint8Array.from(atob(${JSON.stringify(bytes.toString("base64"))}), c => c.charCodeAt(0));
      try {
        const face = new FontFace("MGTValidation", bytes);
        await face.load();
        return face.status === "loaded";
      } catch {
        return false;
      }
    })()
  `);
  if (loaded !== true) {
    throw new Error(
      "앱에서 읽을 수 없는 폰트입니다. 파일이 손상되었거나 지원되지 않는 형식일 수 있습니다. 원본 TTF/OTF 파일을 다시 받아 등록하거나 다른 폰트를 선택해 주세요.",
    );
  }
}
