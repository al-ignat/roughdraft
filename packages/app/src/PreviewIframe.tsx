import {
  type CSSProperties,
  type Ref,
  type SyntheticEvent,
  useCallback,
} from "react";

export interface PreviewIframeProps {
  srcDoc: string;
  /**
   * Forward the iframe element to a ref so the parent can read
   * `contentDocument` directly (for selection observation, manual
   * anchor application, etc.). The component itself does not need the
   * ref for rendering.
   */
  iframeRef?: Ref<HTMLIFrameElement | null>;
  /**
   * Called every time the iframe finishes loading its srcDoc, with the
   * iframe's live `contentDocument`. The parent uses this to apply the
   * comment-anchor overlay.
   *
   * Fires once on first load and again after every srcDoc change.
   */
  onContentReady?: (doc: Document) => void;
}

const iframeStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  border: 0,
  background: "white",
  display: "block",
};

export function PreviewIframe({
  srcDoc,
  iframeRef,
  onContentReady,
}: PreviewIframeProps) {
  const handleLoad = useCallback(
    (event: SyntheticEvent<HTMLIFrameElement>) => {
      const doc = event.currentTarget.contentDocument;
      if (doc) onContentReady?.(doc);
    },
    [onContentReady],
  );

  return (
    <iframe
      ref={iframeRef}
      title="Preview"
      data-testid="preview-iframe"
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-scripts allow-popups"
      style={iframeStyle}
      onLoad={handleLoad}
    />
  );
}
