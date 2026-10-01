import { renamePageValues, type PageRenameRule } from "./pageEditorRename";

self.onmessage = (
  event: MessageEvent<{
    values: string[];
    rule: PageRenameRule;
    context: { work: string; chapter: string };
  }>,
) => {
  try {
    const { values, rule, context } = event.data;
    self.postMessage({ values: renamePageValues(values, rule, context) });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof SyntaxError
          ? "regex"
          : error instanceof Error
            ? error.message
            : "rename",
    });
  }
};
