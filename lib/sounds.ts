'use client';

/**
 * 카카오톡/토스 스타일의 프리미엄 알림음 유틸리티
 * Web Audio API를 사용하여 깨끗하고 선명한 사운드를 생성합니다.
 */

class NotificationSoundEngine {
    private ctx: AudioContext | null = null;

    private initContext() {
        if (!this.ctx && typeof window !== 'undefined') {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
            }
        }
        return this.ctx;
    }

    private playTone(freq: number, startTime: number, duration: number, volume: number = 0.2) {
        const ctx = this.initContext();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration);
    }

    /**
     * 카카오톡 스타일의 "톡!" 소리 (더블 비프)
     * 높은 주파수에서 낮은 주파수로 빠르게 전이되어 경쾌한 느낌 제공
     */
    public playTalk() {
        const ctx = this.initContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        // 첫 번째 짧고 높은 음
        this.playTone(1760, now, 0.08, 0.15); // A6
        // 두 번째 조금 더 긴 음
        this.playTone(1320, now + 0.1, 0.12, 0.12); // E6
    }

    /**
     * 기분 좋은 시스템 알림음 (동글동글한 소리)
     */
    public playSystem() {
        const ctx = this.initContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        this.playTone(880, now, 0.15, 0.1);
        this.playTone(1108, now + 0.15, 0.2, 0.08);
    }

    /**
     * 경고/에러 알림음 (부드러운 하향음)
     */
    public playAlert() {
        const ctx = this.initContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        this.playTone(660, now, 0.2, 0.15);
        this.playTone(440, now + 0.1, 0.3, 0.1);
    }
}

export const sound = new NotificationSoundEngine();
