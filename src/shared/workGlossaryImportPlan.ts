import {
  MAX_CHARACTER_PROFILES,
  MAX_GLOSSARY_ENTRIES,
} from "./ipcSchemaPrimitives";
import type {
  ImportedCharacterProfile,
  ImportedGlossaryEntry,
  ParsedWorkGlossaryFile,
} from "./workGlossaryFile";
import type {
  CharacterProfile,
  GlossaryEntry,
  WorkStyleGuide,
} from "./workContextTypes";

/** How an entry whose name already exists with different content is resolved. */
export type WorkGlossaryConflictPolicy = "keep-existing" | "use-imported";

type WorkGlossaryImportConflict<TExisting, TIncoming> = {
  existing: TExisting;
  incoming: TIncoming;
};

type CollectionPlan<TExisting, TIncoming> = {
  added: TIncoming[];
  /** Same name and same content: nothing to change. */
  unchanged: number;
  conflicts: WorkGlossaryImportConflict<TExisting, TIncoming>[];
  /** Later repeats of a name inside the same file. The first one is used. */
  repeatedInFile: number;
  /** New entries beyond the stored entry limit; they are not added. */
  overLimit: number;
};

export type WorkGlossaryImportPlan = {
  glossary: CollectionPlan<GlossaryEntry, ImportedGlossaryEntry>;
  characters: CollectionPlan<CharacterProfile, ImportedCharacterProfile>;
  invalidCount: number;
};

export type WorkGlossaryImportResult = {
  guide: WorkStyleGuide;
  added: number;
  replaced: number;
};

