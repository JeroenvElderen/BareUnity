export const IMAGE_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

export const VERIFICATION_DOCUMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export const IMAGE_UPLOAD_EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export const VERIFICATION_DOCUMENT_EXTENSION_BY_TYPE: Record<string, string> = {
  ...IMAGE_UPLOAD_EXTENSION_BY_TYPE,
  "application/pdf": "pdf",
};

export type ValidatedUpload = {
  buffer: Buffer;
  contentType: string;
  extension: string;
};

type ValidateUploadOptions = {
  allowedTypes: Set<string>;
  extensionByType: Record<string, string>;
  maxBytes: number;
  emptyMessage: string;
  typeMessage: string;
  sizeMessage: string;
  signatureMessage: string;
};

const SIGNATURE_VALIDATORS: Record<string, (buffer: Buffer) => boolean> = {
  "image/jpeg": (buffer) =>
    buffer.length >= 3 &&
    buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  "image/png": (buffer) =>
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (buffer) =>
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP",
  "image/gif": (buffer) => {
    if (buffer.length < 6) return false;
    const header = buffer.subarray(0, 6).toString("ascii");
    return header === "GIF87a" || header === "GIF89a";
  },
  "image/avif": (buffer) =>
    buffer.length >= 12 &&
    buffer.subarray(4, 8).toString("ascii") === "ftyp" &&
    buffer.subarray(8, 12).toString("ascii").includes("avif"),
  "application/pdf": (buffer) =>
    buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-",
};

export class UploadValidationError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "UploadValidationError";
  }
}

export function hasValidFileSignature(contentType: string, buffer: Buffer) {
  const validator = SIGNATURE_VALIDATORS[contentType.toLowerCase()];
  return Boolean(validator?.(buffer));
}

export async function validateFileUpload(
  file: File,
  options: ValidateUploadOptions,
): Promise<ValidatedUpload> {
  if (!file.size) {
    throw new UploadValidationError(options.emptyMessage);
  }

  if (file.size > options.maxBytes) {
    throw new UploadValidationError(options.sizeMessage, 413);
  }

  const contentType = file.type.toLowerCase();
  if (!options.allowedTypes.has(contentType)) {
    throw new UploadValidationError(options.typeMessage);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!buffer.byteLength) {
    throw new UploadValidationError(options.emptyMessage);
  }

  if (buffer.byteLength > options.maxBytes) {
    throw new UploadValidationError(options.sizeMessage, 413);
  }

  if (!hasValidFileSignature(contentType, buffer)) {
    throw new UploadValidationError(options.signatureMessage);
  }

  return {
    buffer,
    contentType,
    extension: options.extensionByType[contentType] ?? "bin",
  };
}

export function validateImageBuffer(args: {
  buffer: Buffer;
  contentType: string;
  maxBytes: number;
}) {
  const contentType = args.contentType.toLowerCase();

  if (!args.buffer.byteLength) {
    throw new UploadValidationError("Image payload is empty.");
  }

  if (args.buffer.byteLength > args.maxBytes) {
    throw new UploadValidationError("Image exceeds the maximum allowed size.", 413);
  }

  if (!IMAGE_UPLOAD_TYPES.has(contentType)) {
    throw new UploadValidationError("Unsupported image type.");
  }

  if (!hasValidFileSignature(contentType, args.buffer)) {
    throw new UploadValidationError("Image contents do not match the declared file type.");
  }

  return {
    contentType,
    extension: IMAGE_UPLOAD_EXTENSION_BY_TYPE[contentType] ?? "bin",
  };
}
