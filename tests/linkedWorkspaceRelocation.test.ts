import { afterEach, expect, it } from "vitest";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_RASTER_EXPORT_SETTINGS,
  type LinkedWorkspaceRecordV1,
} from "../src/shared/linkedWorkspaceTypes";
import { fingerprintFile } from "../src/main/linkedWorkspace/linkedWorkspaceFiles";
import { buildLinkedMirrorFileName } from "../src/main/linkedWorkspace/linkedWorkspacePaths";
import { relocateLinkedResults } from "../src/main/linkedWorkspace/linkedWorkspaceRelocation";
import { recoverLinkedRelocations } from "../src/main/linkedWorkspace/linkedWorkspaceRelocationRecovery";

const roots: string[] = [];
const links: string[] = [];
afterEach(async () => {
  for (const path of links.splice(0)) await rm(path, { force: true });
  for (const path of roots.splice(0))
    await rm(path, { recursive: true, force: true });
});

async function fixture() {
  const dataRoot = await mkdtemp(join(tmpdir(), "carrot-relocation-"));
  roots.push(dataRoot);
  const rootPath = join(dataRoot, "results", "old work", "old chapter");
  await mkdir(join(rootPath, "originals"), { recursive: true });
  await mkdir(join(rootPath, "result"));
  const pageId = randomUUID();
  await writeFile(join(rootPath, "originals", "1.png"), "source");
  await writeFile(join(rootPath, "result", "1.png"), "translated");
  const source = await fingerprintFile(join(rootPath, "originals", "1.png"));
  const result = await fingerprintFile(join(rootPath, "result", "1.png"));
  let record: LinkedWorkspaceRecordV1 = {
    id: randomUUID(),
    workId: randomUUID(),
    chapterId: randomUUID(),
    rootPath,
    destinationKind: "managed",
    enabled: true,
    output: DEFAULT_RASTER_EXPORT_SETTINGS,
    pageRelativePaths: { [pageId]: "1.png" },
    sourceRelativePaths: { [pageId]: "originals/1.png" },
    sourceFingerprints: { [pageId]: source },
    publishedRevisions: {},
    publishedMirrorRevisions: {},
    artifacts: {
      [pageId]: {
        result: {
          path: "result/1.png",
          bytes: result.size,
          sha256: result.sha256,
        },
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeFile(
    join(rootPath, buildLinkedMirrorFileName(rootPath)),
    JSON.stringify({
      schemaVersion: 1,
      chapters: [
        {
          id: record.chapterId,
          workId: record.workId,
          title: "old chapter",
          workTitle: "old work",
          pages: [],
        },
      ],
    }),
  );
  const options = {
    dataRoot,
    record,
    preferred: join(dataRoot, "results", "new work", "new chapter"),
    workTitle: "new work",
    chapterTitle: "new chapter",
    publish: async (next: LinkedWorkspaceRecordV1, committed: () => void) => {
      record = next;
      committed();
    },
  };
  return { ...options, options, current: () => record };
}

it("moves verified generated files, updates mirror titles and leaves added user files in place", async () => {
  const f = await fixture();
  await writeFile(join(f.record.rootPath, "notes.txt"), "my notes");
  const moved = await relocateLinkedResults(f.options);
  expect(moved.preserved).toBe(true);
  expect(await readFile(join(f.record.rootPath, "notes.txt"), "utf8")).toBe(
    "my notes",
  );
  expect(
    await readFile(join(moved.record.rootPath, "result", "1.png"), "utf8"),
  ).toBe("translated");
  expect(
    await readFile(join(moved.record.rootPath, "originals", "1.png"), "utf8"),
  ).toBe("source");
  const mirror = JSON.parse(
    await readFile(
      join(
        moved.record.rootPath,
        buildLinkedMirrorFileName(moved.record.rootPath),
      ),
      "utf8",
    ),
  );
  expect(mirror.chapters[0]).toMatchObject({
    title: "new chapter",
    workTitle: "new work",
  });
  expect(await readdir(f.record.rootPath)).toEqual(["notes.txt"]);
  expect(await readdir(join(f.dataRoot, "linked-relocations"))).toEqual([]);
});

it("does not overwrite occupied destinations and prunes only empty old directories", async () => {
  const f = await fixture();
  await mkdir(f.preferred, { recursive: true });
  await writeFile(join(f.preferred, "mine.txt"), "mine");
  const moved = await relocateLinkedResults(f.options);
  expect(moved.record.rootPath).toBe(`${f.preferred} (2)`);
  expect(await readFile(join(f.preferred, "mine.txt"), "utf8")).toBe("mine");
  await expect(readdir(f.record.rootPath)).rejects.toMatchObject({
    code: "ENOENT",
  });
});

it("refuses modified or missing owned files before changing the connection", async () => {
  const f = await fixture();
  const path = join(f.record.rootPath, "result", "1.png");
  await writeFile(path, "user edit");
  await expect(relocateLinkedResults(f.options)).rejects.toThrow("변경된 파일");
  expect(f.current().rootPath).toBe(f.record.rootPath);
  expect(await readFile(path, "utf8")).toBe("user edit");
  await unlink(path);
  await expect(relocateLinkedResults(f.options)).rejects.toThrow(
    "찾지 못했습니다",
  );
});

it("rolls back copied files if registry publication fails", async () => {
  const f = await fixture();
  await expect(
    relocateLinkedResults({
      ...f.options,
      publish: async () => {
        throw new Error("disk full");
      },
    }),
  ).rejects.toThrow("disk full");
  expect(
    await readFile(join(f.record.rootPath, "result", "1.png"), "utf8"),
  ).toBe("translated");
  await expect(readdir(f.preferred)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readdir(join(f.dataRoot, "linked-relocations"))).toEqual([]);
});

it("recovers an interruption immediately after registry commit without reverting the new path", async () => {
  const f = await fixture();
  await expect(
    relocateLinkedResults({
      ...f.options,
      publish: async (record, committed) => {
        await f.options.publish(record, committed);
        throw new Error("process interrupted");
      },
    }),
  ).rejects.toThrow("process interrupted");
  expect((await readdir(join(f.dataRoot, "linked-relocations"))).length).toBe(
    1,
  );
  await recoverLinkedRelocations(f.dataRoot, [f.current()]);
  expect(
    await readFile(join(f.current().rootPath, "result", "1.png"), "utf8"),
  ).toBe("translated");
  await expect(readdir(f.record.rootPath)).rejects.toMatchObject({
    code: "ENOENT",
  });
});

it("preserves old copies when the replacement was removed after commit", async () => {
  const f = await fixture();
  const moved = await relocateLinkedResults({
    ...f.options,
    publish: async (record, committed) => {
      await f.options.publish(record, committed);
      await unlink(join(record.rootPath, "result", "1.png"));
    },
  });
  expect(moved.preserved).toBe(true);
  expect(
    await readFile(join(f.record.rootPath, "result", "1.png"), "utf8"),
  ).toBe("translated");
});

it("refuses custom locations, shared mirrors and traversal outside managed results", async () => {
  const f = await fixture();
  await expect(
    relocateLinkedResults({
      ...f.options,
      record: { ...f.record, destinationKind: "custom" },
    }),
  ).rejects.toThrow("지정한 폴더");
  await expect(
    relocateLinkedResults({
      ...f.options,
      preferred: join(f.dataRoot, "elsewhere"),
    }),
  ).rejects.toThrow("밖의 경로");
  const path = join(
    f.record.rootPath,
    buildLinkedMirrorFileName(f.record.rootPath),
  );
  await writeFile(
    path,
    JSON.stringify({ schemaVersion: 1, chapters: [{ id: "other" }] }),
  );
  await expect(relocateLinkedResults(f.options)).rejects.toThrow("복구 문서");
});

it("does not follow a destination junction or delete its external original", async () => {
  const f = await fixture();
  const outside = await mkdtemp(join(tmpdir(), "carrot-relocation-external-"));
  roots.push(outside);
  await writeFile(join(outside, "keep.txt"), "external");
  const link = join(f.dataRoot, "results", "new work");
  await symlink(
    outside,
    link,
    process.platform === "win32" ? "junction" : "dir",
  );
  links.push(link);
  await expect(relocateLinkedResults(f.options)).rejects.toThrow("정션");
  expect(await readFile(join(outside, "keep.txt"), "utf8")).toBe("external");
});
