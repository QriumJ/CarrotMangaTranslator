import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { loadChatImage } from "./chatImageLoader";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import styles from "./ChatPanel.module.css";

/** Thumbnails of tool and message images; the full image opens in a dialog. */
export function ChatImages({
  sessionId,
  ids,
  limit,
  onShowMore,
}: {
  sessionId: string;
  ids: string[];
  limit?: number;
  onShowMore?: () => void;
}) {
  const { t } = useTranslation("components");
  const [shown, setShown] = useState(20);
  const uniqueIds = [...new Set(ids)];
  const hidden = Math.max(0, uniqueIds.length - (limit ?? shown));
  return uniqueIds.length ? (
    <div className={styles.images}>
      {uniqueIds.slice(hidden).map((id) => (
        <ChatImageView key={id} sessionId={sessionId} imageId={id} />
      ))}
      {hidden > 0 ? (
        <Button
          variant="bare"
          className={styles.moreImages}
          aria-label={t("chat.moreImages", { count: hidden })}
          onClick={onShowMore ?? (() => setShown(shown + 20))}
        >
          +{hidden}
        </Button>
      ) : null}
    </div>
  ) : null;
}
function ChatImageView({
  sessionId,
  imageId,
}: {
  sessionId: string;
  imageId: string;
}) {
  const { image, error, large, setLarge, full, root } = useChatImage(
    sessionId,
    imageId,
  );
  return (
    <span ref={root}>
      {error ? (
        <small role="status">{error}</small>
      ) : image ? (
        <>
          <Button
            variant="bare"
            className={styles.image}
            onClick={() => setLarge(!large)}
            aria-label={image.name}
            title={image.name}
          >
            <img src={image.dataUrl} alt={image.name} />
          </Button>
          {large &&
            createPortal(
              <Modal
                title={image.name}
                size="xl"
                onClose={() => setLarge(false)}
                closeOnBackdrop
              >
                <img
                  className={styles.previewImage}
                  src={full ?? image.dataUrl}
                  alt={image.name}
                />
              </Modal>,
              document.body,
            )}
        </>
      ) : (
        <span className={styles.imagePlaceholder} aria-hidden="true" />
      )}
    </span>
  );
}

function useChatImage(sessionId: string, imageId: string) {
  const [image, setImage] = useState<{ name: string; dataUrl: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [large, setLarge] = useState(false);
  const [full, setFull] = useState<string | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(
    typeof IntersectionObserver === "undefined",
  );
  useEffect(() => {
    if (!root.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "160px" },
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    const controller = new AbortController();
    void loadChatImage(sessionId, imageId, true, controller.signal).then(
      (result) => {
        if (live) setImage(result);
      },
      (failure: unknown) => {
        if (live)
          setError(
            failure instanceof Error ? failure.message : String(failure),
          );
      },
    );
    return () => {
      live = false;
      controller.abort();
      setImage(null);
    };
  }, [sessionId, imageId, visible]);
  useEffect(() => {
    if (!large) return;
    const controller = new AbortController();
    void loadChatImage(sessionId, imageId, false, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setFull(result.dataUrl);
      },
      (failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : String(failure),
          );
      },
    );
    return () => {
      controller.abort();
      setFull(null);
    };
  }, [sessionId, imageId, large]);
  return { image, error, large, setLarge, full, root };
}
