import React from "react";
import { useTranslation } from "react-i18next";
import type {
  ErrorReportContext,
  ErrorReportDraft,
} from "../../../shared/errorReportTypes";
import { errorReportGateway } from "../lib/errorReportGateway";
import type { SubmitGitHubReport } from "../../../shared/githubReport";
import { useGitHubReportAccount } from "./useGitHubReportAccount";

export type ReportAction = "copy" | "github" | "logs" | "restart";

type ActionFeedback = {
  kind: "error" | "success";
  message: string;
};

type ReportDraftState = {
  draft: ErrorReportDraft | null;
  loadError: boolean;
  title: string;
  description: string;
  includeSystem: boolean;
  includeLogs: boolean;
  reportBody: string;
  retry: () => void;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
  setDescription: React.Dispatch<React.SetStateAction<string>>;
  setIncludeSystem: React.Dispatch<React.SetStateAction<boolean>>;
  setIncludeLogs: React.Dispatch<React.SetStateAction<boolean>>;
};

type ReportActionState = {
  submissionStarted: boolean;
  submitted: boolean;
  activeAction: ReportAction | null;
  feedback: ActionFeedback | null;
  handleCopy: () => void;
  handleOpenIssue: () => void;
  handleOpenLogs: () => void;
  handleRestart: () => void;
};

export type ReportPrimaryAction = {
  /** `errorReport.*` key of the footer's single primary action. */
  label:
    | "accountSignIn"
    | "accountWorking"
    | "deviceReopen"
    | "openGitHub"
    | "openingGitHub"
    | "retrySubmit"
    | "openSubmittedIssue";
  disabled: boolean;
  run: () => void;
};

export type ErrorReportDialogModel = ReportActionState &
  Omit<ReportDraftState, "draft"> & {
    draftReady: boolean;
    canShare: boolean;
    canSubmit: boolean;
    githubAccount: ReturnType<typeof useGitHubReportAccount>;
    primaryAction: ReportPrimaryAction;
  };

export function useErrorReportDialogModel(
  context: ErrorReportContext,
  onRestart: (() => unknown | Promise<unknown>) | undefined,
): ErrorReportDialogModel {
  const draftState = useReportDraft(context);
  const githubAccount = useGitHubReportAccount();
  const actionState = useReportActions({
    body: draftState.reportBody,
    onRestart,
    submission: draftState.draft?.reportId
      ? {
          reportId: draftState.draft.reportId,
          title: draftState.title.trim(),
          description: draftState.description,
          includeLogs: draftState.includeLogs,
          includeSystem: draftState.includeSystem,
        }
      : undefined,
  });
  const canSubmit = Boolean(
    githubAccount.account?.login &&
    draftState.draft?.reportId &&
    draftState.title.trim() &&
    actionState.activeAction === null &&
    !githubAccount.busy,
  );
  return {
    ...draftState,
    ...actionState,
    githubAccount,
    canSubmit,
    primaryAction: getReportPrimaryAction({
      actionState,
      canSubmit,
      githubAccount,
    }),
    draftReady: draftState.draft !== null,
    canShare:
      draftState.draft !== null &&
      draftState.title.trim().length > 0 &&
      actionState.activeAction === null,
  };
}

