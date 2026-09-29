import React from "react";

import type {
  CharacterProfile,
  GlossaryEntry,
} from "../../../shared/workContextTypes";

import { libraryGateway } from "../api/libraryGateway";

export function resolveGlossaryValidationMessage(
  draftMessage: string | null,
  required: boolean,
  glossary: ReturnType<typeof useBatchWorkContext>,
): string | null {
  return (
    draftMessage ??
    (required && !glossary.ready
      ? (glossary.error ?? "용어집을 불러오는 중입니다.")
      : null)
  );
}

export function useBatchWorkContext(workId: string | undefined) {
  const [glossary, setGlossary] = React.useState<{
    workId: string | undefined;
    entries: readonly GlossaryEntry[];
    characters: readonly CharacterProfile[];
    ready: boolean;
    error: string | null;
  }>({ workId, entries: [], characters: [], ready: !workId, error: null });
  React.useEffect(() => {
    let active = true;
    setGlossary({
      workId,
      entries: [],
      characters: [],
      ready: !workId,
      error: null,
    });
    if (!workId) {
      return;
    }
    void libraryGateway
      .getWorkStyleGuide(workId)
      .then((guide) => {
        if (active) {
          setGlossary({
            workId,
            entries: guide.glossary,
            characters: guide.characters,
            ready: true,
            error: null,
          });
        }
      })
      .catch(() => {
        if (active) {
          setGlossary({
            workId,
            entries: [],
            characters: [],
            ready: false,
            error:
              "용어집을 읽지 못했습니다. 일괄 편집 창을 다시 열어 재시도하세요.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [workId]);
  return glossary.workId === workId
    ? glossary
    : { workId, entries: [], characters: [], ready: !workId, error: null };
}
