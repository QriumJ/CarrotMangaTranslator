import { useCallback, useState } from "react";

export function useEditorTextTabRequest() {
  const [editorTextTabRequestToken, setToken] = useState(0);
  const [editorTextResetToken, setResetToken] = useState(0);
  const resetEditorTextSelection = useCallback(() => {
    setToken(0);
    setResetToken((current) => current + 1);
  }, []);
  const requestEditorTextTab = useCallback(() => {
    setToken((current) => current + 1);
  }, []);
  return {
    editorTextTabRequestToken,
    requestEditorTextTab,
    editorTextResetToken,
    resetEditorTextSelection,
  };
}
