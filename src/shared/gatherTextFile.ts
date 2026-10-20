import { z } from "zod/v4";
import type { TFunction } from "i18next";
import { buildLegacyTranslatedTextImport } from "./gatherText";
import type {
  GatherField,
  GatheredPage,
  TranslatedTextImportResult,
} from "./gatherText";

const FILE_HEADER = "#@carrot-text-v1";
const BLOCK_HEADER = "#@block ";
const BLOCK_END = "#@end";
const blockHeader = z
  .object({
    pageId: z.string().min(1),
    blockId: z.string().min(1),
    field: z.enum(["source", "translated", "both"]),
    sourceText: z.string(),
  })
  .strict();

/** File-only framing; the gathered-text view and clipboard stay plain text. */
export function formatGatheredTextFile(
  pages: GatheredPage[],
  field: GatherField,
  includeHeaders = true,
): string {
  const sections = pages
    .filter((page) => page.blocks.length)
    .map((page) => {
      const lines = includeHeaders
        ? [`# ${page.index + 1}쪽 · ${page.pageName}`]
        : [];
      for (const block of page.blocks) {
        lines.push(
          BLOCK_HEADER +
            JSON.stringify({
              pageId: page.pageId,
              blockId: block.id,
              field,
              sourceText: block.sourceText,
            }),
        );
        const text =
          field === "source"
            ? block.sourceText
            : field === "translated"
              ? block.translatedText
              : [block.sourceText, block.translatedText].join("\n");
        lines.push(
          ...text
            .split("\n")
            .map((line) => (/^(\\|#@)/.test(line) ? `\\${line}` : line)),
        );
        lines.push(BLOCK_END);
      }
      return lines.join("\n");
    });
  return sections.length ? [FILE_HEADER, ...sections].join("\n\n") : "";
}

type FileBlock = { header: z.infer<typeof blockHeader>; lines: string[] };

function parseFileBlocks(content: string): FileBlock[] {
  const blocks: FileBlock[] = [];
  let current: FileBlock | null = null;
  for (const line of content.replace(/\r\n?/g, "\n").split("\n").slice(1)) {
    if (line.startsWith(BLOCK_HEADER)) {
      if (current) throw new Error("TXT 블록의 끝 표시가 누락되었습니다.");
      current = {
        header: blockHeader.parse(JSON.parse(line.slice(BLOCK_HEADER.length))),
        lines: [],
      };
    } else if (line === BLOCK_END) {
      if (!current) throw new Error("TXT 블록 시작 표시가 없습니다.");
      blocks.push(current);
      current = null;
    } else if (current) {
      if (line.startsWith("#@"))
        throw new Error("TXT 블록 구분 표시가 올바르지 않습니다.");
      current.lines.push(line.startsWith("\\") ? line.slice(1) : line);
    } else if (line.trim() && !/^#\s*\d+쪽(?:\s*·.*)?$/.test(line)) {
      throw new Error("TXT 블록 밖에 알 수 없는 내용이 있습니다.");
    }
  }
  if (current) throw new Error("TXT 블록의 끝 표시가 누락되었습니다.");
  return blocks;
}

function translationFromBlock(block: FileBlock): string {
  const text = block.lines.join("\n");
  if (block.header.field !== "both") return text;
  const prefix = block.header.sourceText.replace(/\r\n?/g, "\n") + "\n";
  if (!text.startsWith(prefix))
    throw new Error(
      "TXT 원문이 변경되었습니다. 원문과 번역문 구성을 확인하세요.",
    );
  return text.slice(prefix.length);
}

function importGatheredTextFile(
  pages: GatheredPage[],
  content: string,
): TranslatedTextImportResult | null {
  const normalized = content.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("#@carrot-text")) return null;
  try {
    if (normalized.split(/\r?\n/, 1)[0] !== FILE_HEADER)
      throw new Error("지원하지 않는 TXT 파일 버전입니다.");
    return mapFileBlocks(pages, parseFileBlocks(normalized));
  } catch (error) {
    return {
      updates: [],
      matchedPageCount: 0,
      warnings: [error instanceof Error ? error.message : String(error)],
      fatal: true,
    };
  }
}

function mapFileBlocks(
  pages: GatheredPage[],
  blocks: FileBlock[],
): TranslatedTextImportResult {
  const updates: TranslatedTextImportResult["updates"] = [];
  const matched = new Set<string>();
  const seen = new Set<string>();
  const warnings: string[] = [];
  for (const entry of blocks) {
    const { pageId, blockId, sourceText, field } = entry.header;
    const key = JSON.stringify([pageId, blockId]);
    if (seen.has(key))
      throw new Error(
        "TXT에 같은 블록이 중복되어 있습니다. 중복 구간을 제거하세요.",
      );
    seen.add(key);
    const page = pages.find((page) => page.pageId === pageId);
    const block = page?.blocks.find((block) => block.id === blockId);
    if (!page || !block) {
      warnings.push(
        `TXT 대상 페이지 또는 블록을 찾을 수 없어 건너뜁니다: ${pageId}/${blockId}`,
      );
      continue;
    }
    if (block.sourceText !== sourceText)
      throw new Error(
        "TXT를 저장한 뒤 원문이 변경되었습니다. 최신 파일로 다시 번역하세요.",
      );
    const translatedText = translationFromBlock(entry);
    matched.add(pageId);
    if (
      field === "source" &&
      translatedText === sourceText.replace(/\r\n?/g, "\n")
    )
      continue;
    if (translatedText !== block.translatedText)
      updates.push({ pageId, blockId, translatedText });
  }
  return { updates, matchedPageCount: matched.size, warnings };
}

/** Dispatches file framing before the explicitly selected legacy text layout. */
export function buildTranslatedTextImport(
  pages: GatheredPage[],
  content: string,
  t?: TFunction<"renderer">,
  field: "both" | "translated" = "both",
): TranslatedTextImportResult {
  return (
    importGatheredTextFile(pages, content) ??
    buildLegacyTranslatedTextImport(pages, content, t, field)
  );
}
