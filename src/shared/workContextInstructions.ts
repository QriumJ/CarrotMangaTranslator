import type {
  CharacterProfile,
  CharacterSpeechStyle,
  WorkStyleGuide,
  WorkTranslationRules,
} from "./workContextTypes";

export const MAX_WORK_INSTRUCTIONS_LENGTH = 8000;
export const MAX_CHARACTER_VOICE_LENGTH = 1200;

const LEGACY_VOICES: Record<CharacterSpeechStyle, string> = {
  neutral: "",
  polite: "정중한 존댓말을 사용한다.",
  casual: "편안한 반말을 사용한다.",
  rough: "거칠고 직설적인 말투를 사용한다.",
  childish: "어린아이처럼 쉽고 천진한 말투를 사용한다.",
  elderly: "나이 든 인물에 어울리는 말투를 사용한다.",
  formal: "격식을 갖춘 말투를 사용한다.",
  custom: "",
};

/** Legacy enum fields remain readable for existing work files and exports. */
export function characterVoiceText(
  character: Pick<CharacterProfile, "speechStyle" | "customSpeechStyle">,
): string {
  const text = character.customSpeechStyle ?? "";
  if (character.speechStyle === "custom") return text;
  return [LEGACY_VOICES[character.speechStyle], text]
    .filter(Boolean)
    .join("\n");
}

export function workInstructionsText(rules: WorkTranslationRules): string {
  // An explicitly empty prompt is a deliberate choice, not a legacy default.
  if (typeof rules.prompt === "string") return rules.prompt;
  const honorifics = {
    preserve: "원문의 호칭과 경칭을 유지한다.",
    adapt: "호칭과 경칭은 번역 언어와 인물 관계에 맞게 자연스럽게 옮긴다.",
    drop: "호칭에 붙은 경칭은 생략한다.",
  };
  const sounds = {
    preserve: "효과음은 원문 표기를 유지한다.",
    translate: "효과음은 번역 언어의 자연스러운 효과음으로 옮긴다.",
    note: "효과음은 의미를 설명하는 형태로 옮긴다.",
  };
  return [
    honorifics[rules.honorifics],
    sounds[rules.sfxMode],
    rules.defaultTone === "literal"
      ? "원문의 표현과 의미를 살려 직역에 가깝게 번역한다."
      : "번역 언어에 맞는 자연스러운 대사로 번역한다.",
  ].join("\n");
}

/** Idempotent conversion; reading never rewrites the user's file. */
export function migrateWorkContextInstructions(
  guide: WorkStyleGuide,
): WorkStyleGuide {
  return {
    ...guide,
    rules: { ...guide.rules, prompt: workInstructionsText(guide.rules) },
    characters: guide.characters.map((character) => ({
      ...character,
      speechStyle: "custom",
      customSpeechStyle: characterVoiceText(character),
    })),
  };
}

export type WorkInstructionSnapshot = {
  workId: string;
  prompt: string;
  characters: CharacterProfile[];
};

export function captureWorkInstructions(
  guide: WorkStyleGuide,
): WorkInstructionSnapshot {
  return {
    workId: guide.workId,
    prompt: workInstructionsText(guide.rules),
    characters: structuredClone(
      migrateWorkContextInstructions(guide).characters,
    ),
  };
}

export function applyWorkInstructions(
  guide: WorkStyleGuide,
  snapshot: WorkInstructionSnapshot,
): WorkStyleGuide {
  if (guide.workId !== snapshot.workId)
    throw new Error("번역 지침의 작품이 일치하지 않습니다.");
  const savedIds = new Set(
    snapshot.characters.map((character) => character.id),
  );
  return {
    ...guide,
    rules: { ...guide.rules, prompt: snapshot.prompt },
    characters: [
      ...structuredClone(snapshot.characters),
      ...guide.characters.filter((character) => !savedIds.has(character.id)),
    ],
  };
}
