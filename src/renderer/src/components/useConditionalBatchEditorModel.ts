import React from "react";
import { createConditionalBatchEditorView } from "./createConditionalBatchEditorView";

import { type ConditionalBatchSequenceV2 } from "../../../shared/conditionalBatchRules";

import { createConditionalBatchSpeakerCatalog } from "./conditionalBatchSpeakers";

import { useConditionalBatchSchemeController } from "./useConditionalBatchSchemeController";

import { useConditionalBatchTypography } from "./useConditionalBatchTypography";

import {
  ConditionalBatchEditorModel,
  ConditionalBatchEditorModelProps,
} from "./conditionalBatchEditorTypes";

import {
  resolveGlossaryValidationMessage,
  useBatchWorkContext,
} from "./useConditionalBatchWorkContext";

import { usePreviewController } from "./useConditionalBatchPreview";

import { useApplicationController } from "./useConditionalBatchApplication";

export function useConditionalBatchEditorModel(
  props: ConditionalBatchEditorModelProps,
): ConditionalBatchEditorModel {
  const glossary = useBatchWorkContext(props.workId);
  const speakers = React.useMemo(
    () =>
      createConditionalBatchSpeakerCatalog(
        props.chapter,
        glossary.characters,
        glossary.ready,
        glossary.error,
      ),
    [props.chapter, glossary.characters, glossary.ready, glossary.error],
  );
  const scheme = useConditionalBatchSchemeController({
    initialFind: props.initialFind,
    initialReplace: props.initialReplace,
    blockStylePresets: props.blockStylePresets,
  });
  const [activeSequenceId, setActiveSequenceId] = React.useState<string | null>(
    null,
  );
  const activeSequence =
    scheme.sequences.find((sequence) => sequence.id === activeSequenceId) ??
    null;
  const { typography, glossaryRequired } = useEditorTypography(
    props,
    scheme,
    activeSequence,
    glossary,
  );
  const validationMessage = resolveGlossaryValidationMessage(
    activeSequence ? null : scheme.validationMessage,
    glossaryRequired,
    glossary,
  );
  React.useEffect(() => {
    if (activeSequenceId && !activeSequence) setActiveSequenceId(null);
  }, [activeSequence, activeSequenceId]);
  const preview = usePreviewController(
    props,
    scheme.parsedDraft,
    typography,
    activeSequence,
    scheme.snapshot,
    activeSequence
      ? `sequence:${activeSequence.id}`
      : `scheme:${scheme.selectedSchemeId}`,
  );
  const busy = props.busy || scheme.storageBusy || !typography.ready;
  const application = useApplicationController({
    busy,
    excludedResultKeys: preview.excludedResultKeys,
    includedCount: preview.includedCount,
    parsedDraft: scheme.parsedDraft,
    preview: preview.preview,
    props,
    setApplyNotice: scheme.setApplyNotice,
    options: typography.options,
    activeSequence,
    sequencePreview: preview.sequencePreview,
    snapshot: scheme.snapshot,
  });
  return createConditionalBatchEditorView({
    props,
    scheme,
    preview,
    application,
    speakers,
    activeSequence,
    setActiveSequenceId,
    busy,
    validationMessage,
  });
}

function useEditorTypography(
  props: ConditionalBatchEditorModelProps,
  scheme: ReturnType<typeof useConditionalBatchSchemeController>,
  activeSequence: ConditionalBatchSequenceV2 | null,
  glossary: ReturnType<typeof useBatchWorkContext>,
) {
  const typographySchemes = React.useMemo(() => {
    if (activeSequence) {
      const ids = new Set(
        activeSequence.steps
          .filter((step) => step.enabled)
          .map((step) => step.schemeId),
      );
      return scheme.savedSchemes.filter((entry) => ids.has(entry.id));
    }
    return scheme.parsedDraft.success ? [scheme.parsedDraft.data] : [];
  }, [activeSequence, scheme.savedSchemes, scheme.parsedDraft]);
  const glossaryRequired = typographySchemes.some(
    (entry) =>
      entry.match.mode !== "allBlocks" &&
      [
        ...entry.match.conditions,
        ...entry.match.groups
          .filter((group) => group.enabled)
          .flatMap((group) => group.conditions),
      ].some(
        (condition) =>
          condition.enabled && condition.field === "glossaryMismatch",
      ),
  );
  const fontTypography = useConditionalBatchTypography(
    props.chapter,
    glossary.entries,
    typographySchemes,
  );
  const typography = {
    ...fontTypography,
    ready: fontTypography.ready && (!glossaryRequired || glossary.ready),
  };
  return { typography, glossaryRequired };
}
