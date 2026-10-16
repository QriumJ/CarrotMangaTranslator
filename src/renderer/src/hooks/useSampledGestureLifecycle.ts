import {
  useEffect,
  useLayoutEffect,
  useRef,
  type MutableRefObject,
} from "react";
import { useSampledRetouch } from "../inpainting/sampledRetouchModel";
import { inpaintingGateway } from "../api/inpaintingGateway";
import { clearRetouchLiveOverlay } from "../lib/retouchLiveOverlay";
import {
  refreshSampledCursor,
  resetSampledCursorState,
} from "../lib/sampledRetouchCursor";
import type { UseWorkspaceInpaintingPointerHandlersOptions } from "./workspaceInpaintingPointerTypes";

export function useSampledGestureLifecycle(
  pageId: string | undefined,
  imagePath: string | undefined,
  tool: UseWorkspaceInpaintingPointerHandlersOptions["inpaintingTool"],
  stageRef: UseWorkspaceInpaintingPointerHandlersOptions["stageRef"],
): void {
  const model = useSampledRetouch();
  const modelRef = useRef(model);
  useLayoutEffect(() => {
    modelRef.current = model;
  }, [model]);
  useEffect(() => {
    const state = modelRef.current;
    if (!state || state.committedPath.current === imagePath) return;
    state.anchor.current = null;
    state.offset.current = null;
    state.stroke.current = null;
    state.setHasAnchor(false);
    clearRetouchLiveOverlay(stageRef.current);
  }, [imagePath, stageRef]);
  useEffect(() => {
    const stage = stageRef.current;
    return () => {
      const state = modelRef.current;
      if (!state) return;
      state.previewCleanup.current?.();
      state.stroke.current = null;
      state.anchor.current = null;
      state.offset.current = null;
      state.setHasAnchor(false);
      void inpaintingGateway
        .cancelInpaintingRetouch(state.pending.current)
        .catch(console.error);
      clearRetouchLiveOverlay(stage);
    };
  }, [pageId, stageRef]);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      const state = modelRef.current;
      if (event.key !== "Escape" || !state) return;
      // Disarming the picker or cancelling a save keeps the tool selected.
      if (state.sampling || state.pending.current) event.preventDefault();
      state.stroke.current = null;
      state.setSampling(false);
      if (state.pending.current)
        void inpaintingGateway
          .cancelInpaintingRetouch(state.pending.current)
          .catch(console.error);
      clearRetouchLiveOverlay(stageRef.current);
    };
    window.addEventListener("keydown", cancel, true);
    return () => window.removeEventListener("keydown", cancel, true);
  }, [stageRef]);
  useEffect(() => {
    const state = modelRef.current;
    if (tool !== "clone" && tool !== "heal" && state) {
      state.stroke.current = null;
      state.setSampling(false);
    }
  }, [tool]);
  useSampledPickKeys(tool, stageRef, modelRef, model?.sampling ?? false);
}

/** Holding Alt (Option) turns the brush into a source picker, like Photoshop. */
function useSampledPickKeys(
  tool: UseWorkspaceInpaintingPointerHandlersOptions["inpaintingTool"],
  stageRef: UseWorkspaceInpaintingPointerHandlersOptions["stageRef"],
  modelRef: MutableRefObject<ReturnType<typeof useSampledRetouch>>,
  sampling: boolean,
): void {
  const active = tool === "clone" || tool === "heal";
  useEffect(() => {
    const stage = stageRef.current;
    if (!active) {
      resetSampledCursorState(stage);
      return;
    }
    const update = (altHeld: boolean) => {
      const state = modelRef.current;
      if (!state || state.altHeld.current === altHeld) return;
      state.altHeld.current = altHeld;
      refreshSampledCursor(stageRef.current, {
        picking: !state.stroke.current && (altHeld || state.sampling),
      });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Alt") update(event.type === "keydown");
    };
    const onBlur = () => update(false);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [active, modelRef, stageRef]);
  useEffect(() => {
    const state = modelRef.current;
    if (!active || !state) return;
    refreshSampledCursor(stageRef.current, {
      picking: sampling || state.altHeld.current,
    });
  }, [active, modelRef, sampling, stageRef]);
}
