/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorReportContextSchema } from "../src/shared/errorReportSchemas";
import {
  closeErrorReport,
  getErrorReportIncident,
  openErrorReport,
  openManualErrorReport,
  resetErrorReportStoreForTests,
  initializeGlobalErrorReporting,
} from "../src/renderer/src/lib/errorReportStore";
import { createTestMangaGatewayStub } from "../src/renderer/src/api/mangaGateway";

describe("error report incident store", () => {
  it("reports global Error, string and structured rejection inputs within the IPC contract", async () => {
    const writeLog = vi.fn(async () => ({ logged: true }));
    window.mangaApi = createTestMangaGatewayStub({
      writeLog,
      onErrorIncident: () => () => undefined,
    });
    initializeGlobalErrorReporting();
    window.dispatchEvent(
      new ErrorEvent("error", { error: new Error("한".repeat(1200)) }),
    );
    expect(
      ErrorReportContextSchema.safeParse(getErrorReportIncident()).success,
    ).toBe(true);
    expect(getErrorReportIncident()?.summary).toHaveLength(1000);
    closeErrorReport();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    for (const reason of [
      "rejected string",
      { code: "MODEL_FAILED" },
      circular,
    ]) {
      const event = new Event("unhandledrejection");
      Object.defineProperty(event, "reason", { value: reason });
      window.dispatchEvent(event);
      expect(getErrorReportIncident()?.source).toBe("renderer-global");
      expect(
        ErrorReportContextSchema.safeParse(getErrorReportIncident()).success,
      ).toBe(true);
      closeErrorReport();
    }
    await Promise.resolve();
    expect(writeLog).toHaveBeenCalledTimes(4);
  });
  afterEach(() => {
    resetErrorReportStoreForTests();
    vi.useRealTimers();
  });

  it("surfaces an incident that arrived while a report was already open", () => {
    expect(
      openErrorReport({ source: "renderer-global", message: "first" }),
    ).toBe(true);
    // Returns false because it is not shown yet, but it must not be dropped:
    // a crash raised while a report is open is exactly what the user is chasing.
    expect(openErrorReport({ source: "main-process", message: "second" })).toBe(
      false,
    );

    closeErrorReport();
    expect(getErrorReportIncident()).toMatchObject({
      source: "main-process",
      message: "second",
    });

    closeErrorReport();
    expect(getErrorReportIncident()).toBeNull();
  });

  it("bounds the queue and ignores incidents already waiting", () => {
    expect(
      openErrorReport({ source: "renderer-global", message: "open" }),
    ).toBe(true);
    for (let index = 0; index < 8; index += 1) {
      openErrorReport({ source: "main-process", message: `queued ${index}` });
    }
    openErrorReport({ source: "main-process", message: "queued 0" });

    const drained: (string | undefined)[] = [];
    for (let index = 0; index < 6; index += 1) {
      closeErrorReport();
      drained.push(getErrorReportIncident()?.message);
    }
    expect(drained).toEqual([
      "queued 0",
      "queued 1",
      "queued 2",
      "queued 3",
      undefined,
      undefined,
    ]);
  });

  it("keeps one active incident and normalizes oversized renderer details", () => {
    expect(
      openErrorReport({
        source: "renderer-global",
        summary: "한".repeat(1001),
        message: "m".repeat(17_000),
        stack: "s".repeat(33_000),
        jobStage: "x".repeat(501),
        jobId: "run-1",
        executionId: "attempt-2",
      }),
    ).toBe(true);
    expect(
      openErrorReport({
        source: "main-process",
        message: "second",
      }),
    ).toBe(false);

    expect(getErrorReportIncident()).toMatchObject({
      source: "renderer-global",
      summary: `${"한".repeat(999)}…`,
      message: `${"m".repeat(15_999)}…`,
      stack: `${"s".repeat(31_999)}…`,
      jobId: "run-1",
      executionId: "attempt-2",
    });
    expect(
      ErrorReportContextSchema.safeParse(getErrorReportIncident()).success,
    ).toBe(true);
  });

  it("deduplicates automatic incidents for 30 seconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const context = {
      source: "renderer-global" as const,
      message: "same failure",
      stack: "Error: same failure\n at app.ts:1",
    };

    expect(openErrorReport(context)).toBe(true);
    closeErrorReport();
    expect(openErrorReport(context)).toBe(false);

    vi.advanceTimersByTime(30_000);
    expect(openErrorReport(context)).toBe(true);
  });

  it("allows explicit manual or toast actions to reopen a report", () => {
    const context = {
      source: "job-failure" as const,
      message: "job failed",
    };
    expect(openErrorReport(context)).toBe(true);
    closeErrorReport();
    expect(openErrorReport(context, { force: true })).toBe(true);
  });

  it("opens the shared report window without requiring an automatic incident", () => {
    expect(openManualErrorReport()).toBe(true);
    expect(getErrorReportIncident()).toMatchObject({
      source: "manual",
      incidentAt: expect.any(String),
    });
  });

  it("bounds recent automatic incident fingerprints during an error storm", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    for (let index = 0; index < 129; index += 1) {
      expect(
        openErrorReport({
          source: "renderer-global",
          message: `failure ${index}`,
        }),
      ).toBe(true);
      closeErrorReport();
    }

    expect(
      openErrorReport({
        source: "renderer-global",
        message: "failure 0",
      }),
    ).toBe(true);
  });
});
