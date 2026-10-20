import { useTranslation } from "react-i18next";
import { IconFileExport, IconFileImport } from "@tabler/icons-react";
import React from "react";
import { ConditionalBatchCollapsibleTrigger } from "./ConditionalBatchControls";
import styles from "./ConditionalBatchEditor.module.css";
import type { ConditionalBatchRulePanelProps } from "./conditionalBatchRulePanelTypes";
import { Button } from "./ui/Button";
import { Textarea } from "./ui/Field";
import { InlineMessage } from "./ui/InlineMessage";

type ConditionalBatchAdvancedToolsProps = Pick<
  ConditionalBatchRulePanelProps,
  | "onExportYaml"
  | "onImportYaml"
  | "onOpenYaml"
  | "onOpenYamlFile"
  | "onReflectYaml"
  | "onSetYamlOpen"
  | "onSetYamlText"
  | "yamlError"
  | "yamlOpen"
  | "yamlText"
> & {
  expanded: boolean;
  onToggle: () => void;
};

export function ConditionalBatchAdvancedTools(
  props: ConditionalBatchAdvancedToolsProps,
): React.JSX.Element {
  const { t } = useTranslation("components");
  const bodyId = React.useId();
  return (
    <section className={styles.advancedTools} data-expanded={props.expanded}>
      <ConditionalBatchCollapsibleTrigger
        bodyId={bodyId}
        expanded={props.expanded}
        title={t("conditionalBatch.tools.advanced")}
        onToggle={props.onToggle}
      />
      {props.expanded ? <YamlToolsBody {...props} id={bodyId} /> : null}
    </section>
  );
}

function YamlToolsBody(
  props: ConditionalBatchAdvancedToolsProps & { id: string },
): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div className={styles.advancedBody} id={props.id}>
      <div className={styles.advancedButtons}>
        <Button
          size="sm"
          iconLeft={<IconFileExport size={15} />}
          onClick={() => props.onExportYaml(false)}
        >
          {t("conditionalBatch.tools.exportRule")}
        </Button>
        <Button
          size="sm"
          iconLeft={<IconFileExport size={15} />}
          onClick={() => props.onExportYaml(true)}
        >
          {t("conditionalBatch.tools.exportAll")}
        </Button>
        <Button size="sm" onClick={props.onOpenYaml}>
          {t("conditionalBatch.tools.editYaml")}
        </Button>
        <Button
          size="sm"
          iconLeft={<IconFileImport size={15} />}
          onClick={props.onOpenYamlFile}
        >
          {t("conditionalBatch.tools.import")}
        </Button>
      </div>
      {props.yamlOpen ? <YamlEditor {...props} /> : null}
    </div>
  );
}

function YamlEditor(
  props: Pick<
    ConditionalBatchAdvancedToolsProps,
    | "onImportYaml"
    | "onReflectYaml"
    | "onSetYamlOpen"
    | "onSetYamlText"
    | "yamlError"
    | "yamlText"
  >,
): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div className={styles.yamlEditor}>
      <Textarea
        aria-label={t("conditionalBatch.tools.yamlLabel")}
        spellCheck={false}
        value={props.yamlText}
        onChange={(event) => props.onSetYamlText(event.target.value)}
      />
      {props.yamlError ? (
        <InlineMessage
          variant="danger"
          title={t("conditionalBatch.tools.yamlError")}
          detail={props.yamlError}
        />
      ) : null}
      <div className={styles.yamlActions}>
        <Button size="sm" onClick={props.onReflectYaml}>
          {t("conditionalBatch.tools.reflect")}
        </Button>
        <Button
          size="sm"
          iconLeft={<IconFileImport size={15} />}
          onClick={() => props.onImportYaml("duplicate")}
        >
          {t("conditionalBatch.tools.importNew")}
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={() => props.onImportYaml("overwrite")}
        >
          {t("conditionalBatch.tools.overwrite")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => props.onSetYamlOpen(false)}
        >
          {t("conditionalBatch.tools.close")}
        </Button>
      </div>
    </div>
  );
}
