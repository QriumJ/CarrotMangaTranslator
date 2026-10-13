import type {
  ImportCreateSelection,
  ImportTarget,
} from "../../../shared/importTypes";
import type { LinkedWorkspaceImportOptions } from "../../../shared/linkedWorkspaceTypes";

export type TranslateSourceMode = "images" | "folder" | "zip" | "pdf" | "web";

export type ImportModalFeedback = {
  message: string;
  variant: "danger" | "info";
};

export type ImportModalSubmit = {
  translateAddedPages?: boolean;
  /** Renderer-only: open translation settings after a batch import. */
  openTranslationAfterImport?: boolean;
  /** Sent only for an existing-work target. */
  skipDuplicateChapterTitles?: boolean;
  target: ImportTarget;
  selections: ImportCreateSelection[];
  linkedWorkspace?: LinkedWorkspaceImportOptions;
};
