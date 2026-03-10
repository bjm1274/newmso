import webpush from 'web-push';

let lastConfigSignature = '';

function getVapidConfig() {
  const publicKey =
    process.env.VAPID_PUBLIC_KEY?.trim() ||
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ||
    '';
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || '';
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@example.com';

  if (!publicKey || !privateKey) {
    throw new Error('Web Push VAPID keys are not configured.');
  }

  return { publicKey, privateKey, subject };
}

function ensureWebPushConfigured() {
  const { publicKey, privateKey, subject } = getVapidConfig();
  const signature = `${subject}:${publicKey}:${privateKey}`;

  if (signature !== lastConfigSignature) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    lastConfigSignature = signature;
  }

  return { publicKey, subject };
}

async function sendWebPushNotification(subscription, payload) {
  ensureWebPushConfigured();

  return webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      expirationTime: null,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    },
    payload
  );
}

export {
  ensureWebPushConfigured,
  sendWebPushNotification,
};