/** Keys compare names the way people read them: width, spacing and case folded. */
function workGlossaryNameKey(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

export function planWorkGlossaryImport(
  guide: Pick<WorkStyleGuide, "glossary" | "characters">,
  file: ParsedWorkGlossaryFile,
): WorkGlossaryImportPlan {
  return {
    glossary: planCollection({
      existing: guide.glossary,
      incoming: file.glossary,
      limit: MAX_GLOSSARY_ENTRIES,
      existingKeys: (entry) => [workGlossaryNameKey(entry.source)],
      incomingKeys: (entry) => [workGlossaryNameKey(entry.source)],
      sameContent: sameGlossaryContent,
    }),
    characters: planCollection({
      existing: guide.characters,
      incoming: file.characters,
      limit: MAX_CHARACTER_PROFILES,
      existingKeys: characterKeys,
      incomingKeys: characterKeys,
      sameContent: sameCharacterContent,
    }),
    invalidCount: file.invalidCount,
  };
}

export function applyWorkGlossaryImport(
  guide: WorkStyleGuide,
  plan: WorkGlossaryImportPlan,
  policy: WorkGlossaryConflictPolicy,
  context: { now: string; createId: (prefix: string) => string },
): WorkGlossaryImportResult {
  const replace = policy === "use-imported";
  const glossaryReplacements = replace
    ? new Map(
        plan.glossary.conflicts.map(({ existing, incoming }) => [
          existing.id,
          replaceGlossaryEntry(existing, incoming, context.now),
        ]),
      )
    : new Map<string, GlossaryEntry>();
  const characterReplacements = replace
    ? new Map(
        plan.characters.conflicts.map(({ existing, incoming }) => [
          existing.id,
          replaceCharacterProfile(existing, incoming, context.now),
        ]),
      )
    : new Map<string, CharacterProfile>();
  const glossary = [
    ...guide.glossary.map(
      (entry) => glossaryReplacements.get(entry.id) ?? entry,
    ),
    ...plan.glossary.added.map((entry) =>
      createGlossaryEntry(entry, context.now, context.createId("glossary")),
    ),
  ];
  const characters = [
    ...guide.characters.map(
      (character) => characterReplacements.get(character.id) ?? character,
    ),
    ...plan.characters.added.map((character) =>
      createCharacterProfile(
        character,
        context.now,
        context.createId("character"),
      ),
    ),
  ];
  return {
    guide: { ...guide, glossary, characters },
    added: plan.glossary.added.length + plan.characters.added.length,
    replaced: glossaryReplacements.size + characterReplacements.size,
  };
}

function planCollection<TExisting, TIncoming>({
  existing,
  incoming,
  limit,
  existingKeys,
  incomingKeys,
  sameContent,
}: {
  existing: readonly TExisting[];
  incoming: readonly TIncoming[];
  limit: number;
  existingKeys: (entry: TExisting) => string[];
  incomingKeys: (entry: TIncoming) => string[];
  sameContent: (existing: TExisting, incoming: TIncoming) => boolean;
}): CollectionPlan<TExisting, TIncoming> {
  const byKey = new Map<string, TExisting>();
  for (const entry of existing)
    for (const key of existingKeys(entry))
      if (!byKey.has(key)) byKey.set(key, entry);
  const seen = new Set<string>();
  const matched = new Set<TExisting>();
  const plan: CollectionPlan<TExisting, TIncoming> = {
    added: [],
    unchanged: 0,
    conflicts: [],
    repeatedInFile: 0,
    overLimit: 0,
  };
  for (const entry of incoming) {
    const keys = incomingKeys(entry);
    if (keys.some((key) => seen.has(key))) {
      plan.repeatedInFile += 1;
      continue;
    }
    keys.forEach((key) => seen.add(key));
    const match = keys.map((key) => byKey.get(key)).find(Boolean);
    if (match && matched.has(match)) plan.repeatedInFile += 1;
    else if (match) {
      matched.add(match);
      if (sameContent(match, entry)) plan.unchanged += 1;
      else plan.conflicts.push({ existing: match, incoming: entry });
    } else if (existing.length + plan.added.length >= limit)
      plan.overLimit += 1;
    else plan.added.push(entry);
  }
  return plan;
}

function characterKeys(
  character: Pick<
    CharacterProfile,
    "displayName" | "sourceNames" | "targetName"
  >,
): string[] {
  const names = character.sourceNames.length
    ? character.sourceNames
    : [character.displayName || character.targetName];
  return [...new Set(names.map(workGlossaryNameKey).filter(Boolean))];
}

function sameGlossaryContent(
  existing: GlossaryEntry,
  incoming: ImportedGlossaryEntry,
): boolean {
  return (
    existing.target.trim() === incoming.target &&
    existing.category === incoming.category
  );
}

function sameCharacterContent(
  existing: CharacterProfile,
  incoming: ImportedCharacterProfile,
): boolean {
  return (
    existing.targetName.trim() === incoming.targetName &&
    existing.speechStyle === incoming.speechStyle &&
    (existing.customSpeechStyle ?? "").trim() ===
      (incoming.customSpeechStyle ?? "").trim()
  );
}

function mergeNames(current: string[] = [], next: string[] = []): string[] {
  const merged = new Map<string, string>();
  for (const name of [...current, ...next]) {
    const key = workGlossaryNameKey(name);
    if (key && !merged.has(key)) merged.set(key, name.trim());
  }
  return [...merged.values()].slice(0, 50);
}

function replaceGlossaryEntry(
  existing: GlossaryEntry,
  incoming: ImportedGlossaryEntry,
  now: string,
): GlossaryEntry {
  return {
    ...existing,
    target: incoming.target,
    category: incoming.category,
    aliases: mergeNames(existing.aliases, incoming.aliases),
    note: incoming.note?.trim() ? incoming.note : (existing.note ?? ""),
    origin: "manual",
    updatedAt: now,
  };
}

function replaceCharacterProfile(
  existing: CharacterProfile,
  incoming: ImportedCharacterProfile,
  now: string,
): CharacterProfile {
  return {
    ...existing,
    targetName: incoming.targetName,
    sourceNames: mergeNames(existing.sourceNames, incoming.sourceNames),
    aliases: mergeNames(existing.aliases, incoming.aliases),
    speechStyle: incoming.speechStyle,
    customSpeechStyle: incoming.customSpeechStyle ?? "",
    note: incoming.note?.trim() ? incoming.note : (existing.note ?? ""),
    origin: "manual",
    updatedAt: now,
  };
}

function createGlossaryEntry(
  entry: ImportedGlossaryEntry,
  now: string,
  id: string,
): GlossaryEntry {
  return {
    id,
    source: entry.source,
    target: entry.target,
    category: entry.category,
    aliases: mergeNames(entry.aliases),
    note: entry.note ?? "",
    origin: entry.origin ?? "manual",
    enabled: entry.enabled,
    createdAt: now,
    updatedAt: now,
  };
}

function createCharacterProfile(
  character: ImportedCharacterProfile,
  now: string,
  id: string,
): CharacterProfile {
  return {
    id,
    displayName:
      character.displayName ||
      character.targetName ||
      character.sourceNames[0] ||
      "",
    sourceNames: mergeNames(character.sourceNames),
    targetName: character.targetName,
    aliases: mergeNames(character.aliases),
    speechStyle: character.speechStyle,
    customSpeechStyle: character.customSpeechStyle ?? "",
    note: character.note ?? "",
    origin: character.origin ?? "manual",
    enabled: character.enabled,
    createdAt: now,
    updatedAt: now,
  };
}
