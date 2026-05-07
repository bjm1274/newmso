'use client';

const uploadIdByBlob = new WeakMap<Blob, string>();

export function createClientUploadId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function normalizeClientUploadId(value: string | null | undefined) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  return normalized || null;
}

export function getOrCreateClientUploadId(blob: Blob, preferredId?: string | null) {
  const normalizedPreferredId = normalizeClientUploadId(preferredId);
  if (normalizedPreferredId) {
    uploadIdByBlob.set(blob, normalizedPreferredId);
    return normalizedPreferredId;
  }

  const existingId = uploadIdByBlob.get(blob);
  if (existingId) {
    return existingId;
  }

  const createdId = createClientUploadId();
  uploadIdByBlob.set(blob, createdId);
  return createdId;
}
