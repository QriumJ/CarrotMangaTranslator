import { createAccountConnection } from "./accountConnection";
import { grokGateway } from "./grokGateway";
export const grokConnection = createAccountConnection(() =>
  grokGateway.getGrokAccount(),
);
