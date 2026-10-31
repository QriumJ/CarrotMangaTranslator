import { createMangaDomainGateway } from "./mangaGateway";

export const linkedWorkspaceGateway = createMangaDomainGateway(
  "Linked workspace",
  [
    "getLinkedWorkspaceStatus",
    "organizeLinkedResults",
    "openPreservedLinkedResults",
    "listLinkedWorkspaceStatuses",
    "connectLinkedWorkspace",
    "updateLinkedWorkspace",
    "reconnectLinkedWorkspace",
    "resetLinkedWorkspaceLocation",
    "disconnectLinkedWorkspace",
    "viewLinkedResults",
    "reportLinkedWorkspaceActivity",
    "onLinkedWorkspaceStatusChanged",
  ] as const,
);
