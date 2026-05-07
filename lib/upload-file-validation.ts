const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;
const GIF87A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] as const;
const GIF89A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] as const;
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;
const WEBP_RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50] as const;
const SIGNATURE_READ_BYTES = 32;

type UploadValidationInput = {
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  bytes?: Uint8Array | null;
};

export type UploadTargetValidationOptions = {
  maxFileSizeBytes: number;
  maxImageSizeBytes?: number | null;
  maxVideoSizeBytes?: number | null;
  allowedMimeTypes?: readonly string[] | ReadonlySet<string> | null;
};

export type NormalizedUploadTarget = {
  fileName: string;
  mimeType: string;
  fileSize: number;
};

function formatLimitLabel(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${Math.round((bytes / (1024 * 1024)) * 10) / 10}MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round((bytes / 1024) * 10) / 10}KB`;
  }
  return `${bytes} bytes`;
}

function normalizeUploadTargetFileSize(fileSize: unknown) {
  const normalizedFileSize =
    typeof fileSize === 'string' && fileSize.trim() === ''
      ? Number.NaN
      : Number(fileSize);
  if (!Number.isFinite(normalizedFileSize) || normalizedFileSize <= 0) {
    return null;
  }
  return Math.max(1, Math.floor(normalizedFileSize));
}

function resolveAllowedMimeTypes(
  allowedMimeTypes: UploadTargetValidationOptions['allowedMimeTypes'],
) {
  if (!allowedMimeTypes) return null;
  const values = Array.from(allowedMimeTypes);
  const normalized = values
    .map((value: string) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  return normalized.length > 0 ? new Set(normalized) : null;
}

function resolveUploadTargetMaxBytes(
  mimeType: string,
  options: UploadTargetValidationOptions,
) {
  const hasVideoOverride = Object.prototype.hasOwnProperty.call(options, 'maxVideoSizeBytes');
  const hasImageOverride = Object.prototype.hasOwnProperty.call(options, 'maxImageSizeBytes');

  if (mimeType.startsWith('video/')) {
    return hasVideoOverride ? options.maxVideoSizeBytes ?? null : options.maxFileSizeBytes;
  }
  if (mimeType.startsWith('image/')) {
    return hasImageOverride ? options.maxImageSizeBytes ?? null : options.maxFileSizeBytes;
  }
  return options.maxFileSizeBytes;
}

function getNormalizedExtension(fileName: string | null | undefined) {
  const normalizedName = String(fileName || '').trim();
  const lastDotIndex = normalizedName.lastIndexOf('.');
  if (lastDotIndex < 0 || lastDotIndex === normalizedName.length - 1) {
    return '';
  }
  return normalizedName.slice(lastDotIndex + 1).toLowerCase();
}

function matchesPrefix(bytes: Uint8Array, prefix: readonly number[]) {
  if (bytes.length < prefix.length) return false;
  return prefix.every((value, index) => bytes[index] === value);
}

function looksLikeWebp(bytes: Uint8Array) {
  return (
    matchesPrefix(bytes, WEBP_RIFF_SIGNATURE) &&
    bytes.length >= 12 &&
    WEBP_WEBP_SIGNATURE.every((value, index) => bytes[index + 8] === value)
  );
}

function isPngFile(mimeType: string, extension: string) {
  return mimeType === 'image/png' || extension === 'png';
}

function isJpegFile(mimeType: string, extension: string) {
  return mimeType === 'image/jpeg' || extension === 'jpg' || extension === 'jpeg';
}

function isGifFile(mimeType: string, extension: string) {
  return mimeType === 'image/gif' || extension === 'gif';
}

function isWebpFile(mimeType: string, extension: string) {
  return mimeType === 'image/webp' || extension === 'webp';
}

function isPdfFile(mimeType: string, extension: string) {
  return mimeType === 'application/pdf' || extension === 'pdf';
}

function getKnownSignatureValidationError(
  bytes: Uint8Array,
  mimeType: string,
  extension: string,
  fileSize: number,
) {
  if (isPngFile(mimeType, extension)) {
    if (fileSize < 24 || !matchesPrefix(bytes, PNG_SIGNATURE)) {
      return 'PNG file looks incomplete or corrupted.';
    }
    return null;
  }

  if (isJpegFile(mimeType, extension)) {
    if (fileSize < 4 || !matchesPrefix(bytes, JPEG_SIGNATURE)) {
      return 'JPEG file looks incomplete or corrupted.';
    }
    return null;
  }

  if (isGifFile(mimeType, extension)) {
    if (fileSize < 10 || (!matchesPrefix(bytes, GIF87A_SIGNATURE) && !matchesPrefix(bytes, GIF89A_SIGNATURE))) {
      return 'GIF file looks incomplete or corrupted.';
    }
    return null;
  }

  if (isWebpFile(mimeType, extension)) {
    if (fileSize < 16 || !looksLikeWebp(bytes)) {
      return 'WEBP file looks incomplete or corrupted.';
    }
    return null;
  }

  if (isPdfFile(mimeType, extension)) {
    if (fileSize < 8 || !matchesPrefix(bytes, PDF_SIGNATURE)) {
      return 'PDF file looks incomplete or corrupted.';
    }
    return null;
  }

  return null;
}

export function getUploadValidationError({
  fileName,
  mimeType,
  fileSize,
  bytes,
}: UploadValidationInput) {
  const normalizedMimeType = String(mimeType || '').trim().toLowerCase();
  const normalizedFileSize = normalizeUploadTargetFileSize(fileSize);

  if (!normalizedFileSize) {
    return 'Empty files cannot be uploaded.';
  }

  if (!bytes || bytes.length === 0) {
    return null;
  }

  return getKnownSignatureValidationError(
    bytes,
    normalizedMimeType,
    getNormalizedExtension(fileName),
    normalizedFileSize,
  );
}

export function assertUploadTargetIsValid(
  {
    fileName,
    mimeType,
    fileSize,
  }: {
    fileName?: string | null;
    mimeType?: string | null;
    fileSize?: unknown;
  },
  options: UploadTargetValidationOptions,
): NormalizedUploadTarget {
  const normalizedFileName = String(fileName || '').trim();
  const normalizedMimeType =
    String(mimeType || 'application/octet-stream').trim().toLowerCase() || 'application/octet-stream';
  const normalizedFileSize = normalizeUploadTargetFileSize(fileSize);

  if (!normalizedFileName) {
    throw new Error('A file name is required before upload.');
  }

  if (!normalizedFileSize) {
    throw new Error('A valid file size is required before upload.');
  }

  const allowedMimeTypes = resolveAllowedMimeTypes(options.allowedMimeTypes);
  if (allowedMimeTypes && !allowedMimeTypes.has(normalizedMimeType)) {
    throw new Error(`Files of type ${normalizedMimeType || 'unknown'} are not allowed.`);
  }

  const maxBytes = resolveUploadTargetMaxBytes(normalizedMimeType, options);
  if (maxBytes != null && normalizedFileSize > maxBytes) {
    const kindLabel = normalizedMimeType.startsWith('video/')
      ? 'Video'
      : normalizedMimeType.startsWith('image/')
        ? 'Image'
        : 'File';
    throw new Error(`${kindLabel} uploads must be ${formatLimitLabel(maxBytes)} or smaller.`);
  }

  return {
    fileName: normalizedFileName,
    mimeType: normalizedMimeType,
    fileSize: normalizedFileSize,
  };
}

export async function assertUploadBlobIsValid(
  blob: Blob,
  options?: {
    fileName?: string | null;
    mimeType?: string | null;
  },
) {
  const prefixBytes = new Uint8Array(await blob.slice(0, SIGNATURE_READ_BYTES).arrayBuffer());
  const error = getUploadValidationError({
    fileName: options?.fileName,
    mimeType: options?.mimeType,
    fileSize: blob.size,
    bytes: prefixBytes,
  });

  if (error) {
    throw new Error(error);
  }
}
