export type ToastType = 'success' | 'error' | 'warning' | 'info';

export function toast(message: string, type: ToastType = 'info') {
  if (typeof document === 'undefined') return;

  let container = document.getElementById('__toast_container__');
  if (!container) {
    container = document.createElement('div');
    container.id = '__toast_container__';
    container.style.cssText =
      'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;';
    document.body.appendChild(container);
  }

  const el = document.createElement('div');
  const bg: Record<ToastType, string> = {
    success: '#10b981',
    error:   '#ef4444',
    warning: '#f59e0b',
    info:    '#3b82f6',
  };
  el.style.cssText = `
    background:${bg[type]};
    color:#fff;
    padding:10px 20px;
    border-radius:10px;
    font-size:14px;
    font-weight:500;
    box-shadow:0 4px 16px rgba(0,0,0,0.18);
    pointer-events:none;
    opacity:1;
    transition:opacity 0.3s;
    max-width:320px;
    text-align:center;
    white-space:pre-line;
  `;
  el.textContent = message;
  container.appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 3000);
}
