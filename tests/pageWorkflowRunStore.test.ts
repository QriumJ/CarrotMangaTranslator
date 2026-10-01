import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ConditionalBatchSchemeStore } from "../src/main/conditionalBatchSchemeStore";
import {
  preparePageWorkflowRun,
  readPageWorkflowRun,
} from "../src/main/pageWorkflowRunStore";
import { createBlankBatchSchemeDraft } from "../src/shared/conditionalBatchRules";
import {
  freezeWorkflowRules,
  workflowRuleEffects,
} from "../src/shared/pageWorkflowRules";
import { createPageWorkflowPlan } from "../src/shared/pageWorkflowTypes";
import {
  initialPageWorkflowPlan,
  normalizePageWorkflowUi,
} from "../src/shared/pageWorkflowSettings";
import { workflowConfigurationKeys } from "../src/main/pageWorkflow/pageWorkflowConfiguration";
import { resolveDefaultAppSettings } from "../src/main/appSettings";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

describe("durable page workflow plans", () => {
  it("captures instructions once for an older run, and skips context reads for non-translation stages", async () => {
    const root = await mkdtemp(
      join(tmpdir(), "page-workflow-legacy-instructions-"),
    );
    roots.push(root);
    const request = {
      plan: createPageWorkflowPlan(["translate"]),
      selection: [{ chapterId: randomUUID(), pageIds: [randomUUID()] }],
    };
    const original = {
      workId: randomUUID(),
      prompt: "Keep punctuation.",
      characters: [],
    };
    const legacy = await preparePageWorkflowRun(root, request);
    const resumed = await preparePageWorkflowRun(
      root,
      { ...request, resumeRunId: legacy.id },
      async () => original,
    );
    expect((await readPageWorkflowRun(root, legacy.id)).instructions).toEqual({
      [request.selection[0].chapterId]: original,
    });
    const resumedAgain = await preparePageWorkflowRun(
      root,
      { ...request, resumeRunId: legacy.id },
      async () => {
        throw new Error("must reuse the saved prompt");
      },
    );
    expect(resumedAgain.instructions).toEqual(resumed.instructions);
    const ocr = await preparePageWorkflowRun(
      root,
      { ...request, plan: createPageWorkflowPlan(["ocr"]) },
      async () => {
        throw new Error("OCR does not read translation instructions");
      },
    );
    expect(ocr.instructions).toEqual({});
  });

  it("reuses the original work prompt after defaults change and snapshots a fresh run separately", async () => {
    const root = await mkdtemp(join(tmpdir(), "page-workflow-instructions-"));
    roots.push(root);
    const request = {
      plan: createPageWorkflowPlan(["translate"]),
      selection: [{ chapterId: randomUUID(), pageIds: [randomUUID()] }],
    };
    const original = {
      workId: randomUUID(),
      prompt: "마침표 생략",
      characters: [],
    };
    const run = await preparePageWorkflowRun(
      root,
      request,
      async () => original,
    );
    const changed = { ...original, prompt: "마침표 유지" };
    const resumed = await preparePageWorkflowRun(
      root,
      { ...request, resumeRunId: run.id },
      async () => changed,
    );
    expect(resumed.instructions?.[request.selection[0].chapterId]).toEqual(
      original,
    );
    const fresh = await preparePageWorkflowRun(
      root,
      request,
      async () => changed,
    );
    expect(fresh.instructions?.[request.selection[0].chapterId]).toEqual(
      changed,
    );
  });
  it("refuses a resume request that silently redirects work to a different page or chapter", async () => {
    const root = await mkdtemp(join(tmpdir(), "page-workflow-binding-"));
    roots.push(root);
    const request = {
      plan: createPageWorkflowPlan(["ocr"]),
      selection: [{ chapterId: randomUUID(), pageIds: [randomUUID()] }],
    };
    const run = await preparePageWorkflowRun(root, request);
    for (const selection of [
      [{ chapterId: randomUUID(), pageIds: request.selection[0].pageIds }],
      [{ chapterId: request.selection[0].chapterId, pageIds: [randomUUID()] }],
    ]) {
      await expect(
        preparePageWorkflowRun(root, {
          ...request,
          selection,
          resumeRunId: run.id,
        }),
      ).rejects.toThrow(/대상/);
    }
    expect(await readPageWorkflowRun(root, run.id)).toEqual(run);
    expect(
      await preparePageWorkflowRun(root, { ...request, resumeRunId: run.id }),
    ).toEqual(run);
  });

  it("freezes ordered rules and reloads the original run after stored rules change", async () => {
    const root = await mkdtemp(join(tmpdir(), "page-workflow-run-"));
    roots.push(root);
    const store = new ConditionalBatchSchemeStore(root);
    const snapshot = await store.save({
      scheme: {
        ...createBlankBatchSchemeDraft(),
        name: "원문 수정",
        actions: [
          {
            id: "set-source",
            enabled: true,
            type: "setFields",
            changes: [{ field: "sourceText", operation: "set", value: "교정" }],
          },
        ],
      },
    });
    const scheme = snapshot.schemes.find((item) => item.name === "원문 수정");
    if (!scheme) throw new Error("Missing fixture");
    await store.saveSequence({
      id: "ordered",
      name: "순서",
      description: "",
      steps: [
        { id: "first", schemeId: scheme.id, enabled: true },
        { id: "second", schemeId: scheme.id, enabled: true },
      ],
    });
    const plan = {
      ...createPageWorkflowPlan(["ocr"]),
      stages: ["source-rules" as const],
      rules: { "source-rules": { kind: "sequence" as const, id: "ordered" } },
    };
    const request = {
      plan,
      selection: [{ chapterId: randomUUID(), pageIds: [randomUUID()] }],
    };
    const run = await preparePageWorkflowRun(root, request);
    expect(run.rules["source-rules"]).toHaveLength(2);
    expect(workflowRuleEffects(run.rules)[0].fields).toEqual(["sourceText"]);
    await store.save({
      id: scheme.id,
      scheme: {
        ...createBlankBatchSchemeDraft(),
        name: "이후 수정",
        actions: [],
      },
    });
    expect(await readPageWorkflowRun(root, run.id)).toEqual(run);
    expect(
      await preparePageWorkflowRun(root, {
        ...request,
        plan: createPageWorkflowPlan(["erase"]),
        resumeRunId: run.id,
      }),
    ).toEqual(run);
    expect((await preparePageWorkflowRun(root, request)).id).not.toBe(run.id);
  });

  it("rejects a rule at the wrong text stage instead of converting its target", () => {
    const scheme = {
      ...createBlankBatchSchemeDraft(),
      id: "target-rule",
      actions: [
        {
          id: "set-target",
          enabled: true,
          type: "setFields" as const,
          changes: [
            {
              field: "translatedText" as const,
              operation: "set" as const,
              value: "번역",
            },
          ],
        },
      ],
    };
    const plan = {
      ...createPageWorkflowPlan(["ocr"]),
      stages: ["source-rules" as const],
      rules: { "source-rules": { kind: "scheme" as const, id: scheme.id } },
    };
    expect(() =>
      freezeWorkflowRules(plan, {
        schemaVersion: 1,
        schemes: [scheme],
        sequences: [],
      }),
    ).toThrow(/원문만/);
  });

  it("migrates Hayai defaults and clamps reading size without changing typesetting defaults", () => {
    const plan = initialPageWorkflowPlan({
      blockModeDefault: "keep",
      autoFontMatchingDefault: false,
      aiFontSizeMatchingDefault: false,
      eraseOriginalWorkflowDefault: false,
      translationWorkflowDefault: "standard",
    });
    expect(plan.stages).toEqual(["ocr", "translate", "review"]);
    expect(plan.cumulative).toBe(false);
    expect(normalizePageWorkflowUi({}).blockReadingSize).toBe(15);
    expect(
      normalizePageWorkflowUi({ blockReadingSize: 100 }).blockReadingSize,
    ).toBe(24);
    expect(
      normalizePageWorkflowUi({ blockReadingSize: 2 }).blockReadingSize,
    ).toBe(12);
  });

  it("reconsiders only settings-dependent stages and ignores authentication/UI changes", () => {
    const settings = resolveDefaultAppSettings({});
    const before = workflowConfigurationKeys(settings);
    settings.api.apiKey = "changed-credential";
    settings.ui = { blockReadingSize: 24 };
    expect(workflowConfigurationKeys(settings)).toEqual(before);
    settings.translation = { sourceLanguage: "ja", targetLanguage: "en" };
    const after = workflowConfigurationKeys(settings);
    expect(after.erase).toBe(before.erase);
    expect(after.ocr).toBe(before.ocr);
    expect(after.translate).not.toBe(before.translate);
  });
});
