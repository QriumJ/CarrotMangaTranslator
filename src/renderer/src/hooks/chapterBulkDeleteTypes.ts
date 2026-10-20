import type {
  DeleteChaptersFailure,
  LibraryWorkSummary,
} from "../../../shared/libraryTypes";

/** Outcome of the last run, shown in the dialog until the next run or close. */
export type ChapterBulkDeleteOutcome =
  | { kind: "partial"; deleted: number; failures: DeleteChaptersFailure[] }
  | { kind: "failed" };

export type ChapterBulkDeleteController = {
  work: LibraryWorkSummary | null;
  selectedIds: string[];
  busy: boolean;
  outcome: ChapterBulkDeleteOutcome | null;
  open: (workId: string) => void;
  close: () => void;
  toggle: (chapterId: string, checked: boolean, extend: boolean) => void;
  setAll: (checked: boolean) => void;
  submit: () => Promise<void>;
};
