import React from "react";
import { useTranslation } from "react-i18next";
import type { MangaPage } from "../../../../shared/libraryTypes";
import { Modal } from "../ui/Modal";
import { PageWorkflowTimingView } from "./PageWorkflowTimingView";

export function PageTimingDialog({
  chapterId,
  onClose,
  pages,
  selectedPageId,
}: {
  chapterId: string | null;
  onClose: () => void;
  pages: MangaPage[];
  selectedPageId: string | null;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <Modal
      title={t("pageList.timing.title")}
      size="lg"
      maxHeight="660px"
      fillHeight
      bodyLayout="bare"
      onClose={onClose}
    >
      <div className="page-timing-dialog">
        <PageWorkflowTimingView
          chapterId={chapterId}
          pages={pages}
          selectedPageId={selectedPageId}
        />
      </div>
    </Modal>
  );
}
