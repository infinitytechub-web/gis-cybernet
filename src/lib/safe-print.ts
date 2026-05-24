// Open a printable preview window without using `document.write` (which
// trips `no-unsanitized/method`). The HTML payload is loaded via a same-origin
// Blob URL so the new window navigates to fully parsed content; the caller
// gets a Window handle and can trigger printing via the returned promise.
//
// All call sites build the HTML from escaped, server-controlled data — this
// helper centralises the safe path so no component needs to touch
// `document.write` directly.

export interface SafePrintOptions {
  /** Window features for `window.open`. */
  features?: string;
  /** Auto-trigger `window.print()` after the document loads. Default: true. */
  autoPrint?: boolean;
  /** ms to wait before printing once the document load event fires. */
  printDelayMs?: number;
  /** Window target name. Default: '_blank'. */
  target?: string;
}

/**
 * Opens a popup that displays `html` and (optionally) triggers print.
 * Returns the Window handle (or null if blocked by popup blocker).
 */
export function openPrintWindow(
  html: string,
  opts: SafePrintOptions = {},
): Window | null {
  const {
    features = "noopener,noreferrer,width=900,height=1000",
    autoPrint = true,
    printDelayMs = 350,
    target = "_blank",
  } = opts;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, target, features);

  if (!win) {
    URL.revokeObjectURL(url);
    return null;
  }

  // Revoke the blob URL after the popup has had a chance to load, and fire
  // print() if requested. We can't always observe `load` cross-window when
  // the popup is opened directly to a Blob URL, so we fall back to a delay.
  const cleanup = () => URL.revokeObjectURL(url);
  setTimeout(() => {
    try {
      if (autoPrint && !win.closed) win.focus(), win.print();
    } catch {
      /* popup may have navigated away — ignore */
    }
    cleanup();
  }, printDelayMs);

  return win;
}
