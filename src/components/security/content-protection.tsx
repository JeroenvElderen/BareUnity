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
const CAPTURE_WHITEOUT_CLASS = "content-capture-whiteout";
const CAPTURE_STYLE_ID = "content-capture-whiteout-style";
const CAPTURE_WHITEOUT_MS = 1800;

function isAdminViewer() {
  return document.documentElement.dataset.viewerRole === "admin";
}

function isLikelyScreenshotShortcut(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  const hasCtrlOrMeta = event.ctrlKey || event.metaKey;

  return (
    event.key === "PrintScreen" ||
    (event.metaKey && event.shiftKey && ["3", "4", "5", "s"].includes(key)) ||
    (hasCtrlOrMeta && event.shiftKey && key === "s") ||
    (event.altKey && event.key === "PrintScreen")
  );
}

function installCaptureWhiteoutStyle() {
  if (document.getElementById(CAPTURE_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = CAPTURE_STYLE_ID;
  style.textContent = `
    html.${CAPTURE_WHITEOUT_CLASS}:not([data-viewer-role="admin"]) body::after {
      content: "";
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: #fff;
      pointer-events: none;
    }

    @media print {
      html:not([data-viewer-role="admin"]) body {
        visibility: hidden !important;
      }

      html:not([data-viewer-role="admin"]) body::after {
        content: "";
        position: fixed;
        inset: 0;
        visibility: visible;
        background: #fff;
      }
    }
  `;
  document.head.appendChild(style);
}

export function ContentProtection() {
  useEffect(() => {
    installCaptureWhiteoutStyle();
    let whiteoutTimeout: number | null = null;

    const showCaptureWhiteout = () => {
      if (isAdminViewer()) return;

      document.documentElement.classList.add(CAPTURE_WHITEOUT_CLASS);
      if (whiteoutTimeout !== null) {
        window.clearTimeout(whiteoutTimeout);
      }
      whiteoutTimeout = window.setTimeout(() => {
        document.documentElement.classList.remove(CAPTURE_WHITEOUT_CLASS);
        whiteoutTimeout = null;
      }, CAPTURE_WHITEOUT_MS);
    };

    const handleContextMenu = (event: MouseEvent) => {
      if (isAdminViewer()) return;
      event.preventDefault();
    };

    const handleDragStart = (event: DragEvent) => {
      if (isAdminViewer()) return;
      event.preventDefault();
    };

    const handleCopyCut = (event: ClipboardEvent) => {
      if (isAdminViewer()) return;
      event.preventDefault();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isAdminViewer()) return;

      if (isLikelyScreenshotShortcut(event)) {
        showCaptureWhiteout();
      }

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

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isAdminViewer()) return;
      if (isLikelyScreenshotShortcut(event)) {
        showCaptureWhiteout();
      }
    };

    const handleCaptureBoundary = () => {
      if (isAdminViewer()) return;
      showCaptureWhiteout();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        handleCaptureBoundary();
      }
    };

    const handleDownloadClick = (event: MouseEvent) => {
      if (isAdminViewer()) return;

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
    document.addEventListener("keyup", handleKeyUp);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleCaptureBoundary);
    window.addEventListener("pagehide", handleCaptureBoundary);
    document.addEventListener("click", handleDownloadClick, true);

    return () => {
      if (whiteoutTimeout !== null) {
        window.clearTimeout(whiteoutTimeout);
      }
      document.documentElement.classList.remove(CAPTURE_WHITEOUT_CLASS);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("dragstart", handleDragStart);
      document.removeEventListener("copy", handleCopyCut);
      document.removeEventListener("cut", handleCopyCut);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleCaptureBoundary);
      window.removeEventListener("pagehide", handleCaptureBoundary);
      document.removeEventListener("click", handleDownloadClick, true);
    };
  }, []);

  return null;
}
