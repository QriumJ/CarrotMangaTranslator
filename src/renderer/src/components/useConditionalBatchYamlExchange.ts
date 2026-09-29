import React from "react";
import { parseDocument, stringify } from "yaml";
import {
  formatConditionalBatchValidationIssue,
  formatConditionalBatchYamlSyntaxError,
} from "../../../shared/conditionalBatchErrorPresentation";
import {
  CONDITIONAL_BATCH_SCHEMA_VERSION,
  parseConditionalBatchSnapshot,
  type ConditionalBatchSchemeDraftV2,
  type ConditionalBatchSchemeV2,
  type ConditionalBatchSnapshotV2,
} from "../../../shared/conditionalBatchRules";
import { conditionalBatchGateway } from "../api/conditionalBatchGateway";
import {
  ConditionalBatchParsedDraft,
  copySavedSchemeAsDraft,
  readErrorMessage,
} from "./conditionalBatchSchemeDrafts";
type YamlExchangeOptions = {
  draft: ConditionalBatchSchemeDraftV2;
  parsedDraft: ConditionalBatchParsedDraft;
  stored: boolean;
  selectedSchemeId: string;
  runWithSavedDraft: (action: () => void | Promise<void>) => Promise<boolean>;
  setStorageBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setSnapshot: React.Dispatch<
    React.SetStateAction<ConditionalBatchSnapshotV2 | null>
  >;
  switchToSavedScheme: (scheme: ConditionalBatchSchemeV2) => void;
  changeDraft: (draft: ConditionalBatchSchemeDraftV2) => void;
};
type YamlExchangeContext = YamlExchangeOptions &
  ReturnType<typeof useYamlExchangeState>;
export function useConditionalBatchYamlExchange(options: YamlExchangeOptions) {
  const state = { ...useYamlExchangeState(), ...options };
  return {
    yamlOpen: state.yamlOpen,
    yamlText: state.yamlText,
    yamlError: state.yamlError,
    setYamlOpen: state.setYamlOpen,
    setYamlText: state.setYamlText,
    setYamlError: state.setYamlError,
    openYamlEditor: () => openYamlEditor(state),
    reflectYamlInDraft: () => reflectYamlInDraft(state),
    exportYaml: (all: boolean) => exportYaml(state, all),
    openYamlFile: () => openYamlFile(state),
    importYaml: (policy?: "duplicate" | "overwrite") =>
      importYaml(state, policy),
  };
}
function useYamlExchangeState() {
  const [yamlOpen, setYamlOpen] = React.useState(false);
  const [yamlText, setYamlText] = React.useState("");
  const [yamlError, setYamlError] = React.useState<string | null>(null);
  return {
    yamlOpen,
    yamlText,
    yamlError,
    setYamlOpen,
    setYamlText,
    setYamlError,
  };
}
function serializeDraftYaml(draft: ConditionalBatchSchemeDraftV2): string {
  return stringify(
    {
      schemaVersion: CONDITIONAL_BATCH_SCHEMA_VERSION,
      schemes: [{ id: "draft:export", ...draft }],
      sequences: [],
    },
    { indent: 2, lineWidth: 100 },
  );
}

async function openYamlEditor(state: YamlExchangeContext): Promise<void> {
  const {
    setYamlOpen,
    setYamlError,
    parsedDraft,
    setYamlText,
    stored,
    selectedSchemeId,
  } = state;
  setYamlOpen(true);
  setYamlError(null);
  if (!parsedDraft.success) {
    setYamlText("");
    setYamlError(
      formatConditionalBatchValidationIssue(parsedDraft.error.issues[0]) ??
        "규칙을 확인하세요.",
    );
    return;
  }
  setYamlText(
    stringify(
      {
        schemaVersion: CONDITIONAL_BATCH_SCHEMA_VERSION,
        schemes: [
          {
            id: stored ? selectedSchemeId : "draft:yaml",
            ...parsedDraft.data,
          },
        ],
        sequences: [],
      },
      { indent: 2, lineWidth: 100 },
    ),
  );
}

function reflectYamlInDraft(state: YamlExchangeContext): void {
  const { yamlText, changeDraft, setYamlError } = state;
  try {
    const document = parseDocument(yamlText, {
      customTags: [],
      merge: false,
      prettyErrors: true,
      schema: "core",
      strict: true,
      uniqueKeys: true,
    });
    if (document.errors.length > 0) {
      throw new Error(
        formatConditionalBatchYamlSyntaxError(document.errors[0]),
      );
    }
    const parsed = parseConditionalBatchSnapshot(
      document.toJS({ maxAliasCount: 0 }),
    ).snapshot;
    const first = parsed.schemes[0];
    if (!first) throw new Error("YAML에 규칙이 없습니다.");
    changeDraft(copySavedSchemeAsDraft(first));
    setYamlError(null);
  } catch (error) {
    setYamlError(readErrorMessage(error));
  }
}

async function exportYaml(
  state: YamlExchangeContext,
  all: boolean,
): Promise<void> {
  const {
    runWithSavedDraft,
    stored,
    parsedDraft,
    selectedSchemeId,
    setYamlText,
    draft,
    setYamlError,
  } = state;
  await runWithSavedDraft(async () => {
    const value =
      !all && !stored && parsedDraft.success
        ? serializeDraftYaml(parsedDraft.data)
        : await conditionalBatchGateway.exportConditionalBatchYaml(
            all ? {} : { ids: [selectedSchemeId] },
          );
    setYamlText(value);
    await conditionalBatchGateway.saveConditionalBatchYamlFile({
      yaml: value,
      defaultName: all ? "batch-edit-schemes.yaml" : `${draft.name}.yaml`,
    });
    setYamlError(null);
  });
}

async function openYamlFile(state: YamlExchangeContext): Promise<void> {
  const { setStorageBusy, setYamlError, setYamlText, setYamlOpen } = state;
  setStorageBusy(true);
  setYamlError(null);
  try {
    const result = await conditionalBatchGateway.openConditionalBatchYamlFile();
    if (!result) return;
    setYamlText(result.yaml);
    setYamlOpen(true);
  } catch (error) {
    setYamlError(readErrorMessage(error));
    setYamlOpen(true);
  } finally {
    setStorageBusy(false);
  }
}

async function importYaml(
  state: YamlExchangeContext,
  conflictPolicy: "duplicate" | "overwrite" = "duplicate",
): Promise<void> {
  const {
    setYamlError,
    runWithSavedDraft,
    yamlText,
    setSnapshot,
    stored,
    selectedSchemeId,
    switchToSavedScheme,
    setYamlOpen,
  } = state;
  setYamlError(null);
  await runWithSavedDraft(async () => {
    try {
      const next = await conditionalBatchGateway.importConditionalBatchYaml({
        yaml: yamlText,
        conflictPolicy,
      });
      setSnapshot(next);
      const selected = stored
        ? next.schemes.find((entry) => entry.id === selectedSchemeId)
        : undefined;
      if (selected) switchToSavedScheme(selected);
      setYamlOpen(false);
    } catch (error) {
      setYamlError(readErrorMessage(error));
    }
  });
}
