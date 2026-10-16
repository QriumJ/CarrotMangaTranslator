import type { MangaApi } from "../../../shared/mangaApi";
import { normalizeErrorReportContext } from "../../../shared/errorReportContext";
import { appGateway as mangaGateway } from "../api/appGateway";

type ErrorReportGateway = Pick<
  MangaApi,
  | "copyErrorReport"
  | "onErrorIncident"
  | "openErrorReportIssue"
  | "openLogFolder"
  | "prepareErrorReport"
  | "restartApp"
  | "writeLog"
>;

export const errorReportGateway: ErrorReportGateway = {
  copyErrorReport: (body) => mangaGateway.copyErrorReport(body),
  onErrorIncident: (callback) => mangaGateway.onErrorIncident(callback),
  openErrorReportIssue: (request) => mangaGateway.openErrorReportIssue(request),
  openLogFolder: () => mangaGateway.openLogFolder(),
  prepareErrorReport: (context) =>
    mangaGateway.prepareErrorReport(normalizeErrorReportContext(context)),
  restartApp: () => mangaGateway.restartApp(),
  writeLog: (level, message, detail) =>
    mangaGateway.writeLog(level, message, detail),
};
