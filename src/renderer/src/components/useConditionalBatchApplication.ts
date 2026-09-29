import React from "react";

import { useTranslation } from "react-i18next";

import { type ConditionalBatchEngineOptions } from "../../../shared/conditionalBatchEngine";

import {
  type ConditionalBatchPreview,
  type ConditionalBatchSequencePreview,
  type ConditionalBatchSequenceV2,
  type ConditionalBatchSnapshotV2,
} from "../../../shared/conditionalBatchRules";

import {
  type ConditionalBatchApplyNotice,
  type ConditionalBatchParsedDraft,
} from "./conditionalBatchSchemeDrafts";

import { ConditionalBatchEditorModelProps } from "./conditionalBatchEditorTypes";

export function useApplicationController({
  activeSequence,
  busy,
  excludedResultKeys,
  includedCount,
  parsedDraft,
  preview,
  props,
  setApplyNotice,
  options,
  sequencePreview,
  snapshot,
}: {
  activeSequence: ConditionalBatchSequenceV2 | null;
  busy: boolean;
  excludedResultKeys: ReadonlySet<string>;
  includedCount: number;
  parsedDraft: ConditionalBatchParsedDraft;
  preview: ConditionalBatchPreview;
  props: ConditionalBatchEditorModelProps;
  setApplyNotice: React.Dispatch<
    React.SetStateAction<ConditionalBatchApplyNotice>
  >;
  options: ConditionalBatchEngineOptions;
  sequencePreview: ConditionalBatchSequencePreview | null;
  snapshot: ConditionalBatchSnapshotV2;
}) {
  const { t } = useTranslation("components");
  const [conflictCount, setConflictCount] = React.useState(0);
  const apply = (): void => {
    if (busy || includedCount === 0 || preview.inspectionOnly) {
      return;
    }
    const outcome = activeSequence
      ? sequencePreview && props.onApplySequence
        ? props.onApplySequence(
            activeSequence,
            snapshot,
            sequencePreview,
            excludedResultKeys,
            options,
          )
        : null
      : parsedDraft.success
        ? props.onApply(parsedDraft.data, preview, excludedResultKeys, options)
        : null;
    if (!outcome) return;
    setConflictCount(outcome.conflictCount);
    const conflictsOnly =
      outcome.appliedCount === 0 && outcome.conflictCount > 0;
    setApplyNotice({
      kind: outcome.conflictCount > 0 ? "warning" : "success",
      message: conflictsOnly
        ? t("conditionalBatch.notice.conflictsOnly", {
            count: outcome.conflictCount,
          })
        : t("conditionalBatch.notice.applied", {
            applied: outcome.appliedCount,
            conflicts: outcome.conflictCount,
          }),
    });
  };
  const undo = (): void => {
    void props.onUndo().then((undone) => {
      if (undone) setConflictCount(0);
      setApplyNotice(
        undone
          ? { kind: "info", message: t("conditionalBatch.notice.undone") }
          : null,
      );
    });
  };
  return { apply, conflictCount, undo };
}
