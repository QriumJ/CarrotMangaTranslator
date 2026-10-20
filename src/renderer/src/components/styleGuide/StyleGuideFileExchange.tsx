import React from "react";
import { useTranslation } from "react-i18next";
import { IconFileExport, IconFileImport } from "@tabler/icons-react";
import type { WorkGlossaryConflictPolicy } from "../../../../shared/workGlossaryImportPlan";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { ModalActionBar, ModalActionButtons } from "../ui/ModalActionBar";
import { SegmentedControl } from "../ui/SegmentedControl";
import type {
  StyleGuideImportReview,
  useStyleGuideFileExchange,
} from "./useStyleGuideFileExchange";
import styles from "./StyleGuideFileExchange.module.css";

/** File backup actions sit beside the tabs because they cover both term tabs. */
export function StyleGuideTabBar({
  actions,
  tabs,
}: {
  actions: React.ReactNode;
  tabs: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className={styles.tabBar}>
      {tabs}
      {actions}
    </div>
  );
}

export function StyleGuideFileActions({
  focusImport = false,
  busy,
  disabled,
  exportDisabled,
  onExport,
  onImport,
}: {
  focusImport?: boolean;
  busy: boolean;
  disabled: boolean;
  exportDisabled: boolean;
  onExport: () => void;
  onImport: () => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div
      className={styles.fileActions}
      role="group"
      aria-label={t("styleGuide.exchange.groupLabel")}
      aria-busy={busy || undefined}
    >
      <Button
        size="sm"
        data-modal-initial-focus={focusImport || undefined}
        iconLeft={<IconFileImport size={15} />}
        title={t("styleGuide.exchange.importHint")}
        disabled={disabled || busy}
        onClick={onImport}
      >
        {t("styleGuide.exchange.import")}
      </Button>
      <Button
        size="sm"
        iconLeft={<IconFileExport size={15} />}
        title={t("styleGuide.exchange.exportHint")}
        disabled={disabled || busy || exportDisabled}
        onClick={onExport}
      >
        {t("styleGuide.exchange.export")}
      </Button>
    </div>
  );
}

type FileExchange = ReturnType<typeof useStyleGuideFileExchange>;

/** Shows what an import adds or changes before anything reaches the draft. */
export function StyleGuideImportReviewModal({
  exchange,
}: {
  exchange: FileExchange;
}): React.JSX.Element | null {
  const { t } = useTranslation("components");
  const review = exchange.importReview;
  if (!review) return null;
  const { plan } = review;
  const conflicts =
    plan.glossary.conflicts.length + plan.characters.conflicts.length;
  const changeCount =
    plan.glossary.added.length +
    plan.characters.added.length +
    (exchange.importPolicy === "use-imported" ? conflicts : 0);
  return (
    <Modal
      title={t("styleGuide.exchange.reviewTitle")}
      size="lg"
      maxHeight="820px"
      onClose={exchange.dismissImport}
      bodyClassName={styles.reviewBody}
      footer={
        <ModalActionBar
          actions={
            <ModalActionButtons
              cancel={{
                label: t("common.cancel"),
                onClick: exchange.dismissImport,
              }}
              confirm={{
                label: t("styleGuide.exchange.apply", { count: changeCount }),
                onClick: exchange.applyImport,
                disabled: changeCount === 0,
              }}
            />
          }
        />
      }
    >
      <ImportSource review={review} />
      <ImportSummary review={review} />
      {conflicts > 0 ? (
        <ConflictResolution
          policy={exchange.importPolicy}
          review={review}
          onPolicyChange={exchange.setImportPolicy}
        />
      ) : null}
    </Modal>
  );
}

function ImportSource({
  review,
}: {
  review: StyleGuideImportReview;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <p className={styles.source}>
      <strong title={review.fileName}>{review.fileName}</strong>
      {review.file.workTitle ? (
        <span>
          {t("styleGuide.exchange.sourceWork", {
            title: review.file.workTitle,
          })}
        </span>
      ) : null}
    </p>
  );
}

