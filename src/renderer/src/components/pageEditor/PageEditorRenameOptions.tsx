import React from "react";
import { useTranslation } from "react-i18next";
import { TextField, Field } from "../ui/Field";
import { NumberField } from "../ui/NumberField";
import { Select } from "../ui/Select";
import { CheckboxField } from "../ui/CheckboxField";
import type { PageRenameRule } from "../../lib/pageEditorRename";
import styles from "./PageEditor.module.css";

export function PageEditorRenameOptions({
  rule,
  update,
  advanced,
}: {
  rule: PageRenameRule;
  update: (value: Partial<PageRenameRule>) => void;
  advanced: boolean;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const fields: ("start" | "step" | "padding" | "count")[] = [
    "number",
    "template",
  ].includes(rule.kind)
    ? ["start", "step", "padding"]
    : rule.kind === "pad"
      ? ["padding"]
      : [];
  if (
    (rule.kind === "insert" && rule.position === "at") ||
    (rule.kind === "remove" && rule.position !== "whole")
  )
    fields.push("count");
  return (
    <>
      {["number", "insert", "remove"].includes(rule.kind) ? (
        <Field label={t("pageEditor.position")}>
          <Select
            ariaLabel={t("pageEditor.position")}
            value={rule.position}
            onValueChange={(position) =>
              update({ position: position as PageRenameRule["position"] })
            }
            options={(
              [
                "prefix",
                "suffix",
                ...(rule.kind === "insert" ? ["at"] : ["whole"]),
              ] as const
            ).map((value) => ({
              value,
              label: t(
                `pageEditor.positionLabel.${value === "whole" && rule.kind === "remove" ? "matching" : value}`,
              ),
            }))}
          />
        </Field>
      ) : null}
      {fields.length ? (
        <div className={styles.fieldGrid}>
          {fields.map((key) => (
            <Field key={key} label={t(`pageEditor.${key}`)}>
              <NumberField
                ariaLabel={t(`pageEditor.${key}`)}
                value={rule[key]}
                onValueChange={(value) => update({ [key]: value })}
                min={key === "padding" ? 1 : 0}
                max={key === "padding" ? 20 : 1000000}
                step={1}
              />
            </Field>
          ))}
        </div>
      ) : null}
      <ReplacementOptions rule={rule} update={update} advanced={advanced} />
      {rule.kind === "case" ? (
        <Select
          ariaLabel={t("pageEditor.method.case")}
          value={rule.upper ? "upper" : "lower"}
          onValueChange={(v) => update({ upper: v === "upper" })}
          options={[
            { value: "upper", label: t("pageEditor.upper") },
            { value: "lower", label: t("pageEditor.lower") },
          ]}
        />
      ) : null}
    </>
  );
}

function ReplacementOptions({
  rule,
  update,
  advanced,
}: {
  rule: PageRenameRule;
  update: (value: Partial<PageRenameRule>) => void;
  advanced: boolean;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <>
      {rule.kind === "replace" ? (
        <>
          <TextField
            label={t("pageEditor.replacement")}
            value={rule.replacement}
            onChange={(e) => update({ replacement: e.target.value })}
          />
          <div className={styles.checkRow}>
            <CheckboxField
              label={t("pageEditor.caseSensitive")}
              checked={rule.sensitive}
              onCheckedChange={(sensitive) => update({ sensitive })}
            />
            <CheckboxField
              label={t("pageEditor.allMatches")}
              checked={rule.all}
              onCheckedChange={(all) => update({ all })}
            />
            {advanced ? (
              <CheckboxField
                label={t("pageEditor.regex")}
                checked={rule.regex}
                onCheckedChange={(regex) => update({ regex })}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}
