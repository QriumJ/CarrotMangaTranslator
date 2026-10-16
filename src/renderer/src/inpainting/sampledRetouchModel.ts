import { createContext, useContext, useRef, useState } from "react";
import { useWorkspacePreference } from "../hooks/useWorkspacePreference";
import type {
  RetouchApplyOperation,
  RetouchPoint,
} from "../hooks/inpaintingRetouchTypes";

export function useSampledRetouchState() {
  const [source, setSource] = useWorkspacePreference("stampSource");
  const [aligned, setAligned] = useWorkspacePreference("stampAligned");
  const [opacity, setOpacity] = useWorkspacePreference("stampOpacity", {
    commitDelayMs: 250,
  });
  const [cloneHardness, setCloneHardness] = useWorkspacePreference(
    "cloneHardness",
    { commitDelayMs: 250 },
  );
  const [healHardness, setHealHardness] = useWorkspacePreference(
    "healHardness",
    { commitDelayMs: 250 },
  );
  const [sampling, setSampling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasAnchor, setHasAnchor] = useState(false);
  const anchor = useRef<RetouchPoint | null>(null);
  const offset = useRef<RetouchPoint | null>(null);
  const stroke = useRef<RetouchApplyOperation | null>(null);
  const pending = useRef<string | null>(null);
  const previewCleanup = useRef<(() => void) | null>(null);
  const committedPath = useRef<string | null>(null);
  // Read on every pointer move; a ref keeps Alt from re-rendering the app.
  const altHeld = useRef(false);
  return {
    altHeld,
    source,
    setSource,
    aligned,
    setAligned,
    opacity,
    setOpacity,
    cloneHardness,
    setCloneHardness,
    healHardness,
    setHealHardness,
    sampling,
    setSampling,
    busy,
    setBusy,
    hasAnchor,
    setHasAnchor,
    anchor,
    offset,
    stroke,
    pending,
    committedPath,
    previewCleanup,
  };
}

export const SampledRetouchContext = createContext<ReturnType<
  typeof useSampledRetouchState
> | null>(null);

export function useSampledRetouch() {
  return useContext(SampledRetouchContext);
}