function useReportDraft(context: ErrorReportContext): ReportDraftState {
  const { t } = useTranslation("components");
  const [draft, setDraft] = React.useState<ErrorReportDraft | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  const [retryVersion, setRetryVersion] = React.useState(0);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [includeSystem, setIncludeSystem] = React.useState(true);
  const [includeLogs, setIncludeLogs] = React.useState(true);
  const stableContext = useStableReportContext(context);
  const contextKey = getContextKey(stableContext);

  React.useEffect(() => {
    setTitle("");
    setDescription("");
    setIncludeSystem(true);
    setIncludeLogs(true);
  }, [contextKey]);
  React.useEffect(() => {
    let active = true;
    setDraft(null);
    setLoadError(false);
    void errorReportGateway
      .prepareErrorReport(stableContext)
      .then((nextDraft) => {
        if (active) {
          setDraft(nextDraft);
          setTitle((currentTitle) => currentTitle || nextDraft.defaultTitle);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          console.error(error);
          setLoadError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [retryVersion, stableContext]);

  const reportBody = React.useMemo(
    () =>
      draft
        ? buildReportBody({
            description,
            draft,
            includeLogs,
            includeSystem,
            descriptionHeading: t("errorReport.descriptionHeading"),
            noDescription: t("errorReport.noDescription"),
            redactionNotice: t("errorReport.redactionNotice", {
              count: draft.redactionCount,
            }),
            truncatedNotice: t("errorReport.truncatedNotice"),
          })
        : "",
    [description, draft, includeLogs, includeSystem, t],
  );

  return {
    draft,
    loadError,
    title,
    description,
    includeSystem,
    includeLogs,
    reportBody,
    retry: () => setRetryVersion((version) => version + 1),
    setTitle,
    setDescription,
    setIncludeSystem,
    setIncludeLogs,
  };
}

function useReportActions({
  body,
  onRestart,
  submission,
}: {
  body: string;
  onRestart: (() => unknown | Promise<unknown>) | undefined;
  submission: SubmitGitHubReport | undefined;
}): ReportActionState {
  const { t } = useTranslation("components");
  // Keyed by report ID so a new snapshot resets them without an effect that
  // could flush after a fast first click and unlock the submitted form.
  const [startedReportId, setStartedReportId] = React.useState<string>();
  const [submittedReportId, setSubmittedReportId] = React.useState<string>();
  const reportId = submission?.reportId;
  const submissionStarted = Boolean(reportId) && startedReportId === reportId;
  const submitted = Boolean(reportId) && submittedReportId === reportId;
  const { activeAction, feedback, runAction } = useActionRunner();
  const handleCopy = (): void => {
    void runAction("copy", async () => {
      await errorReportGateway.copyErrorReport(body);
      return t("errorReport.copySuccess");
    });
  };
  const handleOpenIssue = (): void => {
    void runAction("github", async () => {
      if (!submission) throw new Error("Full report snapshot is not ready.");
      setStartedReportId(submission.reportId);
      const result = await errorReportGateway.submitGitHubReport(submission);
      setSubmittedReportId(submission.reportId);
      return t(
        result.opened
          ? "errorReport.submitted"
          : "errorReport.submittedBrowserFailed",
        {
          url: result.issueUrl,
        },
      );
    });
  };
  const handleOpenLogs = (): void => {
    void runAction("logs", async () => {
      await errorReportGateway.openLogFolder();
    });
  };
  const handleRestart = (): void => {
    if (onRestart) {
      void runAction("restart", async () => {
        await onRestart();
      });
    }
  };
  return {
    submissionStarted,
    submitted,
    activeAction,
    feedback,
    handleCopy,
    handleOpenIssue,
    handleOpenLogs,
    handleRestart,
  };
}

/**
 * The footer always offers the next real step instead of a dimmed "report"
 * button: sign in, reopen GitHub's approval page, report, retry the same snapshot,
 * or reopen the issue the idempotent submission journal already created.
 */
function getReportPrimaryAction({
  actionState,
  canSubmit,
  githubAccount,
}: {
  actionState: ReportActionState;
  canSubmit: boolean;
  githubAccount: ReturnType<typeof useGitHubReportAccount>;
}): ReportPrimaryAction {
  const submit = actionState.handleOpenIssue;
  if (actionState.activeAction === "github")
    return { label: "openingGitHub", disabled: true, run: submit };
  if (githubAccount.phase === "signedOut")
    return {
      label: githubAccount.busy ? "accountWorking" : "accountSignIn",
      disabled: githubAccount.busy || actionState.activeAction !== null,
      run: () => void githubAccount.act("start"),
    };
  if (githubAccount.phase === "pending")
    return {
      label: "deviceReopen",
      disabled: githubAccount.busy || actionState.activeAction !== null,
      run: () => void githubAccount.act("reopen"),
    };
  return {
    label: actionState.submitted
      ? "openSubmittedIssue"
      : actionState.submissionStarted
        ? "retrySubmit"
        : "openGitHub",
    disabled: !canSubmit,
    run: submit,
  };
}

function useActionRunner(): {
  activeAction: ReportAction | null;
  feedback: ActionFeedback | null;
  runAction: (
    action: ReportAction,
    operation: () => Promise<string | void>,
  ) => Promise<void>;
} {
  const { t } = useTranslation("components");
  const [activeAction, setActiveAction] = React.useState<ReportAction | null>(
    null,
  );
  const [feedback, setFeedback] = React.useState<ActionFeedback | null>(null);
  const actionLockRef = React.useRef(false);
  const runAction = React.useCallback(
    async (
      action: ReportAction,
      operation: () => Promise<string | void>,
    ): Promise<void> => {
      if (actionLockRef.current) {
        return;
      }
      actionLockRef.current = true;
      setActiveAction(action);
      setFeedback(null);
      try {
        const successMessage = await operation();
        if (successMessage) {
          setFeedback({ kind: "success", message: successMessage });
        }
      } catch (error) {
        console.error(error);
        setFeedback({
          kind: "error",
          message: t(`errorReport.actionErrors.${action}`),
        });
      } finally {
        actionLockRef.current = false;
        setActiveAction(null);
      }
    },
    [t],
  );
  return { activeAction, feedback, runAction };
}

function buildReportBody({
  description,
  draft,
  includeLogs,
  includeSystem,
  descriptionHeading,
  noDescription,
  redactionNotice,
  truncatedNotice,
}: {
  description: string;
  draft: ErrorReportDraft;
  includeLogs: boolean;
  includeSystem: boolean;
  descriptionHeading: string;
  noDescription: string;
  redactionNotice: string;
  truncatedNotice: string;
}): string {
  const sections = [
    `## ${descriptionHeading}\n\n${description.trim() || noDescription}`,
    draft.errorMarkdown.trim(),
    includeSystem ? draft.systemMarkdown.trim() : "",
    includeLogs ? draft.logsMarkdown.trim() : "",
    `> ${redactionNotice}${draft.truncated ? `\n>\n> ${truncatedNotice}` : ""}`,
  ];
  return sections.filter(Boolean).join("\n\n");
}

function useStableReportContext(
  context: ErrorReportContext,
): ErrorReportContext {
  return React.useMemo(
    () => ({
      source: context.source,
      summary: context.summary,
      message: context.message,
      stack: context.stack,
      componentStack: context.componentStack,
      jobStage: context.jobStage,
      jobId: context.jobId,
      executionId: context.executionId,
      incidentAt: context.incidentAt,
    }),
    [
      context.componentStack,
      context.jobStage,
      context.jobId,
      context.executionId,
      context.incidentAt,
      context.message,
      context.source,
      context.stack,
      context.summary,
    ],
  );
}

function getContextKey(context: ErrorReportContext): string {
  return JSON.stringify([
    context.source,
    context.summary,
    context.message,
    context.stack,
    context.componentStack,
    context.jobStage,
    context.jobId,
    context.executionId,
    context.incidentAt,
  ]);
}