function ImportSummary({
  review,
}: {
  review: StyleGuideImportReview;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const { plan } = review;
  const skipped = [
    {
      key: "repeated",
      count: plan.glossary.repeatedInFile + plan.characters.repeatedInFile,
    },
    { key: "invalid", count: plan.invalidCount },
    {
      key: "overLimit",
      count: plan.glossary.overLimit + plan.characters.overLimit,
    },
  ].filter((item) => item.count > 0);
  return (
    <dl className={styles.summary}>
      <SummaryRow
        label={t("styleGuide.exchange.summary.added")}
        glossary={plan.glossary.added.length}
        characters={plan.characters.added.length}
      />
      <SummaryRow
        label={t("styleGuide.exchange.summary.unchanged")}
        glossary={plan.glossary.unchanged}
        characters={plan.characters.unchanged}
      />
      <SummaryRow
        label={t("styleGuide.exchange.summary.conflicts")}
        glossary={plan.glossary.conflicts.length}
        characters={plan.characters.conflicts.length}
      />
      {skipped.map((item) => (
        <div key={item.key} className={styles.summaryRow} data-tone="muted">
          <dt>{t(`styleGuide.exchange.summary.${item.key}`)}</dt>
          <dd>{t("styleGuide.exchange.count", { count: item.count })}</dd>
        </div>
      ))}
    </dl>
  );
}

function SummaryRow({
  label,
  glossary,
  characters,
}: {
  label: string;
  glossary: number;
  characters: number;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div className={styles.summaryRow} data-empty={glossary + characters === 0}>
      <dt>{label}</dt>
      <dd>{t("styleGuide.exchange.split", { glossary, characters })}</dd>
    </div>
  );
}

function ConflictResolution({
  policy,
  review,
  onPolicyChange,
}: {
  policy: WorkGlossaryConflictPolicy;
  review: StyleGuideImportReview;
  onPolicyChange: (policy: WorkGlossaryConflictPolicy) => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <section
      className={styles.conflicts}
      aria-label={t("styleGuide.exchange.conflictTitle")}
    >
      <div className={styles.conflictHeader}>
        <h3>{t("styleGuide.exchange.conflictTitle")}</h3>
        <SegmentedControl
          ariaLabel={t("styleGuide.exchange.conflictTitle")}
          singleRow
          value={policy}
          options={[
            {
              id: "keep-existing",
              label: t("styleGuide.exchange.policy.keepExisting"),
            },
            {
              id: "use-imported",
              label: t("styleGuide.exchange.policy.useImported"),
            },
          ]}
          onChange={onPolicyChange}
        />
      </div>
      <ConflictTable policy={policy} review={review} />
    </section>
  );
}

function ConflictTable({
  policy,
  review,
}: {
  policy: WorkGlossaryConflictPolicy;
  review: StyleGuideImportReview;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const empty = t("styleGuide.exchange.emptyTarget");
  return (
    <div className={styles.conflictTable} role="table">
      <div className={styles.conflictRow} role="row" data-head="true">
        <span role="columnheader">
          {t("styleGuide.exchange.columns.source")}
        </span>
        <span role="columnheader">
          {t("styleGuide.exchange.columns.current")}
        </span>
        <span role="columnheader">
          {t("styleGuide.exchange.columns.imported")}
        </span>
      </div>
      {conflictRows(review).map((row) => (
        <div
          key={row.key}
          className={styles.conflictRow}
          role="row"
          data-policy={policy}
        >
          <span role="cell" title={row.name}>
            {row.name}
          </span>
          <span role="cell" data-side="current" title={row.current}>
            {row.current || empty}
          </span>
          <span role="cell" data-side="imported" title={row.imported}>
            {row.imported || empty}
          </span>
        </div>
      ))}
    </div>
  );
}

function conflictRows(review: StyleGuideImportReview) {
  return [
    ...review.plan.glossary.conflicts.map(({ existing, incoming }) => ({
      key: `glossary:${existing.id}`,
      name: existing.source,
      current: existing.target,
      imported: incoming.target,
    })),
    ...review.plan.characters.conflicts.map(({ existing, incoming }) => ({
      key: `character:${existing.id}`,
      name: existing.sourceNames[0] || existing.displayName,
      current: existing.targetName,
      imported: incoming.targetName,
    })),
  ];
}
