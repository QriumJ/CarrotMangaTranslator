import React from "react";
import {
  hexToRgb,
  hsvToRgb,
  rgbToHex,
  rgbToHsv,
  type HsvColor,
} from "../../lib/cssColor";

/** Releases a change the owner never reflects back (e.g. it was rejected). */
const IN_FLIGHT_TIMEOUT_MS = 160;
/**
 * After the owner applied a change, the picker gets twice that time to itself,
 * so a slow owner takes at most a third of the main thread during a drag.
 */
const IDLE_GAP_PER_OWNER_MS = 2;
/** Keeps the page preview alive (≥ 4 per second) behind a very slow owner. */
const MAX_IDLE_GAP_MS = 250;

type ColorDraft = { hsv: HsvColor; hex: string };

export type PacedColorDraft = ColorDraft & {
  setHsv: (next: HsvColor) => void;
  setHex: (next: string) => void;
  /** Applies `next` now, skipping the pacing; for one-shot picks. */
  commitHex: (next: string) => void;
};

/**
 * Local color state for an open picker, paced against its owner.
 *
 * Applying a color re-renders whatever it colors (a page, the workspace), which
 * can take longer than a frame. The native picker sent every sample, so those
 * renders queued up behind each other and the drag lagged. Here:
 * - the picker renders each sample by itself, never batched with the owner;
 * - the owner gets one change at a time, always the newest sample;
 * - after the owner applied a change, the next one waits twice as long as that
 *   one took, so even a slow owner leaves two thirds of the time to the picker.
 */
export function usePacedColorDraft(
  value: string,
  onChange: (value: string) => void,
): PacedColorDraft {
  const [draft, setDraft] = React.useState<ColorDraft>(() => fromHex(value));
  const pacer = useChangePacer(value, onChange);

  // Adopt changes made outside the picker once none of ours is outstanding.
  React.useEffect(() => {
    if (pacer.isIdle() && value !== draft.hex) setDraft(fromHex(value));
  }, [draft.hex, pacer, value]);

  return {
    ...draft,
    setHsv: (hsv) => {
      const hex = rgbToHex(hsvToRgb(hsv));
      setDraft({ hsv, hex });
      pacer.send(hex);
    },
    setHex: (hex) => {
      setDraft(fromHex(hex));
      pacer.send(hex);
    },
    commitHex: (hex) => {
      setDraft(fromHex(hex));
      pacer.sendNow(hex);
    },
  };
}

function fromHex(hex: string): ColorDraft {
  return { hsv: rgbToHsv(hexToRgb(hex)), hex };
}

type ChangePacer = {
  isIdle: () => boolean;
  send: (hex: string) => void;
  sendNow: (hex: string) => void;
};

type OwnedPacer = ChangePacer & {
  /** Called after the owner rendered `value`, with its current handler. */
  observe: (value: string, onChange: (value: string) => void) => void;
  /** Applies a still-pending sample; used when the picker closes. */
  dispose: () => void;
};

function useChangePacer(
  value: string,
  onChange: (value: string) => void,
): ChangePacer {
  const [pacer] = React.useState(() => createChangePacer(value, onChange));
  // Layout timing measures the owner's render without the wait for paint.
  React.useLayoutEffect(() => {
    pacer.observe(value, onChange);
  }, [onChange, pacer, value]);
  // Closing mid-drag still applies the last color the user saw.
  React.useEffect(() => () => pacer.dispose(), [pacer]);
  return pacer;
}

function createChangePacer(
  initialValue: string,
  initialOnChange: (value: string) => void,
): OwnedPacer {
  let value = initialValue;
  let onChange = initialOnChange;
  let inFlight: string | null = null;
  let inFlightSince = 0;
  let pending: string | null = null;
  let scheduled = 0;
  let timeout = 0;
  /** Samples arriving before this time wait; the picker owns the gap. */
  let quietUntil = 0;

  const dispatch = (hex: string): void => {
    inFlight = hex;
    inFlightSince = performance.now();
    window.clearTimeout(timeout);
    timeout = window.setTimeout(release, IN_FLIGHT_TIMEOUT_MS);
    onChange(hex);
  };
  const sendPending = (): void => {
    scheduled = 0;
    const next = pending;
    pending = null;
    if (next !== null && next !== value) dispatch(next);
  };
  // A separate task keeps the owner's render out of the picker's own render.
  const schedule = (delayMs: number): void => {
    if (!scheduled) scheduled = window.setTimeout(sendPending, delayMs);
  };
  const scheduleAfterQuiet = (): void =>
    schedule(Math.max(0, quietUntil - performance.now()));
  // Runs inside the owner's render task, usually before the pointer samples
  // that queued during that render are delivered, so the gap is a deadline.
  function release(): void {
    const now = performance.now();
    const gapMs = (now - inFlightSince) * IDLE_GAP_PER_OWNER_MS;
    quietUntil = now + Math.min(MAX_IDLE_GAP_MS, gapMs);
    window.clearTimeout(timeout);
    inFlight = null;
    if (pending !== null) scheduleAfterQuiet();
  }
  return {
    isIdle: () => inFlight === null && pending === null && !scheduled,
    send: (hex) => {
      pending = hex;
      if (inFlight === null) scheduleAfterQuiet();
    },
    sendNow: (hex) => {
      window.clearTimeout(scheduled);
      scheduled = 0;
      pending = null;
      dispatch(hex);
    },
    observe: (nextValue, nextOnChange) => {
      value = nextValue;
      onChange = nextOnChange;
      if (inFlight === nextValue) release();
    },
    dispose: () => {
      window.clearTimeout(timeout);
      window.clearTimeout(scheduled);
      if (pending !== null) onChange(pending);
      pending = null;
    },
  };
}
