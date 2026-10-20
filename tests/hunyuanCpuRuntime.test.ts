import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
const contracts = require("../src/main/runtime/model/speed-llama-runtime-contracts.cjs");
const files = require("../src/main/runtime/model/runtime-files.cjs");
const runtimes = require("../src/main/runtime/simple-page-llama-runtimes.cjs");
const profile = require("../src/main/runtime/model/runtime-profile.cjs");

it("validates the official CPU archive independently from CUDA libraries and long-path fallback", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hunyuan-cpu-"));
  try {
    for (const name of [
      "llama-server.exe",
      "llama-server-impl.dll",
      "ggml-base.dll",
      "ggml-cpu-x64.dll",
    ])
      await writeFile(join(dir, name), "fixture");
    const runtime = contracts.SPEED_LLAMA_RUNTIME_CPU;
    expect(files.missingRequiredLlamaRuntimeFiles(dir, runtime)).toEqual([]);
    expect(files.hasRequiredLlamaRuntimeFiles(dir, runtime)).toBe(true);
    expect(
      runtimes.resolveWindowsLlamaRuntimeMaxRelativePathLength(runtime),
    ).toBe(28);
    await rm(join(dir, "ggml-cpu-x64.dll"));
    expect(files.hasRequiredLlamaRuntimeFiles(dir, runtime)).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("isolates Hunyuan runtime selection from Gemma's selected OCR engine", () => {
  const gemma = {
    modelSource: "hf",
    modelRepo: "test/gemma-4-12B-it-GGUF",
    modelFile: "gemma-4-12B.gguf",
    llamaRuntimeProfile: "cuda12",
  };
  expect(
    profile.resolvePreferredLlamaRuntime({ ...gemma, ocrPipeline: "hunyuan" }),
  ).toEqual(
    profile.resolvePreferredLlamaRuntime({ ...gemma, ocrPipeline: "hayai" }),
  );
  expect(
    profile.resolvePreferredLlamaRuntime({
      ...gemma,
      llamaRuntimePurpose: "hunyuan",
      llamaRuntimeProfile: "cpu",
    }),
  ).toEqual(contracts.SPEED_LLAMA_RUNTIME_CPU);
  for (const [backend, key] of [
    ["metal", "SPEED_LLAMA_RUNTIME_METAL_ARM64"],
    ["vulkan", "SPEED_LLAMA_RUNTIME_VULKAN"],
    ["cuda12", "SPEED_LLAMA_RUNTIME_CUDA12"],
    ["rtx50", "SPEED_LLAMA_RUNTIME_CUDA13"],
  ]) {
    expect(
      profile.resolvePreferredLlamaRuntime({
        ...gemma,
        llamaRuntimePurpose: "hunyuan",
        llamaRuntimeProfile: backend,
      }),
    ).toEqual(contracts[key]);
  }
});
