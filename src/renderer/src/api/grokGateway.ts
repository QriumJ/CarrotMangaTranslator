import { createMangaDomainGateway } from "./mangaGateway";
export const grokGateway = createMangaDomainGateway("Grok", [
  "getGrokAccount",
  "loginGrokAccount",
  "logoutGrokAccount",
]);
