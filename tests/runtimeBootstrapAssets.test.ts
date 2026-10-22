import { readFileSync } from "node:fs";
import { join } from "node:path";
import nativeCatalog from "../src/main/runtime/native-inference-manifest.json";
import { describe, expect, it } from "vitest";
import {
  RUNTIME_INTEGRITY_MANIFEST,
  resolvePinnedRemoteAsset,
} from "../src/main/runtimeSupport/runtimeIntegrity";

const cjs = require("../src/main/runtime/runtime-integrity.cjs") as {
  RUNTIME_INTEGRITY_MANIFEST: typeof RUNTIME_INTEGRITY_MANIFEST;
  resolvePinnedRemoteAsset: typeof resolvePinnedRemoteAsset;
};

describe("managed Python bootstrap asset contract", () => {
  it("pins all bootstrap scripts to the same immutable upstream commit", () => {
    expect(cjs.RUNTIME_INTEGRITY_MANIFEST).toEqual(RUNTIME_INTEGRITY_MANIFEST);
    const entries = [
      RUNTIME_INTEGRITY_MANIFEST.managedPython,
      RUNTIME_INTEGRITY_MANIFEST.hayaiManagedPython,
      RUNTIME_INTEGRITY_MANIFEST.fluxManagedPython,
    ];
    for (const entry of entries) {
      expect(entry.getPip).toEqual(entries[0].getPip);
      expect(entry.getPip.url).toMatch(
        /^https:\/\/raw\.githubusercontent\.com\/pypa\/get-pip\/[a-f0-9]{40}\/public\/get-pip\.py$/,
      );
      expect(entry.getPip.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.archive.url).toContain(`/python/${entry.version}/`);
    }
  });

  it.each([
    ["OCR", cjs.resolvePinnedRemoteAsset],
    ["Flux", resolvePinnedRemoteAsset],
  ] as const)(
    "%s preserves digest enforcement for overrides",
    (_name, resolve) => {
      const asset = RUNTIME_INTEGRITY_MANIFEST.managedPython.getPip;
      const defaults = {
        defaultUrl: asset.url,
        defaultSha256: asset.sha256,
        label: "pip",
      };
      expect(resolve({ ...defaults, url: asset.url })).toEqual(asset);
      const url = "https://example.invalid/custom-get-pip.py";
      expect(() => resolve({ ...defaults, url })).toThrow(/pinned SHA-256/);
      const sha256 = "a".repeat(64);
      expect(resolve({ ...defaults, url, overrideSha256: sha256 })).toEqual({
        url,
        sha256,
      });
    },
  );
});

describe("ROCm snapshot contract", () => {
  it("binds all SDK packages and the Hayai lock to the same immutable release bytes", () => {
    const manifest = JSON.parse(
      readFileSync(
        join(process.cwd(), "docs/issue-157-rocm-assets.json"),
        "utf8",
      ),
    ) as {
      tag: string;
      assets: { id?: string; name: string; bytes: number; sha256: string }[];
    };
    const lock = readFileSync(
      join(
        process.cwd(),
        "src/main/runtime/ocr/requirements-hayai-rocm-win.lock",
      ),
      "utf8",
    );
    const packages = Object.entries(nativeCatalog.packages).filter(([id]) =>
      id.startsWith("rocm-"),
    );
    expect(packages).toHaveLength(24);
    expect(nativeCatalog.version).not.toBe("koharu-0.83.5-r2");
    for (const [id, asset] of packages) {
      const recorded = manifest.assets.find((entry) => entry.id === id);
      expect(recorded).toBeDefined();
      expect(asset.url).toBe(
        "https://github.com/ucx0204/CarrotMangaTranslator/releases/download/" +
          manifest.tag +
          "/" +
          recorded?.name,
      );
      expect(asset.sha256).toBe(recorded?.sha256);
      expect(asset.bytes).toBe(recorded?.bytes);
      expect(lock).toContain(" @ " + asset.url + " \\");
      expect(lock).toContain("--hash=sha256:" + asset.sha256);
    }
  });
});
