"use client";

import { useEffect } from "react";

const blockedKeyCombos = new Set([
  "s",
  "u",
  "p",
  "c",
  "i",
  "j",
]);

const downloadHrefPrefixes = ["blob:", "data:"];

export function ContentProtection() {
  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const handleDragStart = (event: DragEvent) => {
      event.preventDefault();
    };

    const handleCopyCut = (event: ClipboardEvent) => {
      event.preventDefault();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const hasCtrlOrMeta = event.ctrlKey || event.metaKey;
      const hasShift = event.shiftKey;

      if (event.key === "F12") {
        event.preventDefault();
        return;
      }

      if (hasCtrlOrMeta && blockedKeyCombos.has(key)) {
        event.preventDefault();
        return;
      }

      if (hasCtrlOrMeta && hasShift && ["i", "j", "c"].includes(key)) {
        event.preventDefault();
      }
    };

    const handleDownloadClick = (event: MouseEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest("a");
      if (!anchor) {
        return;
      }

      const hasDownloadAttribute = anchor.hasAttribute("download");
      const href = anchor.getAttribute("href")?.toLowerCase() ?? "";
      const looksLikeForcedDownload = downloadHrefPrefixes.some((prefix) => href.startsWith(prefix));

      if (hasDownloadAttribute || looksLikeForcedDownload) {
        event.preventDefault();
      }
    };

    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("dragstart", handleDragStart);
    document.addEventListener("copy", handleCopyCut);
    document.addEventListener("cut", handleCopyCut);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("click", handleDownloadClick, true);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("dragstart", handleDragStart);
      document.removeEventListener("copy", handleCopyCut);
      document.removeEventListener("cut", handleCopyCut);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("click", handleDownloadClick, true);
    };
  }, []);

  return null;
}