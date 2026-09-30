/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppSessionUiState } from "../src/renderer/src/app/session/useAppSessionUiState";
import { useAppSessionLifecycleEffects } from "../src/renderer/src/app/session/useAppSessionLifecycleEffects";
import { useJobEvents } from "../src/renderer/src/hooks/useJobEvents";
import { useRunPageWorkflow } from "../src/renderer/src/hooks/useRunPageWorkflow";
import { useCompletionSoundController } from "../src/renderer/src/hooks/useCompletionSound";
import { createTestMangaGatewayStub } from "../src/renderer/src/api/mangaGateway";
import {
  createPageWorkflowPlan,
  type PageWorkflowResult,
} from "../src/shared/pageWorkflowTypes";
import type { JobEvent, JobState } from "../src/shared/jobTypes";
import { makeOptions } from "./translationWorkflowFixtures";

const noop = () => undefined;
const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
const play = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(
    "carrot-manga-translator.completion-sound.v1",
    JSON.stringify({ muted: false, volume: 0.55 }),
  );
  frames.clear();
  play.mockClear();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal(
    "Audio",
    class {
      currentTime = 0;
      preload = "";
      volume = 1;
      play = play;
      pause = noop;
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});
function flushFrames() {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  });
}
const event = (
  id: string,
  status: JobState["status"],
  kind: JobState["kind"] = "gemma-analysis",
): JobEvent => ({ id, status, kind, progressText: status });

function harness() {
  const listeners = new Set<(event: JobEvent) => void>();
  const subscribe = (callback: (event: JobEvent) => void) => {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  };
  const options = makeOptions();
  const status = vi.fn();
  const hook = renderHook(() => {
    const ui = useAppSessionUiState();
    const sound = useCompletionSoundController();
    const [jobState, setJobState] = React.useState<JobState>(
      event("idle", "idle"),
    );
    const onJobTerminal = useAppSessionLifecycleEffects({
      currentChapter: null,
      jobState,
      onAudibleCompletion: sound.playCompletionSound,
      onJobStart: noop,
      onPageChange: noop,
      openErrorReport: noop,
      refreshLibrary: noop,
      resetChapterScopedUi: noop,
      selectedPageId: null,
      setRegionSelection: noop,
      translationFlowActive: ui.exclusiveFlowActive,
    });
    useJobEvents({
      appendStatusLine: status,
      currentChapterRef: options.currentChapterRef,
      jobState,
      mergeLiveChapter: noop,
      setJobState,
      onJobTerminal,
      suppressTerminalEvents: ui.exclusiveFlowActive,
      subscribeJobEvents: subscribe,
    });
    const run = useRunPageWorkflow(
      {
        ...options,
        setFlowActive: ui.setJobFlowActive,
        pushStatus: status,
        setJobState,
      },
      { warn: noop, error: noop, success: noop, info: noop },
    );
    return { ui, sound, jobState, run, setJobState };
  });
  return {
    ...hook,
    status,
    emit: (job: JobEvent) =>
      act(() => {
        listeners.forEach((callback) => callback(job));
      }),
  };
}

