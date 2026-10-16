import { describe, expect, it, vi } from "vitest";
import { ActiveJobStore } from "../src/main/jobs/activeJob";
import { createJobEventEmitter } from "../src/main/jobs/jobEvents";
import { parsePageResponse } from "../src/main/pipeline/pageResponseParser";
import { serializeLogDetail } from "../src/main/logger";
import { makePage } from "./helpers/workspacePointerFixtures";
import type { TranslationOptions } from "../src/main/appSettings";
import type { TranslationRuntimePort } from "../src/main/pipeline/translationRuntimePort";
import { resolveDefaultAppSettings } from "../src/main/settings/appSettingsDefaults";
import {
  summarizeTranslationOptions,
  summarizePreview,
} from "../src/main/pipeline/options";

const overlayTools =
  require("../src/main/runtime/overlay-parser.cjs") as TranslationRuntimePort;

describe("report execution evidence", () => {
  it("keeps bounded local option previews out of serialized public diagnostics", () => {
    expect(summarizePreview("  short\n text  ")).toBe("short text");
    const summary = summarizeTranslationOptions({
      promptOverrideText: "PRIVATE_PROMPT ".repeat(100),
    } as TranslationOptions);
    expect(String(summary.promptOverrideText)).toHaveLength(600);
    expect(serializeLogDetail(summary)).not.toContain("PRIVATE_PROMPT");
  });
  it("captures execution settings independently of later changes and excludes credentials", () => {
    const settings = resolveDefaultAppSettings(
      { MANGA_TRANSLATOR_MODEL_PROVIDER: "openai-api" },
      null,
    );
    settings.api.model = "actual-execution-model";
    settings.api.apiKey = "PRIVATE_KEY";
    settings.api.customHeadersJson = '{"Authorization":"PRIVATE_HEADER"}';
    const jobs = new ActiveJobStore({ error: vi.fn(), info: vi.fn() });
    jobs.start({
      id: "run",
      kind: "gemma-analysis",
      abortController: new AbortController(),
    });
    jobs.run("run", () => undefined, settings);
    settings.api.model = "different-later-model";
    const snapshot = JSON.stringify(jobs.reportDiagnostics.snapshot());
    expect(snapshot).toContain("actual-execution-model");
    expect(snapshot).toContain('"maxTokens"');
    expect(snapshot).not.toMatch(/PRIVATE|different-later-model/);
    jobs.clearIfCurrent("run");
  });
  it("retains cancellation, last running phase and separate resumed execution IDs", () => {
    const jobs = new ActiveJobStore({ error: vi.fn(), info: vi.fn() });
    const writeLog = vi.fn();
    const emit = createJobEventEmitter({ writeLog, validateEvent: vi.fn() });
    for (const executionId of ["attempt-1", "attempt-2"]) {
      const controller = new AbortController();
      jobs.start({
        id: "run-1",
        kind: "gemma-analysis",
        abortController: controller,
      });
      emit(jobs, null, {
        id: "run-1",
        executionId,
        kind: "gemma-analysis",
        status: "running",
        phase: "model_requesting",
        progressText: "request",
        progressCurrent: 3,
        progressTotal: 100,
      });
      controller.abort();
      expect(jobs.reportDiagnostics.snapshot()[0]).toMatchObject({
        active: true,
        cancelRequestedAt: expect.any(String),
        lastProgressAgeMs: expect.any(Number),
      });
      emit(jobs, null, {
        id: "run-1",
        executionId,
        kind: "gemma-analysis",
        status: "cancelled",
        phase: "cancelled",
        progressText: "cancelled",
      });
      jobs.clearIfCurrent("run-1");
      expect(writeLog).toHaveBeenCalledWith(
        "warn",
        "job:gemma-analysis:cancelled",
        expect.objectContaining({ executionId }),
      );
    }
    const records = jobs.reportDiagnostics.snapshot();
    expect(records.map((row) => row.executionId)).toEqual([
      "attempt-2",
      "attempt-1",
    ]);
    expect(records[0]).toMatchObject({
      active: false,
      lastRunningPhase: "model_requesting",
      progressCurrent: 3,
      progressTotal: 100,
    });
  });

  it("keeps response structure but never includes text in parser exceptions or serialized causes", () => {
    const privateText = "PRIVATE_MODEL_CONTENT";
    let caught: unknown;
    try {
      parsePageResponse({
        runtime: overlayTools,
        result: {
          outputText: JSON.stringify({ item: [{ ko: privateText }] }),
          rawResponse: {},
          requestBody: {},
        },
        page: makePage(),
        pageOptions: { regionCropMode: true } as TranslationOptions,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const serialized = serializeLogDetail(caught);
    expect(serialized).not.toContain(privateText);
    expect(serialized).toContain("array(1)");
    expect(serialized).toContain("region-single-item");
  });
});
