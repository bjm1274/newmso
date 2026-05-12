export function urlBase64ToUint8Array(b64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

export function uint8ArrayToBase64Url(value: ArrayBuffer | null | undefined) {
  if (!value) return '';
  const bytes = new Uint8Array(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function getPushVapidStorageKey(staffId?: string) {
  return `erp_push_vapid_public_key:${staffId || 'guest'}`;
}

export function getPushSubscriptionActiveKey(staffId?: string) {
  return `erp_push_subscription_active:${staffId || 'guest'}`;
}
