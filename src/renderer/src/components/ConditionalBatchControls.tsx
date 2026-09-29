import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import React from "react";
import styles from "./ConditionalBatchEditor.module.css";
import { Button as UiButton } from "./ui/Button";

export function ConditionalBatchCollapsibleCard({
  children,
  expanded,
  onToggle,
  summary,
  title,
}: {
  children: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  summary: React.ReactNode;
  title: React.ReactNode;
}): React.JSX.Element {
  const bodyId = React.useId();
  return (
    <section className={styles.ruleCard} data-expanded={expanded}>
      <ConditionalBatchCollapsibleTrigger
        bodyId={bodyId}
        expanded={expanded}
        summary={summary}
        title={title}
        onToggle={onToggle}
      />
      {expanded ? (
        <div className={styles.cardBody} id={bodyId}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function ConditionalBatchCollapsibleTrigger({
  bodyId,
  expanded,
  onToggle,
  summary,
  title,
}: {
  bodyId: string;
  expanded: boolean;
  onToggle: () => void;
  summary?: React.ReactNode;
  title: React.ReactNode;
}): React.JSX.Element {
  return (
    <UiButton
      className={styles.cardToggle}
      iconLeft={
        expanded ? (
          <IconChevronDown size={17} />
        ) : (
          <IconChevronRight size={17} />
        )
      }
      aria-controls={bodyId}
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <strong>{title}</strong>
      {!expanded && summary ? <small>{summary}</small> : null}
    </UiButton>
  );
}
