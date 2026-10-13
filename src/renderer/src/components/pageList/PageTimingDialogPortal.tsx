import React from "react";
import { createPortal } from "react-dom";
import type { MangaPage } from "../../../../shared/libraryTypes";
import { PageTimingDialog } from "./PageTimingDialog";

/** Owns the page timing dialog's open state and its body-level portal. */
export function usePageTimingDialog({
  chapterId,
  pages,
  selectedPageId,
}: {
  chapterId: string | null;
  pages: MangaPage[];
  selectedPageId: string | null;
}): { dialog: React.ReactPortal | null; open: () => void } {
  const [isOpen, setOpen] = React.useState(false);
  const open = React.useCallback(() => setOpen(true), []);
  return {
    open,
    dialog: isOpen
      ? createPortal(
          <PageTimingDialog
            chapterId={chapterId}
            pages={pages}
            selectedPageId={selectedPageId}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )
      : null,
  };
}
