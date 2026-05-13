"use client";

import { PointerEvent, useEffect, useRef, useState } from "react";

import styles from "./id-redaction-uploader.module.css";

type RedactionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DragStart = {
  x: number;
  y: number;
};

type IdRedactionUploaderProps = {
  id?: string;
  required?: boolean;
  onFileChange: (file: File | null) => void;
};

function isImageFile(file: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type);
}

function getPointFromEvent(
  event: PointerEvent<HTMLDivElement>,
  element: HTMLDivElement,
) {
  const bounds = element.getBoundingClientRect();

  return {
    x: Math.min(Math.max((event.clientX - bounds.left) / bounds.width, 0), 1),
    y: Math.min(Math.max((event.clientY - bounds.top) / bounds.height, 0), 1),
  };
}

function createRect(start: DragStart, end: DragStart): RedactionRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function IdRedactionUploader({
  id = "idDocument",
  required = false,
  onFileChange,
}: IdRedactionUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rectangles, setRectangles] = useState<RedactionRect[]>([]);
  const [draftRectangle, setDraftRectangle] = useState<RedactionRect | null>(
    null,
  );
  const [dragStart, setDragStart] = useState<DragStart | null>(null);
  const [message, setMessage] = useState("");
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleSelectedFile(file: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setSelectedFile(file);
    setPreviewUrl(file && isImageFile(file) ? URL.createObjectURL(file) : null);
    setRectangles([]);
    setDraftRectangle(null);
    setDragStart(null);
    setMessage("");
    onFileChange(file);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!previewUrl) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getPointFromEvent(event, event.currentTarget);
    setDragStart(point);
    setDraftRectangle(createRect(point, point));
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart || !previewUrl) return;

    setDraftRectangle(
      createRect(dragStart, getPointFromEvent(event, event.currentTarget)),
    );
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart || !draftRectangle) return;

    event.currentTarget.releasePointerCapture(event.pointerId);
    if (draftRectangle.width > 0.01 && draftRectangle.height > 0.01) {
      setRectangles((prev) => [...prev, draftRectangle]);
    }
    setDraftRectangle(null);
    setDragStart(null);
  }

  async function applyRedactions() {
    if (!selectedFile || !previewUrl || rectangles.length === 0) return;

    const image = imageRef.current;
    if (!image?.naturalWidth || !image.naturalHeight) {
      setMessage("Image preview is still loading. Please try again in a moment.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      setMessage("Your browser could not prepare the redacted copy.");
      return;
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.fillStyle = "#000000";
    rectangles.forEach((rect) => {
      context.fillRect(
        rect.x * canvas.width,
        rect.y * canvas.height,
        rect.width * canvas.width,
        rect.height * canvas.height,
      );
    });

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, selectedFile.type || "image/png", 0.95),
    );

    if (!blob) {
      setMessage("Your browser could not export the redacted copy.");
      return;
    }

    const extension = selectedFile.name.split(".").pop() || "png";
    const redactedFile = new File(
      [blob],
      `redacted-${selectedFile.name.replace(/\.[^.]+$/, "")}.${extension}`,
      { type: blob.type || selectedFile.type },
    );

    setSelectedFile(redactedFile);
    onFileChange(redactedFile);
    setMessage(
      "Redacted copy is ready and will be uploaded instead of the original image.",
    );
  }

  const visibleRectangles = draftRectangle
    ? [...rectangles, draftRectangle]
    : rectangles;
  const selectedFileIsImage = selectedFile ? isImageFile(selectedFile) : false;

  return (
    <div className={styles.redactionUploader}>
      <div className={styles.header}>
        <span className={styles.title}>Upload and redact here</span>
        <p className={styles.description}>
          Choose an ID image, then drag black boxes over anything we do not need.
          Keep only legal name, date of birth, and the official ID seal, logo, or
          header visible. PDF uploads are accepted, but in-browser redaction is
          available for JPG, PNG, and WEBP files.
        </p>
      </div>

      <input
        id={id}
        className={styles.fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={(event) => handleSelectedFile(event.target.files?.[0] ?? null)}
        required={required}
      />

      {selectedFile ? (
        <p className={styles.fileStatus}>
          Selected: <strong>{selectedFile.name}</strong>
        </p>
      ) : null}

      {previewUrl && selectedFileIsImage ? (
        <div className={styles.previewShell}>
          <p className={styles.helper}>
            Drag over photos, ID numbers, barcodes, MRZ lines, signatures,
            addresses, expiry dates, and any other details you want covered.
          </p>
          <div
            className={styles.previewFrame}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => {
              setDraftRectangle(null);
              setDragStart(null);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              className={styles.previewImage}
              src={previewUrl}
              alt="Government ID preview for redaction"
            />
            {visibleRectangles.map((rect, index) => (
              <span
                aria-hidden="true"
                className={styles.redactionBlock}
                key={`${rect.x}-${rect.y}-${rect.width}-${rect.height}-${index}`}
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.width * 100}%`,
                  height: `${rect.height * 100}%`,
                }}
              />
            ))}
          </div>
          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.actionButton}
              disabled={rectangles.length === 0}
              onClick={applyRedactions}
            >
              Use redacted copy
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={rectangles.length === 0}
              onClick={() => {
                setRectangles((prev) => prev.slice(0, -1));
                setMessage("");
              }}
            >
              Undo last box
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={rectangles.length === 0}
              onClick={() => {
                setRectangles([]);
                setMessage("");
              }}
            >
              Clear boxes
            </button>
          </div>
        </div>
      ) : selectedFile ? (
        <p className={styles.notice}>
          This file type cannot be preview-redacted in the browser. You can still
          upload it, but an image file lets you cover sensitive details here
          before submitting.
        </p>
      ) : null}

      {message ? <p className={styles.notice}>{message}</p> : null}
    </div>
  );
}