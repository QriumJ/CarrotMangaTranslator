import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dialog, type IpcMainInvokeEvent } from "electron";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { IpcContext } from "../src/main/ipc/context";
import { workGlossaryIpcContracts } from "../src/shared/ipcWorkGlossaryContracts";
import { MAX_WORK_GLOSSARY_FILE_BYTES } from "../src/shared/workGlossaryFile";

type InvokeHandler = (
  event: IpcMainInvokeEvent,
  ...args: unknown[]
) => Promise<unknown> | unknown;

const electronBoundary = vi.hoisted(() => {
  const handlers = new Map<string, InvokeHandler>();
  return {
    handlers,
    handle: vi.fn((channel: string, handler: InvokeHandler) => {
      handlers.set(channel, handler);
    }),
  };
});

vi.mock("electron", () => ({
  app: { getLocale: () => "ko", getPath: () => "C:\\test", isPackaged: false },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  ipcMain: { handle: electronBoundary.handle },
}));

const rendererUrl = "http://127.0.0.1:5173/";
const trustedEvent = {
  sender: { id: 7 },
  senderFrame: { url: rendererUrl },
} as IpcMainInvokeEvent;
let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "work-glossary-ipc-"));
  electronBoundary.handlers.clear();
  vi.mocked(dialog.showOpenDialog).mockReset();
  vi.mocked(dialog.showSaveDialog).mockReset();
  const { registerWorkGlossaryFileIpc } =
    await import("../src/main/ipc/textExportIpc");
  registerWorkGlossaryFileIpc({
    appPaths: { dataRoot: root },
    getMainWindow: () => ({
      isDestroyed: () => false,
      webContents: { id: 7, getURL: () => rendererUrl },
    }),
  } as IpcContext);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = electronBoundary.handlers.get(channel);
  if (!handler) throw new Error(`Missing handler: ${channel}`);
  return Promise.resolve(handler(trustedEvent, ...args));
}

it("saves the term file with a safe name and a .json extension", async () => {
  const target = join(root, "백업");
  vi.mocked(dialog.showSaveDialog).mockResolvedValue({
    canceled: false,
    filePath: target,
  });
  await expect(
    invoke(workGlossaryIpcContracts.saveWorkGlossaryFile.channel, {
      defaultName: "작품: 1부/용어집",
      content: '{"format":"carrot-work-glossary"}\n',
    }),
  ).resolves.toEqual({ saved: true, path: `${target}.json` });
  const options = vi.mocked(dialog.showSaveDialog).mock.calls[0]?.at(-1) as
    { defaultPath?: string } | undefined;
  expect(options?.defaultPath).toBe("작품_ 1부_용어집.json");
  expect(await readFile(`${target}.json`, "utf8")).toBe(
    '{"format":"carrot-work-glossary"}\n',
  );
});

it("returns null and writes nothing when either dialog is cancelled", async () => {
  vi.mocked(dialog.showSaveDialog).mockResolvedValue({
    canceled: true,
    filePath: "",
  });
  vi.mocked(dialog.showOpenDialog).mockResolvedValue({
    canceled: true,
    filePaths: [],
  });
  await expect(
    invoke(workGlossaryIpcContracts.saveWorkGlossaryFile.channel, {
      defaultName: "용어집",
      content: "{}",
    }),
  ).resolves.toBeNull();
  await expect(
    invoke(workGlossaryIpcContracts.openWorkGlossaryFile.channel),
  ).resolves.toBeNull();
});

it("reads a chosen term file and refuses oversized files without reading them", async () => {
  const small = join(root, "small.json");
  await writeFile(small, '{"glossary":[]}', "utf8");
  vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
    canceled: false,
    filePaths: [small],
  });
  await expect(
    invoke(workGlossaryIpcContracts.openWorkGlossaryFile.channel),
  ).resolves.toEqual({ path: small, content: '{"glossary":[]}' });

  const large = join(root, "large.json");
  await writeFile(large, Buffer.alloc(MAX_WORK_GLOSSARY_FILE_BYTES + 1, 32));
  vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
    canceled: false,
    filePaths: [large],
  });
  await expect(
    invoke(workGlossaryIpcContracts.openWorkGlossaryFile.channel),
  ).resolves.toEqual({ path: large, tooLarge: true });
});
