import {
  FLUX_DIFFUSERS_MODEL_ID,
  FLUX_DIFFUSERS_MODEL_REVISION,
} from "../src/main/inpainting/fluxAssets/constants";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildFluxWorkerEnv } from "../src/main/inpainting/fluxWorkerEnv";
import { buildFluxPythonLaunchSpec } from "../src/main/inpainting/fluxAssets/pythonRuntimeLaunchSpec";
import {
  buildFluxPythonHuggingFaceEnv,
  ensureFluxPythonModelCache,
} from "../src/main/inpainting/fluxAssets/pythonRuntimePackages";

const tempDirs: string[] = [];
const revision = "e7b7dc27f91deacad38e78976d1f2b499d76a294";

describe("Flux Python Hugging Face environment", () => {
  afterEach(async () => {
    vi.unstubAllEnvs();
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  it("uses the stable HTTP download path instead of hf-xet by default", () => {
    const modelDir = join("data", "models", "flux");

    expect(
      buildFluxPythonHuggingFaceEnv({ MGT_TEST_ENV: "kept" }, modelDir),
    ).toMatchObject({
      MGT_TEST_ENV: "kept",
      HF_HOME: modelDir,
      HF_HUB_CACHE: join(modelDir, "hub"),
      HUGGINGFACE_HUB_CACHE: join(modelDir, "hub"),
      HF_HUB_ETAG_TIMEOUT: "30",
      HF_HUB_DOWNLOAD_TIMEOUT: "300",
      HF_HUB_DISABLE_SYMLINKS_WARNING: "1",
      HF_HUB_DISABLE_XET: "1",
    });
  });

  it("keeps an explicit hf-xet override for diagnostics", () => {
    expect(
      buildFluxPythonHuggingFaceEnv(
        {
          HF_HUB_DISABLE_XET: "0",
          HF_HUB_ETAG_TIMEOUT: "12",
          HF_HUB_DOWNLOAD_TIMEOUT: "45",
        },
        join("data", "models", "flux"),
      ),
    ).toMatchObject({
      HF_HUB_DISABLE_XET: "0",
      HF_HUB_ETAG_TIMEOUT: "12",
      HF_HUB_DOWNLOAD_TIMEOUT: "45",
    });
  });

  it("passes the stable download environment to snapshot_download", async () => {
    const modelDir = await createTempModelDir();
    const probePath = join(modelDir, "env-probe.cjs");
    const outputPath = join(modelDir, "env-probe.json");
    await writeFile(
      probePath,
      [
        'const { writeFileSync } = require("node:fs");',
        "const keys = [",
        '  "HF_HOME",',
        '  "HF_HUB_CACHE",',
        '  "HF_HUB_DISABLE_XET",',
        '  "HF_HUB_ETAG_TIMEOUT",',
        '  "HF_HUB_DOWNLOAD_TIMEOUT",',
        "];",
        "writeFileSync(",
        "  process.argv[2],",
        "  JSON.stringify({",
        "    args: process.argv.slice(3),",
        "    env: Object.fromEntries(keys.map((key) => [key, process.env[key]])),",
        "  }),",
        ");",
      ].join("\n"),
      "utf8",
    );

    await ensureFluxPythonModelCache({
      pythonRuntime: createPythonRuntime({
        command: process.execPath,
        executable: process.execPath,
        args: [probePath, outputPath],
      }),
      modelDir,
      modelId: "example/flux-model",
      revision,
    });

    const probe = JSON.parse(await readFile(outputPath, "utf8")) as {
      args: string[];
      env: NodeJS.ProcessEnv;
    };
    expect(probe.args[0]).toBe("-c");
    expect(probe.args).toContain("example/flux-model");
    expect(probe.args.at(-1)).toBe(revision);
    expect(probe.args[1]).toContain("revision=sys.argv[4]");
    expect(probe.env).toMatchObject({
      HF_HOME: modelDir,
      HF_HUB_CACHE: join(modelDir, "hub"),
      HF_HUB_DISABLE_XET: "1",
      HF_HUB_ETAG_TIMEOUT: "30",
      HF_HUB_DOWNLOAD_TIMEOUT: "300",
    });
  });

  it("keeps the same environment on the final Python worker process", async () => {
    const modelDir = await createTempModelDir();
    const modelId = "example/flux-model";
    const downloadGuardPath = join(modelDir, "fail-on-download.cjs");
    const previousRevision =
      process.env.MANGA_TRANSLATOR_FLUX_PYTHON_MODEL_REVISION;
    const previousModelId = process.env.MANGA_TRANSLATOR_FLUX_PYTHON_MODEL_ID;
    await writeFile(downloadGuardPath, "process.exitCode = 99;\n", "utf8");
    await writeFile(
      join(modelDir, ".mgt-flux-diffusers-model.json"),
      JSON.stringify({ modelId, revision, ignorePatterns: [] }),
      "utf8",
    );
    process.env.MANGA_TRANSLATOR_FLUX_PYTHON_MODEL_ID = modelId;
    process.env.MANGA_TRANSLATOR_FLUX_PYTHON_MODEL_REVISION = revision;

    try {
      const launch = await buildFluxPythonLaunchSpec({
        backend: "python-cpu",
        modelDir,
        pythonRuntime: createPythonRuntime({
          command: process.execPath,
          executable: process.execPath,
          args: [downloadGuardPath],
        }),
        workerPath: join(modelDir, "flux-worker.py"),
      });

      expect(launch.args).toContain("--revision");
      expect(launch.args).toContain(revision);
      expect(buildFluxWorkerEnv(launch)).toMatchObject({
        HF_HOME: modelDir,
        HF_HUB_CACHE: join(modelDir, "hub"),
        HF_HUB_DISABLE_XET: "1",
        HF_HUB_ETAG_TIMEOUT: "30",
        HF_HUB_DOWNLOAD_TIMEOUT: "300",
      });
    } finally {
      restoreEnv("MANGA_TRANSLATOR_FLUX_PYTHON_MODEL_ID", previousModelId);
      restoreEnv(
        "MANGA_TRANSLATOR_FLUX_PYTHON_MODEL_REVISION",
        previousRevision,
      );
    }
  });
  it.each([undefined, "a".repeat(40)])(
    "invalidates an old or different revision marker (%s)",
    async (previous) => {
      const modelDir = await createTempModelDir();
      const probePath = join(modelDir, "count.cjs");
      const countPath = join(modelDir, "count.txt");
      await writeFile(
        probePath,
        'require("node:fs").appendFileSync(process.argv[2], "download\\n");',
      );
      const options = {
        modelDir,
        modelId: "example/model",
        revision,
        pythonRuntime: createPythonRuntime({
          executable: process.execPath,
          args: [probePath, countPath],
        }),
      };
      await writeFile(
        join(modelDir, ".mgt-flux-diffusers-model.json"),
        JSON.stringify({
          modelId: options.modelId,
          revision: previous,
          ignorePatterns: [],
        }),
      );
      await ensureFluxPythonModelCache(options);
      await ensureFluxPythonModelCache(options);
      expect(await readFile(countPath, "utf8")).toBe("download\n");
      expect(
        JSON.parse(
          await readFile(
            join(modelDir, ".mgt-flux-diffusers-model.json"),
            "utf8",
          ),
        ).revision,
      ).toBe(revision);
    },
  );

  it.each(["", "main", "abcd"])(
    "rejects unpinned revision %s before starting Python",
    async (unpinned) => {
      await expect(
        ensureFluxPythonModelCache({
          modelDir: await createTempModelDir(),
          modelId: "custom/model",
          revision: unpinned,
          pythonRuntime: createPythonRuntime({ executable: "must-not-run" }),
        }),
      ).rejects.toThrow(/full commit revision/);
    },
  );
  it.each(["default", "alias"])(
    "pins the %s model through cache and worker launch",
    async (selection) => {
      for (const key of [
        "MANGA_TRANSLATOR_FLUX_PYTHON_MODEL_ID",
        "MANGA_TRANSLATOR_FLUX_PYTHON_MODEL_REVISION",
        "MGT_FLUX_PYTHON_MODEL_ID",
        "MGT_FLUX_PYTHON_MODEL_REVISION",
      ])
        vi.stubEnv(key, undefined);
      const modelDir = await createTempModelDir();
      const modelId =
        selection === "default"
          ? FLUX_DIFFUSERS_MODEL_ID
          : "example/alias-model";
      const commit =
        selection === "default"
          ? FLUX_DIFFUSERS_MODEL_REVISION
          : "b".repeat(40);
      if (selection === "alias") {
        vi.stubEnv("MGT_FLUX_PYTHON_MODEL_ID", modelId);
        vi.stubEnv("MGT_FLUX_PYTHON_MODEL_REVISION", commit);
      }
      await writeFile(
        join(modelDir, ".mgt-flux-diffusers-model.json"),
        JSON.stringify({ modelId, revision: commit, ignorePatterns: [] }),
      );
      const launch = await buildFluxPythonLaunchSpec({
        backend: "python-cpu",
        modelDir,
        pythonRuntime: createPythonRuntime({
          executable: "must-not-download-again",
        }),
        workerPath: "worker.py",
      });
      expect(launch.args[launch.args.indexOf("--model-id") + 1]).toBe(modelId);
      expect(launch.args[launch.args.indexOf("--revision") + 1]).toBe(commit);
    },
  );

  it("does not borrow the built-in revision for a custom model", async () => {
    vi.stubEnv("MANGA_TRANSLATOR_FLUX_PYTHON_MODEL_ID", "example/custom-model");
    vi.stubEnv("MANGA_TRANSLATOR_FLUX_PYTHON_MODEL_REVISION", undefined);
    vi.stubEnv("MGT_FLUX_PYTHON_MODEL_REVISION", undefined);
    await expect(
      buildFluxPythonLaunchSpec({
        backend: "python-cpu",
        modelDir: await createTempModelDir(),
        pythonRuntime: createPythonRuntime({ executable: "must-not-run" }),
        workerPath: "worker.py",
      }),
    ).rejects.toThrow(/full commit revision/);
  });
});

async function createTempModelDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "manga-flux-hf-env-"));
  tempDirs.push(dir);
  await mkdir(dir, { recursive: true });
  return dir;
}

function createPythonRuntime(
  overrides: Partial<{
    command: string;
    executable: string;
    args: string[];
  }> = {},
) {
  return {
    mode: "target" as const,
    command: "python",
    executable: "python",
    args: [],
    packageDir: null,
    ...overrides,
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
