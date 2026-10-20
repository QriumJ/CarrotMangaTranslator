import { dialog } from "electron";
import { readFile, stat, writeFile } from "node:fs/promises";
import {
  SaveTextFileRequestSchema,
  parseIpcPayload,
} from "../../shared/ipcSchemas";
import { textReviewIpcContracts } from "../../shared/ipcContracts";
import { workGlossaryIpcContracts } from "../../shared/ipcWorkGlossaryContracts";
import { MAX_WORK_GLOSSARY_FILE_BYTES } from "../../shared/workGlossaryFile";
import type { SaveTextFileResult } from "../../shared/shareTypes";
import {
  getRecentDialogDirectory,
  getRecentDialogFileDefaultPath,
  recentDialogPathKeys,
  rememberRecentDialogFile,
} from "../recentDialogPaths";
import type { IpcContext } from "./context";
import { tMain } from "./localization";
import { trustedHandleContract } from "./trustedIpc";

function sanitizeTextFileName(name: string): string {
  const base = name
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const safe = base.length > 0 ? base : "manga-text";
  return safe.toLowerCase().endsWith(".txt") ? safe : `${safe}.txt`;
}

export function registerTextExportIpc(context: IpcContext): void {
  trustedHandleContract(
    context,
    textReviewIpcContracts.saveTextFile,
    async (_event, rawRequest: unknown): Promise<SaveTextFileResult | null> => {
      const request = parseIpcPayload(
        SaveTextFileRequestSchema,
        rawRequest,
        tMain("ipc.labels.textSave"),
      );
      const defaultName = sanitizeTextFileName(request.defaultName);
      const options = {
        title: tMain("dialogs.saveText"),
        defaultPath: getRecentDialogFileDefaultPath(
          context.appPaths.dataRoot,
          recentDialogPathKeys.plainTextExport,
          defaultName,
        ),
        filters: [{ name: tMain("dialogs.filters.text"), extensions: ["txt"] }],
      } satisfies Electron.SaveDialogOptions;
      const window = context.getMainWindow();
      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) {
        return null;
      }
      const filePath = result.filePath.toLowerCase().endsWith(".txt")
        ? result.filePath
        : `${result.filePath}.txt`;
      await writeFile(filePath, request.content, "utf8");
      rememberRecentDialogFile(
        context.appPaths.dataRoot,
        recentDialogPathKeys.plainTextExport,
        filePath,
      );
      return { saved: true, path: filePath };
    },
  );
}

/** Term file dialogs only; parsing and merging stay in the reviewed renderer draft. */
export function registerWorkGlossaryFileIpc(context: IpcContext): void {
  trustedHandleContract(
    context,
    workGlossaryIpcContracts.openWorkGlossaryFile,
    () => openWorkGlossaryFile(context),
  );
  trustedHandleContract(
    context,
    workGlossaryIpcContracts.saveWorkGlossaryFile,
    (_event, input) => saveWorkGlossaryFile(context, input),
  );
}

async function openWorkGlossaryFile(context: IpcContext) {
  const window = context.getMainWindow();
  const options = {
    title: tMain("dialogs.openWorkGlossary"),
    defaultPath: getRecentDialogDirectory(
      context.appPaths.dataRoot,
      recentDialogPathKeys.workGlossaryFile,
    ),
    properties: ["openFile"],
    filters: [jsonDialogFilter()],
  } satisfies Electron.OpenDialogOptions;
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  const filePath = result.filePaths[0];
  if (result.canceled || !filePath) return null;
  if ((await stat(filePath)).size > MAX_WORK_GLOSSARY_FILE_BYTES) {
    return { path: filePath, tooLarge: true as const };
  }
  const content = await readFile(filePath, "utf8");
  rememberWorkGlossaryPath(context, filePath);
  return { path: filePath, content };
}

async function saveWorkGlossaryFile(
  context: IpcContext,
  input: { defaultName: string; content: string },
) {
  const window = context.getMainWindow();
  const options = {
    title: tMain("dialogs.saveWorkGlossary"),
    defaultPath: getRecentDialogFileDefaultPath(
      context.appPaths.dataRoot,
      recentDialogPathKeys.workGlossaryFile,
      sanitizeJsonFileName(input.defaultName),
    ),
    filters: [jsonDialogFilter()],
  } satisfies Electron.SaveDialogOptions;
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return null;
  const filePath = /\.json$/iu.test(result.filePath)
    ? result.filePath
    : `${result.filePath}.json`;
  await writeFile(filePath, input.content, "utf8");
  rememberWorkGlossaryPath(context, filePath);
  return { saved: true as const, path: filePath };
}

function jsonDialogFilter(): Electron.FileFilter {
  return { name: tMain("dialogs.filters.json"), extensions: ["json"] };
}

function rememberWorkGlossaryPath(context: IpcContext, filePath: string): void {
  rememberRecentDialogFile(
    context.appPaths.dataRoot,
    recentDialogPathKeys.workGlossaryFile,
    filePath,
  );
}

function sanitizeJsonFileName(name: string): string {
  const base = name
    .replace(/[\\/:*?"<>|]+/gu, "_")
    .replace(/\s+/gu, " ")
    .trim();
  const safe = base || "glossary";
  return /\.json$/iu.test(safe) ? safe : `${safe}.json`;
}
