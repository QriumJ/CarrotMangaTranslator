export type GrokAccount = {
  authenticated: boolean;
  runtimeInstalled: boolean;
  version: string;
  models: {
    id: string;
    displayName: string;
    supportedReasoningEfforts: string[];
    defaultReasoningEffort: string;
    isDefault: boolean;
  }[];
};

export type GrokApi = {
  getGrokAccount: () => Promise<GrokAccount>;
  loginGrokAccount: () => Promise<GrokAccount>;
  logoutGrokAccount: () => Promise<GrokAccount>;
};
