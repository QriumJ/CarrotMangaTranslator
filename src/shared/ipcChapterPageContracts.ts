import { z } from "zod";
import {
  defineIpcContract,
  diagnosticString,
  MAX_ID_LIST_LENGTH,
  MAX_PAGES_PER_REQUEST,
  stringArg,
  titleString,
} from "./ipcContractCore";
import {
  ChapterSnapshotSchema,
  DeleteChaptersRequestSchema,
  LibraryIndexSchema,
  OpenChapterRequestSchema,
  SavePageBlocksRequestSchema,
  SavePagesBlocksRequestSchema,
} from "./ipcLibrarySchemas";
import type {
  ChapterSnapshot,
  ChapterPageMetadata,
  ChapterPagesPatch,
  DeleteChaptersRequest,
  DeleteChaptersResult,
} from "./libraryTypes";
import type {
  SavePageBlocksRequest,
  SavePagesBlocksRequest,
} from "./shareTypes";

// Select the validated page input fields before full-page normalization.
const ChapterPageMetadataSchema = ChapterSnapshotSchema.shape.pages.element.in
  .pick({
    id: true,
    name: true,
    imagePath: true,
    width: true,
    height: true,
    analysisStatus: true,
    createdAt: true,
    updatedAt: true,
  })
  .strict();
const ChapterPagesPatchSchema = ChapterSnapshotSchema.pick({
  id: true,
  workId: true,
  status: true,
  updatedAt: true,
  pageOrder: true,
  pages: true,
}).strict();

const DeleteChaptersFailureSchema = z
  .object({
    chapterId: stringArg,
    title: titleString,
    message: diagnosticString,
  })
  .strict();

export const chapterPageIpcContracts = {
  deleteChapters: defineIpcContract<
    [DeleteChaptersRequest],
    DeleteChaptersResult
  >({
    apiKey: "deleteChapters",
    channel: "library:delete-chapters",
    args: z.tuple([DeleteChaptersRequestSchema]),
    result: z
      .object({
        library: LibraryIndexSchema,
        deletedChapterIds: z.array(stringArg).max(MAX_ID_LIST_LENGTH),
        failures: z.array(DeleteChaptersFailureSchema).max(MAX_ID_LIST_LENGTH),
      })
      .strict(),
  }),
  getChapterPageMetadata: defineIpcContract<
    [string, string],
    ChapterPageMetadata[]
  >({
    apiKey: "getChapterPageMetadata",
    channel: "library:get-chapter-page-metadata",
    args: z.tuple([
      OpenChapterRequestSchema.shape.workId.unwrap(),
      OpenChapterRequestSchema.shape.chapterId,
    ]),
    result: z.array(ChapterPageMetadataSchema).max(MAX_PAGES_PER_REQUEST),
  }),
  savePagesBlocksPatch: defineIpcContract<
    [SavePagesBlocksRequest],
    ChapterPagesPatch
  >({
    apiKey: "savePagesBlocksPatch",
    channel: "library:save-pages-blocks-patch",
    args: z.tuple([SavePagesBlocksRequestSchema]),
    result: ChapterPagesPatchSchema,
  }),
  savePageBlocks: defineIpcContract<[SavePageBlocksRequest], ChapterSnapshot>({
    apiKey: "savePageBlocks",
    channel: "library:save-page-blocks",
    args: z.tuple([SavePageBlocksRequestSchema]),
    result: ChapterSnapshotSchema,
  }),
  savePagesBlocks: defineIpcContract<[SavePagesBlocksRequest], ChapterSnapshot>(
    {
      apiKey: "savePagesBlocks",
      channel: "library:save-pages-blocks",
      args: z.tuple([SavePagesBlocksRequestSchema]),
      result: ChapterSnapshotSchema,
    },
  ),
} as const;
