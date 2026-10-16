import type { InpaintingRetouchRequest } from "../../shared/inpaintingTypes";

export type SampledWorkerRequest = {
  request: InpaintingRetouchRequest;
  originalPath: string;
  currentPath: string;
  outputPath: string;
  maskPath: string;
  runtimeDir: string;
  decoder?: { executable: string; bootstrap: string; packaged: boolean };
  width: number;
  height: number;
  cancel: SharedArrayBuffer;
};

export type SampledWorkerReply =
  | { ok: true; changed: boolean; elapsedMs: number }
  | { ok: false; error: string };