describe("completion sound event integration", () => {
  it("plays once for a successful job despite duplicate IPC and foreground updates", () => {
    const h = harness();
    h.emit(event("standalone", "running"));
    flushFrames();
    h.emit(event("standalone", "completed"));
    h.emit(event("standalone", "completed"));
    flushFrames();
    expect(play).toHaveBeenCalledOnce();
  });

  it("finishes a Hayai page workflow with terminal state and one sound", async () => {
    let resolve!: (result: PageWorkflowResult) => void;
    const promise = new Promise<PageWorkflowResult>((done) => {
      resolve = done;
    });
    vi.stubGlobal(
      "mangaApi",
      createTestMangaGatewayStub({ startPageWorkflow: () => promise }),
    );
    const h = harness();
    let run: Promise<void> | undefined;
    await act(async () => {
      run = h.result.current.run({
        plan: createPageWorkflowPlan(["ocr", "translate"]),
        selection: [{ chapterId: "chapter-1", pageIds: ["page-1"] }],
      });
    });
    expect(h.result.current.ui.jobFlowActive).toBe(true);
    expect(h.result.current.ui.exclusiveFlowActive).toBe(false);
    h.emit(event("page-workflow", "running"));
    flushFrames();
    h.emit(event("page-workflow", "completed"));
    flushFrames();
    await act(async () => {
      resolve({
        runId: "page-workflow",
        status: "completed",
        chapters: [],
        issues: [],
      });
      await run;
    });
    expect(h.result.current.ui.jobFlowActive).toBe(false);
    expect(h.status).toHaveBeenCalledWith("페이지 작업 완료");
    expect(h.result.current.jobState.status).toBe("completed");
    h.emit(event("page-workflow", "completed"));
    flushFrames();
    expect(play).toHaveBeenCalledOnce();
  });

  it("announces a background completion while keeping the running foreground", () => {
    const h = harness();
    h.emit(event("A", "running"));
    flushFrames();
    h.emit(event("B", "running", "internet-research"));
    flushFrames();
    h.emit(event("B", "completed", "internet-research"));
    flushFrames();
    expect(h.result.current.jobState.id).toBe("A");
    expect(play).toHaveBeenCalledOnce();
    h.emit(event("A", "completed"));
    flushFrames();
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("announces consecutive completions even when both rendered states say completed", () => {
    const h = harness();
    h.emit(event("A", "running"));
    flushFrames();
    h.emit(event("A", "completed"));
    flushFrames();
    h.emit(event("B", "running", "internet-research"));
    h.emit(event("B", "completed", "internet-research"));
    flushFrames();
    expect(h.result.current.jobState.id).toBe("B");
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("announces every completed job in a single frame", () => {
    const h = harness();
    h.emit(event("A", "completed"));
    h.emit(event("B", "completed"));
    h.emit(event("C", "completed"));
    flushFrames();
    expect(play).toHaveBeenCalledTimes(3);
  });

  it("waits for aggregate completion, ignores late children, and allows a second flow", () => {
    const h = harness();
    for (const child of ["child-1", "child-2"]) {
      act(() => h.result.current.ui.setJobFlowActive(true));
      h.emit(event(child, "running"));
      flushFrames();
      h.emit(event(child, "completed"));
      flushFrames();
      const before = play.mock.calls.length;
      act(() =>
        h.result.current.setJobState(
          event("translation-flow-completed", "completed"),
        ),
      );
      expect(play).toHaveBeenCalledTimes(before);
      act(() => h.result.current.ui.setJobFlowActive(false));
      expect(play).toHaveBeenCalledTimes(before + 1);
      h.emit(event(child, "completed"));
      flushFrames();
      expect(play).toHaveBeenCalledTimes(before + 1);
    }
    expect(play).toHaveBeenCalledTimes(2);
    h.emit(event("independent-after-flow", "completed", "internet-research"));
    expect(play).toHaveBeenCalledTimes(3);
  });

  it.each(["failed", "cancelled", "partial"] as const)(
    "does not play success audio for %s or a late completed duplicate",
    (status) => {
      const h = harness();
      h.emit(event("A", "running"));
      flushFrames();
      h.emit(event("A", status));
      flushFrames();
      h.emit(event("A", "completed"));
      flushFrames();
      expect(play).not.toHaveBeenCalled();
    },
  );

  it("uses the latest category and master mute settings without replaying old completions", () => {
    const h = harness();
    act(() =>
      h.result.current.sound.setPreferences({
        muted: false,
        volume: 0.55,
        researchMuted: true,
      }),
    );
    h.emit(event("research", "completed", "internet-research"));
    flushFrames();
    expect(play).not.toHaveBeenCalled();
    act(() =>
      h.result.current.sound.setPreferences({ muted: false, volume: 0.55 }),
    );
    h.emit(event("research", "completed", "internet-research"));
    expect(play).not.toHaveBeenCalled();
    h.emit(event("research-2", "completed", "internet-research"));
    expect(play).toHaveBeenCalledOnce();
    act(() =>
      h.result.current.sound.setPreferences({ muted: true, volume: 0.55 }),
    );
    h.emit(event("translation", "completed"));
    expect(play).toHaveBeenCalledOnce();
  });
});
