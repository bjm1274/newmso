'use client';
import { Component, ReactNode, ErrorInfo } from 'react';

type Props = { children: ReactNode };
type State = {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  showDetails: boolean;
  copied: boolean;
};

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, showDetails: false, copied: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });

    if (typeof window !== 'undefined') {
      try {
        fetch('/api/client-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: error?.message,
            name: error?.name,
            stack: error?.stack,
            componentStack: errorInfo?.componentStack,
            url: window.location.href,
            userAgent: navigator.userAgent,
            time: new Date().toISOString(),
          }),
        }).catch(() => {});
      } catch (e) {}

      if (!Array.isArray((window as any).__errorLog)) {
        (window as any).__errorLog = [];
      }
      const log: any[] = (window as any).__errorLog;
      if (log.length < 50) {
        log.push({ error: String(error), stack: error.stack, info: errorInfo.componentStack, time: new Date().toISOString() });
      }

      // Chunk Load Error (배포 후 구버전 캐시로 인한 청크 유실) 감지 시 자동 1회 새로고침 시도
      const errorMessage = error?.message || '';
      const isChunkError = errorMessage.toLowerCase().includes('chunk') || errorMessage.toLowerCase().includes('loading css chunk');
      if (isChunkError) {
        try {
          const chunkReloadKey = 'chunk-error-reloaded';
          const hasReloaded = sessionStorage.getItem(chunkReloadKey);
          if (!hasReloaded) {
            sessionStorage.setItem(chunkReloadKey, 'true');
            window.location.reload();
          }
        } catch (e) {
          console.error('Failed to auto-reload on chunk error:', e);
        }
      }
    }
  }

  componentDidMount() {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('chunk-error-reloaded');
      } catch (e) {}
    }
  }

  handleReset = () => {
    const errorMessage = this.state.error?.message || '';
    const isChunkError = errorMessage.toLowerCase().includes('chunk') || errorMessage.toLowerCase().includes('loading css chunk');
    
    if (isChunkError && typeof window !== 'undefined') {
      window.location.reload();
    } else {
      this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    }
  };

  handleCopyError = () => {
    const text = `Error: ${this.state.error?.message}\n\nStack:\n${this.state.error?.stack || ''}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack || ''}`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    }
  };

  render() {
    if (this.state.hasError) {
      const errorText = `${this.state.error?.message || '알 수 없는 오류'}\n${this.state.error?.stack || ''}\n${this.state.errorInfo?.componentStack || ''}`;

      return (
        <div className="min-h-[300px] flex flex-col items-center justify-center p-8 bg-red-500/10 border border-red-200 rounded-2xl max-w-2xl mx-auto my-8">
          <span className="text-4xl mb-3">⚠️</span>
          <h3 className="text-lg font-black text-[var(--foreground)] mb-2">오류가 발생했습니다</h3>
          <p className="text-sm text-red-600 font-bold mb-4 max-w-md text-center break-words">{this.state.error?.message}</p>
          
          <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
            <button onClick={this.handleReset} className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-black transition-colors">
              다시 시도
            </button>
            <button
              onClick={async () => {
                if (typeof window !== 'undefined') {
                  try {
                    sessionStorage.clear();
                    if ('serviceWorker' in navigator) {
                      const regs = await navigator.serviceWorker.getRegistrations();
                      await Promise.all(regs.map((r) => r.unregister()));
                    }
                    if ('caches' in window) {
                      const keys = await caches.keys();
                      await Promise.all(keys.map((k) => caches.delete(k)));
                    }
                  } catch (e) {}
                  window.location.href = '/login';
                }
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black transition-colors"
            >
              캐시 비우고 새로고침
            </button>
            <button
              onClick={this.handleCopyError}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl text-xs font-bold transition-colors"
            >
              {this.state.copied ? '✔ 복사 완료' : '📋 오류 내용 복사'}
            </button>
            <button
              onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
              className="px-3 py-2 text-xs text-gray-500 underline"
            >
              {this.state.showDetails ? '상세 닫기' : '상세 보기'}
            </button>
          </div>

          {this.state.showDetails && (
            <div className="w-full mt-2 p-3 bg-gray-900 text-green-400 text-xs font-mono rounded-lg overflow-x-auto max-h-60 overflow-y-auto select-all">
              <pre className="whitespace-pre-wrap">{errorText}</pre>
            </div>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
