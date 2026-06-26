'use client';
import { Component, ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean; error?: Error };

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary:', error, errorInfo);
    if (typeof window !== 'undefined') {
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
    // 정상적으로 마운트되었을 때는 이전 청크 에러 관련 리로드 플래그를 청소해 줌
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('chunk-error-reloaded');
      } catch (e) {
        // ignore
      }
    }
  }

  handleReset = () => {
    const errorMessage = this.state.error?.message || '';
    const isChunkError = errorMessage.toLowerCase().includes('chunk') || errorMessage.toLowerCase().includes('loading css chunk');
    
    if (isChunkError && typeof window !== 'undefined') {
      window.location.reload();
    } else {
      this.setState({ hasError: false, error: undefined });
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[200px] flex flex-col items-center justify-center p-8 bg-red-500/10 border border-red-100 rounded-2xl">
          <span className="text-4xl mb-4">⚠️</span>
          <h3 className="text-lg font-black text-[var(--foreground)] mb-2">오류가 발생했습니다</h3>
          <p className="text-sm text-[var(--toss-gray-3)] font-bold mb-4">{this.state.error?.message}</p>
          <button onClick={this.handleReset} className="px-6 py-2 bg-gray-800 text-white rounded-xl text-xs font-black">
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
