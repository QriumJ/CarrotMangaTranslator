import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IpcContext } from "../src/main/ipc/context";
import { registerPageWorkflowIpc } from "../src/main/ipc/pageWorkflowIpc";
import {
  preparePageWorkflowRun,
  readPageWorkflowRun,
} from "../src/main/pageWorkflowRunStore";
import { createPageWorkflowPlan } from "../src/shared/pageWorkflowTypes";

type Handler = (event: unknown, request: unknown) => Promise<unknown>;
const boundary = vi.hoisted(() => ({ handlers: new Map<string, Handler>() }));
vi.mock("electron", () => ({
  app: { isPackaged: false },
  ipcMain: {
    handle: (channel: string, handler: Handler) =>
      boundary.handlers.set(channel, handler),
  },
  nativeImage: {},
  shell: {},
}));

const roots: string[] = [];
beforeEach(() => boundary.handlers.clear());
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});

describe("page workflow IPC resume binding", () => {
  it("rejects another chapter or page before opening a persisted resume target", async () => {
    const { root, request, run } = await fixture();
    for (const selection of [
      [{ chapterId: randomUUID(), pageIds: request.selection[0].pageIds }],
      [{ chapterId: request.selection[0].chapterId, pageIds: [randomUUID()] }],
    ]) {
      await expect(
        invoke("page-workflow:preflight", {
          ...request,
          selection,
          resumeRunId: run.id,
        }),
      ).rejects.toThrow(/대상/);
    }
    // No chapter is seeded: trying to open either target would fail with ENOENT.
    expect(await readPageWorkflowRun(root, run.id)).toEqual(run);
  });

  it("returns the persisted selection through the validated resume contract", async () => {
    const { request, run } = await fixture();
    await expect(invoke("page-workflow:get-run", run.id)).resolves.toEqual({
      ...request,
      resumeRunId: run.id,
    });
  });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "workflow-ipc-resume-"));
  roots.push(root);
  const request = {
    plan: createPageWorkflowPlan(["ocr"]),
    selection: [{ chapterId: randomUUID(), pageIds: [randomUUID()] }],
  };
  const run = await preparePageWorkflowRun(root, request);
  const context: IpcContext = Object.create(null);
  context.appPaths = { dataRoot: root } as IpcContext["appPaths"];
  context.getMainWindow = () =>
    ({
      isDestroyed: () => false,
      webContents: { id: 1, getURL: () => "http://127.0.0.1:5173/" },
    }) as ReturnType<IpcContext["getMainWindow"]>;
  registerPageWorkflowIpc(context);
  return { root, request, run };
}

function invoke(channel: string, request: unknown) {
  const handler = boundary.handlers.get(channel);
  if (!handler) throw new Error(`Missing IPC handler: ${channel}`);
  return handler(
    { sender: { id: 1 }, senderFrame: { url: "http://127.0.0.1:5173/" } },
    request,
  );
}
