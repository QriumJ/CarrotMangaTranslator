import { nativeImage } from "electron";
import type { ChatImage } from "../../shared/chatTypes";

/** A transient view; the attachment file is never rewritten. */
export function chatImagePreview(source: ChatImage): ChatImage {
  const image = nativeImage.createFromDataURL(source.dataUrl);
  if (image.isEmpty()) throw new Error("채팅 이미지를 읽을 수 없습니다.");
  const size = image.getSize();
  const scale = Math.min(1, 320 / Math.max(size.width, size.height));
  const preview = image.resize({
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
    quality: "good",
  });
  return { ...source, dataUrl: preview.toDataURL() };
}
