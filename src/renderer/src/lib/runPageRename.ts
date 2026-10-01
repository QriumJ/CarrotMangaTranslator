import { renamePageValues, type PageRenameRule } from "./pageEditorRename";

export async function runPageRename(
  values: string[],
  rule: PageRenameRule,
  context: { work: string; chapter: string },
): Promise<string[]> {
  if (!rule.regex || rule.kind !== "replace")
    return renamePageValues(values, rule, context);
  const worker = new Worker(
    new URL("./pageEditorRename.worker.ts", import.meta.url),
    { type: "module" },
  );
  return new Promise((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error("timeout"));
    }, 1500);
    worker.onmessage = (
      event: MessageEvent<{ values?: string[]; error?: string }>,
    ) => {
      finish();
      if (event.data.values) resolve(event.data.values);
      else reject(new Error(event.data.error ?? "rename"));
    };
    worker.onerror = () => {
      finish();
      reject(new Error("regex"));
    };
    worker.postMessage({ values, rule, context });
  });
}
