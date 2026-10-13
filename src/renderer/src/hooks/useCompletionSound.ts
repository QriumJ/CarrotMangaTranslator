import React from "react";
import completionSoundUrl from "../assets/audio/completion.ogg";

export type CompletionSoundPreferences = {
  muted: boolean;
  volume: number;
  translationMuted?: boolean;
  soundEffectMuted?: boolean;
  sourceErasingMuted?: boolean;
  researchMuted?: boolean;
};

export type CompletionSoundCategory =
  "translation" | "sound-effect" | "source-erasing" | "research";

export type ResolvedCompletionSoundPreferences =
  Required<CompletionSoundPreferences>;

export const DEFAULT_COMPLETION_SOUND_PREFERENCES: ResolvedCompletionSoundPreferences =
  {
    muted: true,
    volume: 0.55,
    translationMuted: false,
    soundEffectMuted: false,
    sourceErasingMuted: false,
    researchMuted: false,
  };

const COMPLETION_SOUND_STORAGE_KEY =
  "carrot-manga-translator.completion-sound.v1";

export function useCompletionSoundController() {
  const [preferences, setStoredPreferences] = React.useState(
    readCompletionSoundPreferences,
  );
  const playerRef = React.useRef<ReturnType<
    typeof createCompletionPlayback
  > | null>(null);

  React.useEffect(() => {
    writeCompletionSoundPreferences(preferences);
    playerRef.current?.update(preferences);
  }, [preferences]);

  React.useEffect(
    () => () => {
      playerRef.current?.dispose();
      playerRef.current = null;
    },
    [],
  );

  const setPreferences = React.useCallback(
    (next: CompletionSoundPreferences): void => {
      setStoredPreferences(normalizeCompletionSoundPreferences(next));
    },
    [],
  );

  const playCompletionSound = React.useCallback(
    (category: CompletionSoundCategory): void => {
      if (
        preferences.muted ||
        preferences.volume <= 0 ||
        isCategoryMuted(preferences, category)
      ) {
        return;
      }
      try {
        const player =
          playerRef.current ?? createCompletionPlayback(preferences);
        playerRef.current = player;
        player.update(preferences);
        player.enqueue(category);
      } catch (error) {
        console.warn("Could not prepare the completion sound.", error);
      }
    },
    [preferences],
  );

  return {
    ...preferences,
    playCompletionSound,
    setPreferences,
  };
}

function createCompletionPlayback(initial: ResolvedCompletionSoundPreferences) {
  const audio = new Audio(completionSoundUrl);
  audio.preload = "auto";
  let preferences = initial;
  let queue: CompletionSoundCategory[] = [];
  let active: CompletionSoundCategory | null = null;
  let generation = 0;
  let disposed = false;
  const accepts = (category: CompletionSoundCategory) =>
    !preferences.muted &&
    preferences.volume > 0 &&
    !isCategoryMuted(preferences, category);
  const next = () => {
    if (disposed || active) return;
    const category = queue.shift();
    if (!category) return;
    active = category;
    const current = ++generation;
    const done = () => {
      if (current !== generation || disposed) return;
      active = null;
      next();
    };
    audio.onended = done;
    audio.onerror = () => {
      console.warn("Could not play the completion sound.", audio.error);
      done();
    };
    audio.volume = preferences.volume;
    audio.currentTime = 0;
    try {
      const playback = audio.play();
      void playback?.catch((error: unknown) => {
        console.warn("Could not play the completion sound.", error);
        done();
      });
    } catch (error) {
      console.warn("Could not play the completion sound.", error);
      done();
    }
  };
  return {
    enqueue(category: CompletionSoundCategory) {
      if (disposed || !accepts(category)) return;
      queue.push(category);
      next();
    },
    update(value: ResolvedCompletionSoundPreferences) {
      preferences = value;
      audio.volume = value.volume;
      queue = queue.filter(accepts);
      if (active && !accepts(active)) {
        generation += 1;
        audio.pause();
        active = null;
        next();
      }
    },
    dispose() {
      disposed = true;
      queue = [];
      generation += 1;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    },
  };
}

export function normalizeCompletionSoundPreferences(
  value: unknown,
): ResolvedCompletionSoundPreferences {
  if (!isRecord(value)) return { ...DEFAULT_COMPLETION_SOUND_PREFERENCES };
  const volume =
    typeof value.volume === "number" && Number.isFinite(value.volume)
      ? Math.min(1, Math.max(0, value.volume))
      : DEFAULT_COMPLETION_SOUND_PREFERENCES.volume;
  return {
    muted:
      typeof value.muted === "boolean"
        ? value.muted
        : DEFAULT_COMPLETION_SOUND_PREFERENCES.muted,
    volume,
    translationMuted:
      typeof value.translationMuted === "boolean"
        ? value.translationMuted
        : false,
    soundEffectMuted:
      typeof value.soundEffectMuted === "boolean"
        ? value.soundEffectMuted
        : false,
    sourceErasingMuted:
      typeof value.sourceErasingMuted === "boolean"
        ? value.sourceErasingMuted
        : false,
    researchMuted:
      typeof value.researchMuted === "boolean" ? value.researchMuted : false,
  };
}

function isCategoryMuted(
  preferences: ResolvedCompletionSoundPreferences,
  category: CompletionSoundCategory,
): boolean {
  if (category === "translation") return preferences.translationMuted;
  if (category === "sound-effect") return preferences.soundEffectMuted;
  if (category === "source-erasing") return preferences.sourceErasingMuted;
  return preferences.researchMuted;
}

function readCompletionSoundPreferences(): ResolvedCompletionSoundPreferences {
  if (typeof window === "undefined") {
    return { ...DEFAULT_COMPLETION_SOUND_PREFERENCES };
  }
  try {
    const stored = window.localStorage.getItem(COMPLETION_SOUND_STORAGE_KEY);
    return stored
      ? normalizeCompletionSoundPreferences(JSON.parse(stored))
      : { ...DEFAULT_COMPLETION_SOUND_PREFERENCES };
  } catch (error) {
    void error; // localStorage may be unavailable in hardened renderers.
    return { ...DEFAULT_COMPLETION_SOUND_PREFERENCES };
  }
}

function writeCompletionSoundPreferences(
  preferences: ResolvedCompletionSoundPreferences,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      COMPLETION_SOUND_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch (error) {
    void error; // Preference persistence must not interrupt job completion.
    // A read-only renderer storage area should not break job completion.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
