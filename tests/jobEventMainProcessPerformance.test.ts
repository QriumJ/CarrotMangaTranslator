import { afterEach, describe, expect, it, vi } from "vitest";
import { ActiveJobStore } from "../src/main/jobs/activeJob";
import {
  createJobEventEmitter,
  isAbortError,
} from "../src/main/jobs/jobEvents";
import type { JobEvent } from "../src/shared/jobTypes";
import { isTerminalJobStatus } from "../src/shared/jobContracts";
import { JOB_EVENT_DISPATCH_INTERVAL_MS } from "../src/main/jobs/jobEventDispatchQueue";
import { JobEventSchema } from "../src/shared/ipcJobSchemas";

const writeLog = vi.fn();
const validateEvent = vi.fn();
const emitJobEvent = createJobEventEmitter({ validateEvent, writeLog });

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("main-process job event throughput", () => {
  it("bounds a long running log history and preserves short presentation fields", () => {
    const jobs = new ActiveJobStore();
    jobs.start({
      id: "job-1",
      kind: "gemma-analysis",
      abortController: new AbortController(),
    });
    const emitter = createJobEventEmitter({
      writeLog,
      validateEvent: (event) => {
        JobEventSchema.parse(event);
      },
    });
    const event = makeEvent({
      phase: "page_done",
      detail: "detail",
      installLogLine: "line",
      notification: { variant: "info", message: "message" },
      installLogLines: Array.from({ length: 501 }, (_, i) => String(i)),
    });
    emitter(jobs, { webContents: { send: vi.fn() } }, event);
    expect(jobs.current?.lastEvent?.installLogLines?.[0]).toBe("1");
    expect(jobs.current?.lastEvent).toMatchObject({
      detail: "detail",
      installLogLine: "line",
      notification: event.notification,
    });
    expect(writeLog).toHaveBeenCalledWith(
      "info",
      "Job event text shortened for IPC; full diagnostic",
      expect.objectContaining({ installLogLines: event.installLogLines }),
    );
  });
  it.each([true, false])(
    "delivers and stores long native failures within the IPC contract (renderer=%s)",
    (renderer) => {
      const jobs = new ActiveJobStore();
      jobs.start({
        id: "job-1",
        kind: "gemma-analysis",
        abortController: new AbortController(),
      });
      const send = vi.fn();
      const emitter = createJobEventEmitter({
        writeLog,
        validateEvent: (event) => {
          JobEventSchema.parse(event);
        },
      });
      const failure = makeEvent({
        status: "failed",
        phase: "failed",
        progressText: "NumPy import failed\n".repeat(100),
        detail: "traceback".repeat(1000),
        installLogLine: "x".repeat(5000),
        installLogLines: Array.from({ length: 501 }, () => "y".repeat(4001)),
        notification: { variant: "error", message: "z".repeat(1001) },
      });
      expect(() =>
        emitter(jobs, renderer ? { webContents: { send } } : null, failure),
      ).not.toThrow();
      const stored = JobEventSchema.parse(jobs.current?.lastEvent);
      expect(stored.status).toBe("failed");
      expect(stored.progressText).toHaveLength(1000);
      expect(stored.detail).toHaveLength(4000);
      expect(stored.installLogLines).toHaveLength(500);
      expect(stored.notification?.message).toHaveLength(1000);
      if (renderer) expect(send.mock.calls[0]?.[1]).toEqual(stored);
      expect(writeLog).toHaveBeenCalledWith(
        "error",
        "Job event text shortened for IPC; full diagnostic",
        expect.objectContaining({
          progressText: failure.progressText,
          detail: failure.detail,
        }),
      );
    },
  );
  it.each([
    ["idle", false],
    ["starting", false],
    ["running", false],
    ["cancelling", false],
    ["cancelled", true],
    ["failed", true],
    ["partial", true],
    ["completed", true],
  ] as const)("classifies %s terminal status once", (status, expected) => {
    expect(isTerminalJobStatus(status)).toBe(expected);
  });

  it("keeps the active state current while bounding validation, logging, and IPC", () => {
    vi.useFakeTimers();
    const jobs = new ActiveJobStore();
    jobs.start({
      id: "job-1",
      kind: "gemma-analysis",
      abortController: new AbortController(),
    });
    const send = vi.fn();
    const mainWindow = { webContents: { send } };

    for (let index = 0; index < 500; index += 1) {
      emitJobEvent(jobs, mainWindow, progressEvent(index));
    }

    expect(jobs.current?.lastEvent).toMatchObject({ progressBytes: 499 });
    expect(send).not.toHaveBeenCalled();
    expect(writeLog).not.toHaveBeenCalled();

    vi.advanceTimersByTime(JOB_EVENT_DISPATCH_INTERVAL_MS);

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[1]).toMatchObject({ progressBytes: 499 });
    expect(writeLog).toHaveBeenCalledOnce();
    expect(validateEvent).toHaveBeenCalledOnce();

    const completed = makeEvent({
      status: "completed",
      phase: "done",
      progressText: "done",
    });
    emitJobEvent(jobs, mainWindow, completed);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[1]).toEqual(completed);
    expect(writeLog).toHaveBeenCalledTimes(2);
    expect(validateEvent).toHaveBeenCalledTimes(2);

    emitJobEvent(jobs, mainWindow, progressEvent(999));
    vi.runAllTimers();

    expect(jobs.current?.lastEvent).toEqual(completed);
    expect(send).toHaveBeenCalledTimes(2);
    expect(writeLog).toHaveBeenCalledTimes(2);
    expect(validateEvent).toHaveBeenCalledTimes(2);

    jobs.clearIfCurrent("job-1");
    emitJobEvent(jobs, mainWindow, progressEvent(1000));
    vi.runAllTimers();

    expect(send).toHaveBeenCalledTimes(2);
    expect(writeLog).toHaveBeenCalledTimes(2);
    expect(validateEvent).toHaveBeenCalledTimes(2);
  });

  it("contains a renderer teardown race without failing the active job", () => {
    const jobs = new ActiveJobStore();
    jobs.start({
      id: "job-1",
      kind: "gemma-analysis",
      abortController: new AbortController(),
    });
    const sendFailure = new Error("webContents was destroyed");
    const mainWindow = {
      webContents: {
        send: vi.fn(() => {
          throw sendFailure;
        }),
      },
    };
    const checkpoint = makeEvent({
      phase: "page_done",
      progressText: "page complete",
    });

    expect(() => emitJobEvent(jobs, mainWindow, checkpoint)).not.toThrow();

    expect(jobs.current?.lastEvent).toEqual(checkpoint);
    expect(writeLog).toHaveBeenNthCalledWith(
      2,
      "warn",
      "Failed to deliver job event to renderer",
      expect.objectContaining({ error: sendFailure, jobId: "job-1" }),
    );
  });

  it("treats a partial result as terminal and ignores later child progress", () => {
    const jobs = new ActiveJobStore();
    jobs.start({
      id: "job-1",
      kind: "inpainting",
      abortController: new AbortController(),
    });
    const send = vi.fn();
    const mainWindow = { webContents: { send } };
    const partial = makeEvent({
      kind: "inpainting",
      status: "partial",
      phase: "partial",
      progressText: "partially complete",
    });

    emitJobEvent(jobs, mainWindow, partial);
    emitJobEvent(jobs, mainWindow, progressEvent(1));

    expect(jobs.current?.lastEvent).toEqual(partial);
    expect(send).toHaveBeenCalledOnce();
  });

  it("logs a failed terminal event at error severity", () => {
    const jobs = new ActiveJobStore();
    jobs.start({
      id: "job-1",
      kind: "gemma-analysis",
      abortController: new AbortController(),
    });
    const failed = makeEvent({ status: "failed", progressText: "failed" });

    emitJobEvent(jobs, null, failed);

    expect(writeLog).toHaveBeenCalledWith(
      "error",
      "job:gemma-analysis:failed",
      expect.objectContaining({ id: "job-1", progressText: "failed" }),
    );
  });

  it("surfaces an invalid event contract instead of treating it as a renderer race", () => {
    const jobs = new ActiveJobStore();
    jobs.start({
      id: "job-1",
      kind: "gemma-analysis",
      abortController: new AbortController(),
    });
    const validationFailure = new Error("invalid job event");
    const send = vi.fn();
    const invalidEventEmitter = createJobEventEmitter({
      validateEvent: () => {
        throw validationFailure;
      },
      writeLog,
    });

    expect(() =>
      invalidEventEmitter(
        jobs,
        { webContents: { send } },
        makeEvent({ phase: "page_done" }),
      ),
    ).toThrow(validationFailure);
    expect(send).not.toHaveBeenCalled();
  });

  it("contains a missing renderer and classifies only AbortError DOM exceptions", () => {
    const jobs = new ActiveJobStore();
    jobs.start({
      id: "job-1",
      kind: "gemma-analysis",
      abortController: new AbortController(),
    });
    const completed = makeEvent({ status: "completed" });

    expect(() => emitJobEvent(jobs, null, completed)).not.toThrow();
    expect(jobs.current?.lastEvent).toEqual(completed);
    expect(validateEvent).not.toHaveBeenCalled();
    expect(isAbortError(new DOMException("cancelled", "AbortError"))).toBe(
      true,
    );
    expect(isAbortError(new DOMException("failed", "NetworkError"))).toBe(
      false,
    );
    expect(isAbortError(new Error("AbortError"))).toBe(false);
  });
});

function progressEvent(progressBytes: number): JobEvent {
  return makeEvent({
    phase: "model_downloading",
    progressMode: "determinate",
    progressBytes,
    progressTotalBytes: 500,
  });
}

function makeEvent(overrides: Partial<JobEvent> = {}): JobEvent {
  return {
    id: "job-1",
    kind: "gemma-analysis",
    status: "running",
    progressText: "working",
    ...overrides,
  };
}
