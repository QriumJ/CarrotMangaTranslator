import React from "react";
import { CONDITIONAL_BATCH_STARTER_SCHEME_IDS } from "../../../shared/conditionalBatchRules";
const FAVORITE_SCHEMES_STORAGE_KEY = "conditionalBatch.favoriteSchemeIds.v1";
function readFavoriteSchemeIds(): string[] {
  try {
    const raw = window.localStorage.getItem(FAVORITE_SCHEMES_STORAGE_KEY);
    if (raw === null) return [...CONDITIONAL_BATCH_STARTER_SCHEME_IDS];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed))
      return [...CONDITIONAL_BATCH_STARTER_SCHEME_IDS];
    return [
      ...new Set(
        parsed.filter(
          (entry): entry is string =>
            typeof entry === "string" &&
            entry.length > 0 &&
            entry.length <= 200,
        ),
      ),
    ].slice(0, 100);
  } catch (error) {
    void error;
    return [...CONDITIONAL_BATCH_STARTER_SCHEME_IDS];
  }
}
function writeFavoriteSchemeIds(ids: readonly string[]): void {
  try {
    window.localStorage.setItem(
      FAVORITE_SCHEMES_STORAGE_KEY,
      JSON.stringify(ids),
    );
  } catch (error) {
    void error;
    // Hardened or ephemeral renderers may not expose storage. The current
    // modal still keeps the user's choice in React state.
  }
}
export function useConditionalBatchSchemeFavorites() {
  const [favoriteSchemeIds, setFavoriteSchemeIds] = React.useState<string[]>(
    readFavoriteSchemeIds,
  );
  const toggleSchemeFavorite = React.useCallback((id: string): void => {
    setFavoriteSchemeIds((current) => {
      const next = current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id].slice(-100);
      writeFavoriteSchemeIds(next);
      return next;
    });
  }, []);
  return { favoriteSchemeIds, toggleSchemeFavorite };
}
