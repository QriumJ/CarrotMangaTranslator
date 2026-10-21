import React from "react";
import { CollapsibleSection } from "./ui/Section";
import styles from "./EditorDisclosure.module.css";

const STORAGE_PREFIX = "editor.section.";

/** A remembered editor-panel section built on the shared collapsible section. */
export function EditorDisclosure({
  id,
  label,
  actions,
  children,
  headerExtra,
  initiallyOpen = true,
  revealToken = 0,
}: {
  id: string;
  label: string;
  /** Header tools; hidden with the body so a collapsed section stays one row. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Status or actions that stay in the header while collapsed. */
  headerExtra?: React.ReactNode;
  initiallyOpen?: boolean;
  revealToken?: number;
}): React.JSX.Element {
  const [open, setOpen] = usePersistedDisclosure(
    id,
    initiallyOpen,
    revealToken,
  );
  return (
    <CollapsibleSection
      className={styles.disclosure}
      headerClassName={styles.header}
      titleClassName={styles.title}
      density="compact"
      title={label}
      actions={
        headerExtra || (open && actions) ? (
          <>
            {headerExtra}
            {open ? actions : null}
          </>
        ) : undefined
      }
      expanded={open}
      onExpandedChange={setOpen}
    >
      {children}
    </CollapsibleSection>
  );
}

function usePersistedDisclosure(
  id: string,
  initiallyOpen: boolean,
  revealToken: number,
): [boolean, (open: boolean) => void] {
  const [open, setOpenState] = React.useState(() =>
    readStoredDisclosure(id, initiallyOpen),
  );
  React.useEffect(() => {
    if (revealToken) setOpenState(true);
  }, [revealToken]);
  const setOpen = React.useCallback(
    (next: boolean) => {
      setOpenState(next);
      writeStoredDisclosure(id, next);
    },
    [id],
  );
  return [open, setOpen];
}

function readStoredDisclosure(id: string, fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(`${STORAGE_PREFIX}${id}`);
    return stored === null ? fallback : stored === "open";
  } catch (error) {
    console.warn("Editor section state read failed", error);
    return fallback;
  }
}

function writeStoredDisclosure(id: string, open: boolean): void {
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${id}`,
      open ? "open" : "closed",
    );
  } catch (error) {
    console.warn("Editor section state write failed", error);
  }
}
