import React from "react";
import type { RenameTarget } from "../lib/libraryRenameTypes";
import { RenameModal } from "./RenameModal";

/** Name editing is independent from work actions and inline chapter selection. */
export function LibraryEditModals({
  onCancelRename,
  onSubmitRename,
  renameBusy,
  renameTarget,
}: {
  onCancelRename: () => void;
  onSubmitRename: (title: string) => void;
  renameBusy: boolean;
  renameTarget: RenameTarget | null;
}): React.JSX.Element {
  return (
    <>
      {renameTarget ? (
        <RenameModal
          kind={renameTarget.kind}
          initialTitle={renameTarget.title}
          busy={renameBusy}
          onCancel={onCancelRename}
          onSubmit={onSubmitRename}
        />
      ) : null}
    </>
  );
}
