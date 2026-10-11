export type GemmaSamplingSettings = {
  temperature: number;
  topP: number;
  topK: number;
};

export const DEFAULT_GEMMA_SAMPLING: Readonly<GemmaSamplingSettings> = {
  temperature: 0.1,
  topP: 0.95,
  topK: 64,
};
