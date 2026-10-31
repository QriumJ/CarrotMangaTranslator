import { appUpdateGateway } from "../api/appUpdateGateway";
import { pendingPageEdits } from "./pageEditBarrier";
import { receiveAppUpdate, refreshAppUpdate } from "./appUpdateStore";

/** Installed in every editor window, independently of the status popup lifetime. */
export function initializeAppUpdates(root: HTMLElement): () => void {
  let active: string | null = null;
  let originallyInert = false;
  const blockInput = (event: Event) => {
    if (active) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  for (const event of [
    "keydown",
    "pointerdown",
    "click",
    "beforeinput",
    "drop",
  ])
    window.addEventListener(event, blockInput, true);
  const unsubscribeState = appUpdateGateway.onAppUpdateState(receiveAppUpdate);
  const unsubscribePreparation = appUpdateGateway.onAppUpdatePreparation(
    (request) => {
      if (request.stage === "release") {
        if (active === request.id) {
          root.inert = originallyInert;
          active = null;
        }
        return;
      }
      const stage = request.stage;
      void (async () => {
        let error: string | undefined;
        try {
          if (request.stage === "lock") {
            if (active && active !== request.id)
              throw new Error("Another update is preparing");
            if (!active) originallyInert = root.inert;
            active = request.id;
            root.inert = true;
          } else {
            if (active !== request.id)
              throw new Error("Update preparation expired");
            await pendingPageEdits.flushEnvironment();
          }
        } catch (cause) {
          error = String(cause).slice(0, 500);
        }
        await appUpdateGateway.acknowledgeAppUpdate({
          id: request.id,
          stage,
          ...(error ? { error } : {}),
        });
      })().catch((error) =>
        console.error("Update preparation acknowledgement failed", error),
      );
    },
  );
  void refreshAppUpdate().catch((error) =>
    console.error("Could not read update status", error),
  );
  return () => {
    for (const event of [
      "keydown",
      "pointerdown",
      "click",
      "beforeinput",
      "drop",
    ])
      window.removeEventListener(event, blockInput, true);
    unsubscribeState();
    unsubscribePreparation();
    if (active) root.inert = originallyInert;
  };
}
