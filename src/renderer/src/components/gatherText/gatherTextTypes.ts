import type {
  ChapterSnapshot,
  MangaPage,
} from "../../../../shared/libraryTypes";
import type { BlockStylePreset } from "../../../../shared/blockStylePresets";
import type { GatherDirectFormatRequest } from "../../lib/gatherTextFormat";
import type { TranslatedTextImportUpdate } from "../../../../shared/gatherText";
import type {
  ImportReviewTextRequest,
  ImportReviewTextResult,
} from "../../../../shared/reviewTypes";

export type GatherTextModalProps = {
  blockStylePresets?: readonly BlockStylePreset[];
  chapter: ChapterSnapshot | null;
  page: MangaPage | null;
  onClose: () => void;
  onImportReviewText?: (
    request: ImportReviewTextRequest,
  ) => Promise<ImportReviewTextResult>;
  onApplyTranslatedText?: (
    updates: TranslatedTextImportUpdate[],
    expectedChapter: ChapterSnapshot,
  ) => void;
  onNavigateToBlock?: (pageId: string, blockId: string) => void;
  onOpenBatchEdit?: (initialFind?: string) => void;
  onApplyFormat?: (request: GatherDirectFormatRequest) => void;
  formatApplyDisabled?: boolean;
  readingDirection?: "ltr" | "rtl";
};
