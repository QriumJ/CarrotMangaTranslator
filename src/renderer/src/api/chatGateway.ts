import { createMangaDomainGateway } from "./mangaGateway";

export const chatGateway = createMangaDomainGateway("chat", [
  "listChats",
  "createChat",
  "readChat",
  "deleteChat",
  "sendChat",
  "stopChat",
  "compactChat",
  "answerChat",
  "attachChatImage",
  "readChatImage",
  "onChatEvent",
]);
