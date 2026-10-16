import { createMangaDomainGateway } from "./mangaGateway";

export const inpaintingGateway = createMangaDomainGateway("Inpainting", [
  "applyInpaintingHistoryTransaction",
  "applyInpaintingRetouch",
  "cancelInpaintingRetouch",
  "disposeInpaintingEngine",
  "releaseInpaintingHistoryTransactions",
  "revertInpainting",
  "sampleInpaintingColor",
  "setPageInpaintingResult",
  "startInpainting",
] as const);
