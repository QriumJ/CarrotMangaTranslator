import type { IpcMainInvokeEvent } from "electron";
import { beforeEach, expect, it, vi } from "vitest";
import { libraryIpcContracts } from "../src/shared/ipcContracts";
import {
  RenameChapterRequestSchema,
  RenameWorkRequestSchema,
} from "../src/shared/ipcLibrarySchemas";

type Handler = (
  event: IpcMainInvokeEvent,
  ...args: unknown[]
) => Promise<unknown>;
const electronBoundary = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler) =>
      electronBoundary.handlers.set(channel, handler),
  },
  app: { isPackaged: false, getLocale: () => "ko" },
}));
beforeEach(() => electronBoundary.handlers.clear());
it.each([
  {
    kind: "work",
    contract: libraryIpcContracts.renameWork,
    schema: RenameWorkRequestSchema,
    idKey: "workId",
  },
  {
    kind: "chapter",
    contract: libraryIpcContracts.renameChapter,
    schema: RenameChapterRequestSchema,
    idKey: "chapterId",
  },
])(
  "validates the optional folder-move choice for $kind renames",
  async ({ contract, schema, idKey }) => {
    const { trustedHandleContract } =
      await import("../src/main/ipc/trustedIpc");
    const rendererUrl = "http://127.0.0.1:5173/";
    const listener = vi.fn(
      (
        _event: IpcMainInvokeEvent,
        _id: string,
        _title: string,
        _moveResultFolders?: boolean,
      ) => ({ works: [], workOrder: [] }),
    );
    trustedHandleContract(
      {
        getMainWindow: () => ({
          isDestroyed: () => false,
          webContents: { id: 17, getURL: () => rendererUrl },
        }),
      },
      contract,
      listener,
    );
    const handler = electronBoundary.handlers.get(contract.channel);
    if (!handler) throw new Error("Missing rename handler");
    const event = {
      sender: { id: 17 },
      senderFrame: { url: rendererUrl },
    } as IpcMainInvokeEvent;
    const id = "11111111-1111-4111-8111-111111111111";
    for (const args of [
      [id, "title"],
      [id, "title", undefined],
      [id, "title", true],
      [id, "title", false],
    ]) {
      await expect(handler(event, ...args)).resolves.toEqual({
        works: [],
        workOrder: [],
      });
      expect(listener).toHaveBeenLastCalledWith(event, ...args);
    }
    expect(
      schema.parse({ [idKey]: id, title: "title", moveResultFolders: false })
        .moveResultFolders,
    ).toBe(false);
    for (const invalid of ["false", 0, null, {}]) {
      await expect(handler(event, id, "title", invalid)).rejects.toThrow();
      expect(
        schema.safeParse({
          [idKey]: id,
          title: "title",
          moveResultFolders: invalid,
        }).success,
      ).toBe(false);
    }
    await expect(
      handler(event, id, "title", false, "C:/untrusted"),
    ).rejects.toThrow();
    expect(
      schema.safeParse({
        [idKey]: id,
        title: "title",
        moveResultFolders: false,
        rootPath: "C:/untrusted",
      }).success,
    ).toBe(false);
    expect(listener).toHaveBeenCalledTimes(4);
  },
);
