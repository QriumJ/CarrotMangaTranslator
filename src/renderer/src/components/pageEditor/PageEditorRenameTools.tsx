import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { TextField, Textarea } from "../ui/Field";
import { CheckboxField } from "../ui/CheckboxField";
import { ControlTooltip } from "../ui/ControlTooltip";
import {
  DEFAULT_PAGE_RENAME_RULE,
  type PageRenameRule,
} from "../../lib/pageEditorRename";
import type { PageEditorModel } from "./usePageEditor";
import { PageEditorRenameOptions } from "./PageEditorRenameOptions";
import styles from "./PageEditor.module.css";

export function PageEditorRenameTools({
  model,
}: {
  model: PageEditorModel;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const [rule, setRule] = React.useState(DEFAULT_PAGE_RENAME_RULE);
  const [advanced, setAdvanced] = React.useState(false);
  const update = (patch: Partial<PageRenameRule>) =>
    setRule({ ...rule, ...patch });
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t("pageEditor.renameMethod")}</h3>
        <RenameMethod
          rule={rule}
          update={update}
          advanced={advanced}
          setAdvanced={setAdvanced}
        />
      </section>
      <section className={styles.section}>
        <RenameList model={model} rule={rule} update={update} />
        <RuleText rule={rule} update={update} />
        <PageEditorRenameOptions
          rule={rule}
          update={update}
          advanced={advanced}
        />
        <Button
          fullWidth
          disabled={model.working || !model.targets.size}
          onClick={() => void model.rename(rule)}
        >
          {t("pageEditor.applyPreview")}
        </Button>
      </section>
    </>
  );
}

/** The free text a rule needs, plus the insertable tokens for name templates. */
function RuleText({ rule, update }: RuleProps): React.JSX.Element | null {
  const { t } = useTranslation("components");
  const needsText =
    ["replace", "insert", "template"].includes(rule.kind) ||
    (rule.kind === "remove" && rule.position === "whole");
  if (!needsText) return null;
  return (
    <>
      <TextField
        label={t(
          rule.kind === "replace" ? "pageEditor.search" : "pageEditor.text",
        )}
        value={rule.text}
        onChange={(e) => update({ text: e.target.value })}
      />
      {rule.kind === "template" ? (
        <div className={styles.buttonGrid}>
          {(["work", "chapter", "name", "number"] as const).map((token) => (
            <Button
              size="sm"
              key={token}
              onClick={() => update({ text: rule.text + `{${token}}` })}
            >
              {t(`pageEditor.token.${token}`)}
            </Button>
          ))}
        </div>
      ) : null}
    </>
  );
}

type RuleProps = {
  rule: PageRenameRule;
  update: (value: Partial<PageRenameRule>) => void;
};
function RenameMethod({
  rule,
  update,
  advanced,
  setAdvanced,
}: RuleProps & {
  advanced: boolean;
  setAdvanced: (value: boolean) => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const keys = advanced
    ? ([
        "number",
        "replace",
        "insert",
        "remove",
        "list",
        "template",
        "trim",
        "case",
        "pad",
      ] as const)
    : (["number", "replace", "insert", "remove", "list", "template"] as const);
  return (
    <>
      <Select
        ariaLabel={t("pageEditor.renameMethod")}
        value={rule.kind}
        onValueChange={(kind) =>
          update({
            kind: kind as PageRenameRule["kind"],
            position: "prefix",
            regex: false,
          })
        }
        options={keys.map((key) => ({
          value: key,
          label: t(`pageEditor.method.${key}`),
        }))}
      />
      <ControlTooltip floating content={t("pageEditor.advancedHelp")}>
        {(descriptionId) => (
          <CheckboxField
            checked={advanced}
            label={t("pageEditor.advanced")}
            ariaDescribedBy={descriptionId}
            onCheckedChange={(value) => {
              setAdvanced(value);
              if (!value)
                update({
                  regex: false,
                  kind: ["trim", "case", "pad"].includes(rule.kind)
                    ? "number"
                    : rule.kind,
                });
            }}
          />
        )}
      </ControlTooltip>
    </>
  );
}
function RenameList({
  model,
  rule,
  update,
}: RuleProps & { model: PageEditorModel }): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <>
      {rule.kind === "list" ? (
        <>
          <Textarea
            aria-label={t("pageEditor.nameList")}
            rows={4}
            value={rule.text}
            onChange={(e) => update({ text: e.target.value })}
          />
          <div className={styles.buttonGrid}>
            <Button
              size="sm"
              onClick={() =>
                update({
                  text: model.draft.order
                    .filter((id) => model.targets.has(id))
                    .map((id) => model.draft.names[id])
                    .join("\n"),
                })
              }
            >
              {t("pageEditor.populate")}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                void navigator.clipboard
                  .writeText(rule.text)
                  .catch(() => model.setError("clipboard"));
              }}
            >
              {t("pageEditor.copy")}
            </Button>
          </div>
        </>
      ) : null}
    </>
  );
}
