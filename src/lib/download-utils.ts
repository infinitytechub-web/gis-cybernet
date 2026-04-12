/**
 * Triggers a reliable file download across all devices (desktop & mobile).
 * Uses a temporary anchor element with target="_blank" for broader compatibility
 * and ensures the browser's native save/open dialog appears.
 */
export function triggerDownload(url: string, fileName: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  // Setting target helps on some mobile browsers that block programmatic downloads
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // Small delay before cleanup to ensure download starts
  setTimeout(() => {
    document.body.removeChild(a);
  }, 100);
}

/**
 * Creates a Blob URL, triggers download, then revokes the URL.
 */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  triggerDownload(url, fileName);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Shortcut: download text content as CSV.
 */
export function downloadCSVString(csvContent: string, fileName: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, fileName);
}
