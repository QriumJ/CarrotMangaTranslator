import { createPageExportRenderSession } from "./pageExport";
import { acquireModelWorkload } from "./runtimeSupport/modelWorkload";

/** A native batch owns the hidden renderer; each page still owns its guards. */
export function acquirePageExportRenderSession(
  options: Parameters<typeof createPageExportRenderSession>[0],
  signal?: AbortSignal,
  create = createPageExportRenderSession,
) {
  return acquireModelWorkload(
    "page-renderer",
    options.dataRoot,
    signal,
    async () => {
      const session = await create(options);
      return { value: session, release: async () => session.close() };
    },
  );
}
