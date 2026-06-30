export const TYPE_CFG: Record<string, { icon: string; bg: string; progress: string; accent: string }> = {
  message: { icon: '💬', bg: 'bg-blue-500/100', progress: 'bg-blue-400', accent: 'border-blue-400' },
  mention: { icon: '📣', bg: 'bg-indigo-500/100', progress: 'bg-indigo-400', accent: 'border-indigo-400' },
  approval: { icon: '📋', bg: 'bg-violet-600', progress: 'bg-violet-400', accent: 'border-violet-400' },
  payroll: { icon: '💰', bg: 'bg-emerald-600', progress: 'bg-emerald-400', accent: 'border-emerald-400' },
  inventory: { icon: '📦', bg: 'bg-orange-500/100', progress: 'bg-orange-400', accent: 'border-orange-400' },
  attendance: { icon: '⏰', bg: 'bg-teal-500', progress: 'bg-teal-400', accent: 'border-teal-400' },
  board: { icon: '📌', bg: 'bg-pink-500/100', progress: 'bg-pink-400', accent: 'border-pink-400' },
  인사: { icon: '👥', bg: 'bg-cyan-600', progress: 'bg-cyan-400', accent: 'border-cyan-400' },
  education: { icon: '📚', bg: 'bg-purple-500/100', progress: 'bg-purple-400', accent: 'border-purple-400' },
  todo: { icon: '🗓️', bg: 'bg-sky-600', progress: 'bg-sky-400', accent: 'border-sky-400' },
  notification: { icon: '🔔', bg: 'bg-[var(--toss-gray-4)]', progress: 'bg-[var(--toss-gray-3)]', accent: 'border-[var(--border)]' } };

export const DEFAULT_CFG = { icon: '🔔', bg: 'bg-[var(--toss-gray-4)]', progress: 'bg-[var(--toss-gray-3)]', accent: 'border-[var(--border)]' };

export const getTypeCfg = (type: string) => TYPE_CFG[type] || DEFAULT_CFG;
