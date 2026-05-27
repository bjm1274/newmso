/**
 * OpsWorkcenter 신규 UI 파트 — barrel export
 * 부모(OpsWorkcenter.tsx)는 dynamic import 로 끌어쓴다.
 */
export { default as MessageTemplatesTab } from './MessageTemplatesTab';
export { default as IntegrationsTab } from './IntegrationsTab';
export { default as MessageTemplateCard } from './MessageTemplateCard';
export { default as IntegrationCard } from './IntegrationCard';
export type { MessageTemplate, MessageChannel } from './MessageTemplateCard';
export type { Integration, IntegrationVendor, IntegrationStatus } from './IntegrationCard';
