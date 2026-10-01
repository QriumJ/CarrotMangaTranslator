import type {
  CreateImportRequest,
  CreateImportResult,
} from "../../shared/importTypes";
import type { IpcContext } from "./context";

export async function connectImportedChapters(
  context: Pick<IpcContext, "linkedWorkspaceSync">,
  command: CreateImportRequest,
  result: CreateImportResult,
): Promise<
  Pick<
    CreateImportResult,
    "linkedWorkspaceConnectedChapterIds" | "linkedWorkspaceWarning"
  >
> {
  if (command.target.mode === "chapter")
    return refreshImportedChapter(context, command.target.chapterId);
  const options = command.linkedWorkspace;
  if (!options?.enabled) return {};
  const service = context.linkedWorkspaceSync;
  if (!service) {
    return {
      linkedWorkspaceWarning: "실시간 결과 폴더 서비스를 시작하지 못했습니다.",
    };
  }
  const connected: string[] = [];
  try {
    for (const chapterId of result.chapterIds) {
      await service.connect({
        workId: result.workId,
        chapterId,
        destinationKind: "managed",
        output: {
          format: options.outputFormat,
          jpegQuality: options.jpegQuality,
          webpQuality: options.webpQuality,
          preserveSourceNames: true,
          destinationMode: "fixed",
          collisionPolicy: "replace",
        },
        enqueueExistingPages: false,
      });
      connected.push(chapterId);
    }
    return { linkedWorkspaceConnectedChapterIds: connected };
  } catch (error) {
    return {
      ...(connected.length > 0
        ? { linkedWorkspaceConnectedChapterIds: connected }
        : {}),
      linkedWorkspaceWarning:
        error instanceof Error ? error.message : String(error),
    };
  }
}

async function refreshImportedChapter(
  context: Pick<IpcContext, "linkedWorkspaceSync">,
  chapterId: string,
) {
  const service = context.linkedWorkspaceSync;
  if (!service) return {};
  try {
    const connectionId = service.getStatus(chapterId).connectionId;
    if (connectionId) await service.update({ connectionId });
    return {};
  } catch (error) {
    return {
      linkedWorkspaceWarning:
        error instanceof Error ? error.message : String(error),
    };
  }
}
