import { z } from "zod";
import {
  CharacterProfileSchema,
  GlossaryEntrySchema,
} from "./ipcWorkContextSchemas";
import type {
  CharacterProfile,
  GlossaryEntry,
  WorkStyleGuide,
} from "./workContextTypes";

/**
 * Portable term file for backing up a work's glossary and character names and
 * reusing them in another work. IDs and timestamps are intentionally omitted:
 * an import always creates fresh native entries, so a file can never overwrite
 * an entry by identity.
 */
export const WORK_GLOSSARY_FILE_FORMAT = "carrot-work-glossary";
const WORK_GLOSSARY_FILE_VERSION = 1;
export const MAX_WORK_GLOSSARY_FILE_BYTES = 16 * 1024 * 1024;

const glossaryShape = GlossaryEntrySchema.shape;
const characterShape = CharacterProfileSchema.shape;

/** Lenient per-entry admission: also reads a raw style-guide.json or MCP export. */
const ImportedGlossaryEntrySchema = z.object({
  source: z.string().trim().min(1).max(400),
  target: z.string().trim().max(400).catch(""),
  category: glossaryShape.category.catch("term"),
  aliases: glossaryShape.aliases.catch(undefined),
  note: glossaryShape.note.catch(undefined),
  origin: glossaryShape.origin.catch(undefined),
  enabled: z.boolean().catch(true),
});

const ImportedCharacterProfileSchema = z
  .object({
    displayName: z.string().trim().max(200).catch(""),
    sourceNames: z.array(z.string().trim().min(1).max(200)).max(50).catch([]),
    targetName: z.string().trim().max(200).catch(""),
    aliases: characterShape.aliases.catch(undefined),
    speechStyle: characterShape.speechStyle.catch("custom"),
    customSpeechStyle: characterShape.customSpeechStyle.catch(undefined),
    note: characterShape.note.catch(undefined),
    origin: characterShape.origin.catch(undefined),
    enabled: z.boolean().catch(true),
  })
  .refine(
    (character) =>
      Boolean(
        character.displayName ||
        character.targetName ||
        character.sourceNames.length,
      ),
    "A character needs a name.",
  );

export type ImportedGlossaryEntry = z.infer<typeof ImportedGlossaryEntrySchema>;
export type ImportedCharacterProfile = z.infer<
  typeof ImportedCharacterProfileSchema
>;

export type WorkGlossaryFileV1 = {
  format: typeof WORK_GLOSSARY_FILE_FORMAT;
  version: typeof WORK_GLOSSARY_FILE_VERSION;
  exportedAt: string;
  workTitle: string;
  glossary: ImportedGlossaryEntry[];
  characters: ImportedCharacterProfile[];
};

export type ParsedWorkGlossaryFile = {
  workTitle?: string;
  glossary: ImportedGlossaryEntry[];
  characters: ImportedCharacterProfile[];
  /** Entries present in the file that could not be read and are never applied. */
  invalidCount: number;
};

/** `null` when the dialog is cancelled; oversized files are never read. */
export type WorkGlossaryFileOpenResult =
  { path: string; content: string } | { path: string; tooLarge: true } | null;

export type WorkGlossaryFileError =
  "invalid-json" | "unrecognized" | "unsupported-version" | "empty";

export type WorkGlossaryFileParseResult =
  | { ok: true; file: ParsedWorkGlossaryFile }
  | { ok: false; error: WorkGlossaryFileError; invalidCount: number };

export function buildWorkGlossaryFile(
  guide: Pick<WorkStyleGuide, "glossary" | "characters">,
  workTitle: string,
  exportedAt: string,
): WorkGlossaryFileV1 {
  return {
    format: WORK_GLOSSARY_FILE_FORMAT,
    version: WORK_GLOSSARY_FILE_VERSION,
    exportedAt,
    workTitle,
    glossary: guide.glossary.map(exportGlossaryEntry),
    characters: guide.characters.map(exportCharacterProfile),
  };
}

export function serializeWorkGlossaryFile(file: WorkGlossaryFileV1): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function parseWorkGlossaryFile(
  text: string,
): WorkGlossaryFileParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/u, ""));
  } catch (_error) {
    return { ok: false, error: "invalid-json", invalidCount: 0 };
  }
  const located = locateCollections(value);
  if (!located.ok) return { ...located, invalidCount: 0 };
  const glossary = admitEach(located.glossary, ImportedGlossaryEntrySchema);
  const characters = admitEach(
    located.characters,
    ImportedCharacterProfileSchema,
  );
  const invalidCount = glossary.invalid + characters.invalid;
  if (glossary.valid.length + characters.valid.length === 0) {
    return { ok: false, error: "empty", invalidCount };
  }
  return {
    ok: true,
    file: {
      ...(located.workTitle ? { workTitle: located.workTitle } : {}),
      glossary: glossary.valid,
      characters: characters.valid,
      invalidCount,
    },
  };
}

type LocatedCollections =
  | {
      ok: true;
      glossary: unknown[];
      characters: unknown[];
      workTitle?: string;
    }
  | { ok: false; error: "unrecognized" | "unsupported-version" };

function locateCollections(value: unknown): LocatedCollections {
  const root = asRecord(value);
  if (!root) return { ok: false, error: "unrecognized" };
  if (
    root.format === WORK_GLOSSARY_FILE_FORMAT &&
    root.version !== WORK_GLOSSARY_FILE_VERSION
  ) {
    return { ok: false, error: "unsupported-version" };
  }
  // A raw style-guide.json keeps the arrays at the top; the MCP context export nests them.
  const holder = Array.isArray(root.glossary)
    ? root
    : (asRecord(root.guide) ?? root);
  const glossary = holder.glossary;
  const characters = holder.characters;
  if (!Array.isArray(glossary) && !Array.isArray(characters)) {
    return { ok: false, error: "unrecognized" };
  }
  const workTitle =
    typeof root.workTitle === "string" ? root.workTitle.trim() : "";
  return {
    ok: true,
    glossary: Array.isArray(glossary) ? glossary : [],
    characters: Array.isArray(characters) ? characters : [],
    ...(workTitle ? { workTitle: workTitle.slice(0, 260) } : {}),
  };
}

function admitEach<T>(
  items: unknown[],
  schema: z.ZodType<T>,
): { valid: T[]; invalid: number } {
  const valid: T[] = [];
  let invalid = 0;
  for (const item of items) {
    const parsed = schema.safeParse(item);
    if (parsed.success) valid.push(parsed.data);
    else invalid += 1;
  }
  return { valid, invalid };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exportGlossaryEntry(entry: GlossaryEntry): ImportedGlossaryEntry {
  return withoutEmptyOptionals({
    source: entry.source,
    target: entry.target,
    category: entry.category,
    aliases: entry.aliases,
    note: entry.note,
    origin: entry.origin,
    enabled: entry.enabled,
  });
}

function exportCharacterProfile(
  character: CharacterProfile,
): ImportedCharacterProfile {
  return withoutEmptyOptionals({
    displayName: character.displayName,
    sourceNames: character.sourceNames,
    targetName: character.targetName,
    aliases: character.aliases,
    speechStyle: character.speechStyle,
    customSpeechStyle: character.customSpeechStyle,
    note: character.note,
    origin: character.origin,
    enabled: character.enabled,
  });
}

function withoutEmptyOptionals<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, field]) =>
        field !== undefined &&
        field !== "" &&
        !(Array.isArray(field) && field.length === 0),
    ),
  ) as T;
}
