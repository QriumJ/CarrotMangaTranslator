import type { TFunction } from "i18next";
import { describeMcpScopes } from "../../../../shared/mcpScopeDescriptions";

export function localizedMcpScopes(
  scope: string,
  t: TFunction<"components">,
  format: "full" | "compact" = "full",
): string {
  return describeMcpScopes(scope, format, (value) =>
    [
      "carrot.read",
      "carrot.images",
      "carrot.edit",
      "carrot.process",
      "offline_access",
    ].includes(value)
      ? t(
          `mcp.${format === "full" ? "scopeDetails" : "scopes"}.${value.replaceAll(".", "_")}`,
          { defaultValue: value },
        )
      : value,
  );
}
