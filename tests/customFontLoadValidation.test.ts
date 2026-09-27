import { afterEach, expect, it, vi } from "vitest";
import { validateCustomFontLoad } from "../src/main/customFontLoadValidation";

const boundary = vi.hoisted(() => ({
  loadURL: vi.fn(),
  executeJavaScript: vi.fn(),
  destroy: vi.fn(),
  isDestroyed: vi.fn(),
  options: vi.fn(),
}));
vi.mock("electron", () => ({
  BrowserWindow: class {
    constructor(options: unknown) {
      boundary.options(options);
    }
    loadURL = boundary.loadURL;
    destroy = boundary.destroy;
    isDestroyed = boundary.isDestroyed;
    webContents = { executeJavaScript: boundary.executeJavaScript };
  },
}));
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

it("checks bytes in a hidden sandbox and destroys it after success", async () => {
  boundary.loadURL.mockResolvedValue(undefined);
  boundary.executeJavaScript.mockResolvedValue(true);
  await validateCustomFontLoad(Buffer.from([0, 1, 2]));
  expect(boundary.options).toHaveBeenCalledWith(
    expect.objectContaining({
      show: false,
      webPreferences: expect.objectContaining({
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
      }),
    }),
  );
  expect(boundary.executeJavaScript).toHaveBeenCalledWith(
    expect.stringContaining('"AAEC"'),
  );
  expect(boundary.destroy).toHaveBeenCalledOnce();
});

it("rejects sanitizer failures and cleans up the renderer", async () => {
  boundary.executeJavaScript.mockResolvedValue(false);
  await expect(validateCustomFontLoad(Buffer.alloc(12))).rejects.toThrow(
    "앱에서 읽을 수 없는 폰트",
  );
  expect(boundary.destroy).toHaveBeenCalledOnce();
});

it("propagates window load failure without executing the font script", async () => {
  boundary.loadURL.mockRejectedValue(new Error("renderer failed"));
  boundary.isDestroyed.mockReturnValue(true);
  await expect(validateCustomFontLoad(Buffer.alloc(12))).rejects.toThrow(
    "renderer failed",
  );
  expect(boundary.executeJavaScript).not.toHaveBeenCalled();
  expect(boundary.destroy).not.toHaveBeenCalled();
});

it("bounds a stalled renderer and observes late replies", async () => {
  vi.useFakeTimers();
  boundary.loadURL.mockReturnValue(new Promise(() => undefined));
  const result = expect(
    validateCustomFontLoad(Buffer.alloc(12)),
  ).rejects.toThrow("검사 시간이 초과");
  await vi.advanceTimersByTimeAsync(15_000);
  await result;
  expect(boundary.destroy).toHaveBeenCalledOnce();
});
