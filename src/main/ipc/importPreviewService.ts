import {
  createImport,
  prepareFoldersImportPreview,
  prepareArchiveFolderImportPreview,
  prepareArchiveImportPreview,
  preparePdfImportPreview,
  previewFolder,
  previewImages,
  previewZip,
  previewZipFolder,
} from "../library";
import { classifyDroppedImportPaths } from "../library/libraryImportDrop";

export type ImportPreviewIpcService = {
  prepareFoldersImportPreview?: typeof prepareFoldersImportPreview;
  classifyDroppedImportPaths: typeof classifyDroppedImportPaths;
  createImport: typeof createImport;
  previewFolder: typeof previewFolder;
  previewImages: typeof previewImages;
  previewZip: typeof previewZip;
  previewZipFolder: typeof previewZipFolder;
  prepareArchiveFolderImportPreview?: typeof prepareArchiveFolderImportPreview;
  prepareArchiveImportPreview?: typeof prepareArchiveImportPreview;
  preparePdfImportPreview?: typeof preparePdfImportPreview;
};

export const productionImportPreviewIpcService: ImportPreviewIpcService = {
  prepareFoldersImportPreview,
  classifyDroppedImportPaths,
  createImport,
  previewFolder,
  previewImages,
  previewZip,
  previewZipFolder,
  prepareArchiveFolderImportPreview,
  prepareArchiveImportPreview,
  preparePdfImportPreview,
};
