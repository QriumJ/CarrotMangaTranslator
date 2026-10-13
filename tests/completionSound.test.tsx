/** @vitest-environment jsdom */

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_COMPLETION_SOUND_PREFERENCES,
  normalizeCompletionSoundPreferences,
  useCompletionSoundController,
} from "../src/renderer/src/hooks/useCompletionSound";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("completion sound", () => {
  it("queues consecutive sounds without cutting playback and drops muted pending categories", async () => {
    const instances: AudioMock[] = [];
    class AudioMock {
      currentTime = 0;
      volume = 1;
      preload = "none";
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      play = vi.fn().mockResolvedValue(undefined);
      pause = vi.fn();
      constructor() {
        instances.push(this);
      }
    }
    vi.stubGlobal("Audio", AudioMock);
    const sound = renderHook(() => useCompletionSoundController());
    act(() =>
      sound.result.current.setPreferences({ muted: false, volume: 0.5 }),
    );
    act(() => {
      sound.result.current.playCompletionSound("translation");
      sound.result.current.playCompletionSound("research");
      sound.result.current.playCompletionSound("source-erasing");
    });
    const audio = instances[0];
    expect(audio.play).toHaveBeenCalledTimes(1);
    audio.currentTime = 0.3;
    act(() =>
      sound.result.current.setPreferences({
        muted: false,
        volume: 0.4,
        researchMuted: true,
      }),
    );
    expect(audio.currentTime).toBe(0.3);
    act(() => audio.onended?.());
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.volume).toBe(0.4);
    act(() => audio.onended?.());
    expect(audio.play).toHaveBeenCalledTimes(2);
    act(() => sound.result.current.playCompletionSound("translation"));
    const staleEnded = audio.onended;
    act(() =>
      sound.result.current.setPreferences({ muted: true, volume: 0.4 }),
    );
    expect(audio.pause).toHaveBeenCalledOnce();
    act(() => staleEnded?.());
    act(() =>
      sound.result.current.setPreferences({ muted: false, volume: 0.4 }),
    );
    expect(audio.play).toHaveBeenCalledTimes(3);
    sound.unmount();
    expect(audio.onended).toBeNull();
  });

  it("continues the queue after a rejected playback and ignores its stale callback", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let audio!: AudioMock;
    class AudioMock {
      currentTime = 0;
      volume = 1;
      preload = "";
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      play = vi
        .fn()
        .mockRejectedValueOnce(new Error("device unavailable"))
        .mockResolvedValue(undefined);
      pause = vi.fn();
      constructor() {
        audio = this;
      }
    }
    vi.stubGlobal("Audio", AudioMock);
    const sound = renderHook(() => useCompletionSoundController());
    act(() =>
      sound.result.current.setPreferences({ muted: false, volume: 0.5 }),
    );
    await act(async () => {
      sound.result.current.playCompletionSound("translation");
      sound.result.current.playCompletionSound("research");
    });
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
  it("defaults to muted and persists the user's volume preference", () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    const audioInstances: AudioMock[] = [];

    class AudioMock {
      currentTime = 7;
      preload = "none";
      volume = 1;

      constructor(readonly src: string) {
        audioInstances.push(this);
      }

      play = play;
      pause = pause;
    }

    vi.stubGlobal("Audio", AudioMock);
    const first = renderHook(() => useCompletionSoundController());

    expect(first.result.current).toMatchObject(
      DEFAULT_COMPLETION_SOUND_PREFERENCES,
    );
    act(() => first.result.current.playCompletionSound("translation"));
    expect(audioInstances).toHaveLength(0);

    act(() =>
      first.result.current.setPreferences({ muted: false, volume: 0.42 }),
    );
    act(() => first.result.current.playCompletionSound("translation"));

    expect(audioInstances).toHaveLength(1);
    expect(audioInstances[0]?.src).toContain("completion.ogg");
    expect(audioInstances[0]?.preload).toBe("auto");
    expect(audioInstances[0]?.volume).toBe(0.42);
    expect(audioInstances[0]?.currentTime).toBe(0);
    expect(play).toHaveBeenCalledOnce();

    first.unmount();
    expect(pause).toHaveBeenCalledOnce();

    const second = renderHook(() => useCompletionSoundController());
    expect(second.result.current).toMatchObject({ muted: false, volume: 0.42 });
  });

  it("normalizes corrupt or out-of-range stored preferences", () => {
    expect(normalizeCompletionSoundPreferences(null)).toEqual(
      DEFAULT_COMPLETION_SOUND_PREFERENCES,
    );
    expect(
      normalizeCompletionSoundPreferences({ muted: false, volume: -3 }),
    ).toEqual({
      muted: false,
      volume: 0,
      translationMuted: false,
      soundEffectMuted: false,
      sourceErasingMuted: false,
      researchMuted: false,
    });
    expect(
      normalizeCompletionSoundPreferences({ muted: "no", volume: 4 }),
    ).toEqual({
      muted: true,
      volume: 1,
      translationMuted: false,
      soundEffectMuted: false,
      sourceErasingMuted: false,
      researchMuted: false,
    });
    expect(
      normalizeCompletionSoundPreferences({
        muted: false,
        volume: 0.7,
        translationMuted: true,
        soundEffectMuted: true,
        sourceErasingMuted: false,
        researchMuted: true,
      }),
    ).toEqual({
      muted: false,
      volume: 0.7,
      translationMuted: true,
      soundEffectMuted: true,
      sourceErasingMuted: false,
      researchMuted: true,
    });
  });

  it("honors the master and per-completion mute preferences", () => {
    const play = vi.fn().mockResolvedValue(undefined);
    class AudioMock {
      currentTime = 0;
      preload = "none";
      volume = 1;
      play = play;
      pause = vi.fn();
    }
    vi.stubGlobal("Audio", AudioMock);
    const sound = renderHook(() => useCompletionSoundController());

    act(() =>
      sound.result.current.setPreferences({
        muted: false,
        volume: 0.5,
        translationMuted: true,
        soundEffectMuted: true,
        sourceErasingMuted: false,
        researchMuted: true,
      }),
    );
    act(() => sound.result.current.playCompletionSound("translation"));
    act(() => sound.result.current.playCompletionSound("sound-effect"));
    act(() => sound.result.current.playCompletionSound("research"));
    expect(play).not.toHaveBeenCalled();

    act(() => sound.result.current.playCompletionSound("source-erasing"));
    expect(play).toHaveBeenCalledOnce();
  });
});
