import type { MessageRetryPayload } from './메신저유틸';

export type PresenceInfo = {
  userId: string;
  name: string;
  roomId: string | null;
  onlineAt: string;
};

export type DeliveryState = {
  status: 'sending' | 'failed' | 'sent';
  retryPayload?: MessageRetryPayload;
  error?: string | null;
};
