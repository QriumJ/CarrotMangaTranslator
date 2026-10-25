/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import { errorReportGateway } from "../src/renderer/src/lib/errorReportGateway";
import { createTestMangaGatewayStub } from "../src/renderer/src/api/mangaGateway";
import type { MangaApi } from "../src/shared/mangaApi";

afterEach(() => {
  window.mangaApi = createTestMangaGatewayStub();
});

it("preserves renderer diagnostics across structured clone without executing accessors", async () => {
  const writeLog = vi.fn<MangaApi["writeLog"]>(async () => ({ logged: true }));
  window.mangaApi = createTestMangaGatewayStub({ writeLog });
  const getter = vi.fn(() => {
    throw new Error("must not run");
  });
  const error = Object.defineProperty(new TypeError("typed failure"), "extra", {
    get: getter,
  });
  const detail = Object.defineProperties(
    { code: "CAUSE", errors: [error], count: 12n, nullable: null },
    {
      computed: { enumerable: true, get: getter },
      hidden: { value: "not enumerable" },
    },
  );
  await errorReportGateway.writeLog("error", "failure", detail);
  expect(writeLog.mock.calls[0][2]).toMatchObject({
    code: "CAUSE",
    count: "12",
    nullable: null,
    computed: "[Accessor not evaluated]",
    errors: [
      {
        name: "TypeError",
        message: "typed failure",
        extra: "[Accessor not evaluated]",
      },
    ],
  });
  expect(writeLog.mock.calls[0][2]).not.toHaveProperty("hidden");
  expect(getter).not.toHaveBeenCalled();
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  await errorReportGateway.writeLog("error", "cyclic", circular);
  expect(writeLog.mock.calls[1][2]).toEqual({ self: "[Circular]" });
  for (const value of [
    undefined,
    null,
    false,
    0,
    "text",
    9n,
    Symbol("symbol"),
    () => undefined,
  ])
    await errorReportGateway.writeLog("error", "primitive", value);
  expect(writeLog).toHaveBeenCalledTimes(10);
});
