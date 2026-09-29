import type { TranslationOptions } from "../appSettings";
import { runLocalInference } from "../runtimeSupport/localInferenceSection";
import type { TranslationRuntimePort } from "./translationRuntimePort";
import { createWorkerFontMatchingPageInferencePort } from "./fontMatchingInferenceWorkerClient";
import type { FontMatchingPageInferencePort } from "./fontMatchingPagePixelInferenceTypes";

/**
 * OCR, detection and the endpoint start (which frees idle local detectors)
 * run on the local GPU. Jobs that share the model runtime take these stages
 * in turn; the remote translation request itself stays outside the section.
 */
export function withLocalInferenceStages(
  port: TranslationRuntimePort,
): TranslationRuntimePort {
  const startSession = port.startPreparedHayaiSession;
  const collectPrepared = port.collectPreparedHayaiHints;
  return {
    ...port,
    startPreparedHayaiSession: startSession
      ? (options) =>
          runLocalInference(async () => {
            const session = await startSession(options);
            return {
              collect: (page: TranslationOptions) =>
                runLocalInference(
                  () => session.collect(page),
                  page.abortSignal,
                ),
              dispose: session.dispose,
            };
          }, options.abortSignal)
      : undefined,
    collectPreparedHayaiHints: collectPrepared
      ? (options) =>
          runLocalInference(() => collectPrepared(options), options.abortSignal)
      : undefined,
    startEndpointSession: (options) =>
      runLocalInference(
        () => port.startEndpointSession(options),
        options.abortSignal,
      ),
    collectOcrHints: (options) =>
      runLocalInference(
        () => port.collectOcrHints(options),
        options.abortSignal,
      ),
    collectOcrHintsBatch: (optionsList) =>
      runLocalInference(
        () => port.collectOcrHintsBatch(optionsList),
        optionsList[0]?.abortSignal,
      ),
    annotateOcrGroupingEvidenceBatch: (optionsList, results) =>
      runLocalInference(
        () => port.annotateOcrGroupingEvidenceBatch(optionsList, results),
        optionsList[0]?.abortSignal,
      ),
  };
}

/** Font inference runs on the local GPU; share it in turn with other model jobs. */
export function createLocalFontMatchingPageInferencePort(
  dependencies: Parameters<typeof createWorkerFontMatchingPageInferencePort>[0],
): FontMatchingPageInferencePort {
  const port = createWorkerFontMatchingPageInferencePort(dependencies);
  return {
    inferPage: (request) =>
      runLocalInference(() => port.inferPage(request), request.signal),
    dispose: () => port.dispose?.() ?? Promise.resolve(),
  };
}
