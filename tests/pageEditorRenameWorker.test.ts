import { afterEach, expect, it, vi } from "vitest";
import { runPageRename } from "../src/renderer/src/lib/runPageRename";
import { DEFAULT_PAGE_RENAME_RULE } from "../src/renderer/src/lib/pageEditorRename";
const rule = {
  ...DEFAULT_PAGE_RENAME_RULE,
  kind: "replace" as const,
  regex: true,
  text: "a",
  replacement: "b",
};
const context = { work: "work", chapter: "chapter" };
class WorkerBoundary {
  static current: WorkerBoundary;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    WorkerBoundary.current = this;
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("terminates a stalled regex worker within the time limit", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("Worker", WorkerBoundary);
  const result = runPageRename(["a"], rule, context);
  const rejection = expect(result).rejects.toThrow("timeout");
  await vi.advanceTimersByTimeAsync(1500);
  await rejection;
  expect(WorkerBoundary.current.terminate).toHaveBeenCalledOnce();
});
it("returns worker results and surfaces syntax and runtime failures", async () => {
  vi.stubGlobal("Worker", WorkerBoundary);
  const success = runPageRename(["a"], rule, context);
  WorkerBoundary.current.onmessage?.({ data: { values: ["b"] } });
  await expect(success).resolves.toEqual(["b"]);
  const invalid = runPageRename(["a"], rule, context);
  WorkerBoundary.current.onmessage?.({ data: { error: "regex" } });
  await expect(invalid).rejects.toThrow("regex");
  const failure = runPageRename(["a"], rule, context);
  WorkerBoundary.current.onerror?.();
  await expect(failure).rejects.toThrow("regex");
});
it("runs the production worker handler for replacement and malformed expressions", async () => {
  const worker = {
    onmessage: null as null | ((event: { data: unknown }) => void),
    postMessage: vi.fn(),
  };
  vi.stubGlobal("self", worker);
  await import("../src/renderer/src/lib/pageEditorRename.worker");
  worker.onmessage?.({ data: { values: ["a"], rule, context } });
  expect(worker.postMessage).toHaveBeenLastCalledWith({ values: ["b"] });
  worker.onmessage?.({
    data: { values: ["a"], rule: { ...rule, text: "[" }, context },
  });
  expect(worker.postMessage).toHaveBeenLastCalledWith({ error: "regex" });
});
