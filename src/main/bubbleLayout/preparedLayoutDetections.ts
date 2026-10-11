import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deserialize, serialize } from "node:v8";
import type { MangaPage } from "../../shared/libraryTypes";
import type { ComicPageDetectionResult } from "./contracts";

/** Job-local spill storage: preserve mask floats without retaining a chapter in RAM. */
export class PreparedLayoutDetections {
  private directory?: string;
  private entries = new Map<string, string>();
  private preparing = false;
  private ready = false;

  async prepare(
    pages: readonly MangaPage[],
    signal: AbortSignal,
    detect: (page: MangaPage) => Promise<ComicPageDetectionResult>,
    release: () => Promise<unknown>,
    onProgress?: (page: MangaPage, index: number) => void,
  ): Promise<void> {
    if (this.preparing)
      throw new Error("말풍선 사전 분석이 이미 진행 중입니다.");
    this.preparing = true;
    try {
      await this.dispose();
      signal.throwIfAborted();
      this.directory = await mkdtemp(join(tmpdir(), "mgt-layout-"));
      for (const [index, page] of pages.entries()) {
        signal.throwIfAborted();
        onProgress?.(page, index);
        const key = await sourceKey(page.imagePath);
        if (this.entries.has(key)) continue;
        const detection = await detect(page);
        signal.throwIfAborted();
        if (key !== (await sourceKey(page.imagePath)))
          throw new Error("사전 분석 중 원본 이미지가 변경되었습니다.");
        const path = join(this.directory, `${this.entries.size}.bin`);
        await writeFile(path, serialize(detection));
        this.entries.set(key, path);
      }
    } finally {
      try {
        // Await physical GPU release, including cancellation and failed detection.
        await release();
      } finally {
        this.preparing = false;
      }
    }
    signal.throwIfAborted();
    this.ready = true;
  }

  async read(imagePath: string): Promise<ComicPageDetectionResult> {
    const path = this.ready && this.entries.get(await sourceKey(imagePath));
    if (!path)
      throw Object.assign(
        new Error(
          "말풍선 사전 분석 결과가 없거나 원본이 변경되었습니다. 작업을 다시 시작해 주세요.",
        ),
        { nonRetriable: true },
      );
    // Only bytes produced by this instance are deserialized; never library/input files.
    return deserialize(await readFile(path)) as ComicPageDetectionResult;
  }

  async dispose(): Promise<void> {
    this.ready = false;
    this.entries.clear();
    if (this.directory) {
      await rm(this.directory, { recursive: true, force: true });
      this.directory = undefined;
    }
  }
}

async function sourceKey(path: string): Promise<string> {
  const source = await stat(path);
  return `${path}:${source.size}:${source.mtimeMs}:${source.ctimeMs}`;
}
