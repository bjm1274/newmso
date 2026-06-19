'use client';
import type { WeatherData } from './commute-types';

// ──────────────────────────────────────────────
// AQI 색상 맵
// ──────────────────────────────────────────────

export const AQI_COLOR_MAP: Record<string, string> = {
  green:  '#10B981',
  yellow: '#F59E0B',
  orange: '#F97316',
  red:    '#EF4444',
  gray:   '#9CA3AF',
};

export const AQI_BG_MAP: Record<string, string> = {
  green:  'rgba(16,185,129,0.12)',
  yellow: 'rgba(245,158,11,0.12)',
  orange: 'rgba(249,115,22,0.12)',
  red:    'rgba(239,68,68,0.12)',
  gray:   'rgba(156,163,175,0.12)',
};

// ──────────────────────────────────────────────
// AqiBadge
// ──────────────────────────────────────────────

interface AqiBadgeProps {
  label: string;
  value: string;
  grade: string;
  color: string;
  bg: string;
}

export function AqiBadge({ label, value, grade, color, bg }: AqiBadgeProps) {
  return (
    <div
      className="flex-1 rounded-[var(--radius-md)] px-3 py-2 flex flex-col items-center gap-0.5"
      style={{ background: bg, border: `1px solid ${color}33` }}
    >
      <span className="text-[9px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wide">{label}</span>
      <span className="text-[11px] font-semibold text-[var(--foreground)] tabular-nums">{value}</span>
      <span className="text-[11px] font-bold leading-tight" style={{ color }}>{grade}</span>
    </div>
  );
}

// ──────────────────────────────────────────────
// 출근 완료 모달 (날씨 + 미세먼지)
// ──────────────────────────────────────────────

interface CheckInSuccessModalProps {
  checkInTime: Date | null;
  weather: WeatherData | null;
  onClose: () => void;
}

export function CheckInSuccessModal({ checkInTime, weather, onClose }: CheckInSuccessModalProps) {
  const timeStr = checkInTime
    ? checkInTime.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })
    : '-';

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:pb-4 pointer-events-none">
      <div
        className="w-full max-w-sm pointer-events-auto animate-slide-up"
        style={{ animation: 'slide-up 0.35s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-lg)] overflow-hidden">
          {/* 헤더 */}
          <div className="bg-[var(--accent)] px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="text-white font-bold text-[15px] leading-tight">출근 완료!</p>
                <p className="text-white/75 text-[12px] font-medium">{timeStr} 출근 처리되었습니다</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md)] text-white/70 hover:text-white hover:bg-white/15 active:bg-white/25 transition-colors text-base"
            >
              ×
            </button>
          </div>

          {/* 날씨 / 미세먼지 */}
          <div className="px-5 py-4">
            {!weather ? (
              <div className="flex items-center gap-3 py-1">
                <div className="w-8 h-8 rounded-full skeleton" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton-text" />
                  <div className="skeleton-sm" style={{ width: '60%' }} />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* 날씨 요약 */}
                <div className="flex items-center gap-3">
                  <span className="text-3xl leading-none">{weather.weatherEmoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[22px] font-bold text-[var(--foreground)] tabular-nums leading-none">
                        {weather.temperature}°
                      </span>
                      <span className="text-[13px] font-medium text-[var(--toss-gray-3)]">
                        {weather.weatherLabel}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--toss-gray-4)] mt-0.5">
                      체감 {weather.feelsLike}° · 습도 {weather.humidity}% · 바람 {weather.windSpeed}m/s
                    </p>
                  </div>
                </div>

                {/* 미세먼지 배지 */}
                <div className="flex gap-2">
                  <AqiBadge
                    label="PM2.5"
                    value={weather.pm25 >= 0 ? `${weather.pm25}㎍` : '-'}
                    grade={weather.pm25Grade}
                    color={AQI_COLOR_MAP[weather.pm25GradeColor] ?? '#9CA3AF'}
                    bg={AQI_BG_MAP[weather.pm25GradeColor] ?? 'rgba(156,163,175,0.12)'}
                  />
                  <AqiBadge
                    label="PM10"
                    value={weather.pm10 >= 0 ? `${weather.pm10}㎍` : '-'}
                    grade={weather.pm10Grade}
                    color={AQI_COLOR_MAP[weather.pm10GradeColor] ?? '#9CA3AF'}
                    bg={AQI_BG_MAP[weather.pm10GradeColor] ?? 'rgba(156,163,175,0.12)'}
                  />
                  <div
                    className="flex-1 rounded-[var(--radius-md)] px-3 py-2 flex flex-col items-center justify-center gap-0.5"
                    style={{
                      background: AQI_BG_MAP[weather.aqiColor] ?? 'rgba(156,163,175,0.12)',
                      border: `1px solid ${AQI_COLOR_MAP[weather.aqiColor] ?? '#9CA3AF'}33`,
                    }}
                  >
                    <span className="text-[9px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wide">종합</span>
                    <span
                      className="text-[13px] font-bold leading-tight"
                      style={{ color: AQI_COLOR_MAP[weather.aqiColor] ?? '#9CA3AF' }}
                    >
                      {weather.aqi}
                    </span>
                  </div>
                </div>

                <p className="text-[10px] text-[var(--toss-gray-4)] text-right">
                  현재 위치 기준 · Open-Meteo
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 퇴근 완료 모달
// ──────────────────────────────────────────────

interface CheckOutSuccessModalProps {
  summary: {
    checkInTime: string;
    checkOutTime: string;
    workedMinutes: number;
  };
  formatWorkedDuration: (workedMinutes: number) => string;
  onClose: () => void;
}

export function CheckOutSuccessModal({ summary, formatWorkedDuration, onClose }: CheckOutSuccessModalProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:pb-4 pointer-events-none">
      <div
        className="w-full max-w-sm pointer-events-auto animate-slide-up"
        style={{ animation: 'slide-up 0.35s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-lg)]">
          <div className="flex items-center justify-between bg-slate-900 px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🌙</span>
              <div>
                <p className="text-[15px] font-bold leading-tight">퇴근 완료</p>
                <p className="text-[12px] font-medium text-white/75">수고하셨습니다. 오늘 근무가 안전하게 저장됐습니다.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-base text-white/70 transition-colors hover:bg-white/15 active:bg-white/25 hover:text-white"
            >
              ×
            </button>
          </div>

          <div className="space-y-3 px-5 py-4">
            <div className="rounded-[var(--radius-lg)] bg-[var(--muted)] p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">총 근무시간</p>
              <p className="mt-2 text-2xl font-black text-[var(--foreground)]">{formatWorkedDuration(summary.workedMinutes)}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-3">
                <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">출근</p>
                <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{summary.checkInTime}</p>
              </div>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-3">
                <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">퇴근</p>
                <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{summary.checkOutTime}</p>
              </div>
            </div>

            <p className="text-right text-[11px] font-medium text-[var(--toss-gray-4)]">휴식 잘 챙기시고 내일도 좋은 하루 보내세요.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// GPS 경고 모달 (위치 설정 안내)
// ──────────────────────────────────────────────

interface GpsWarningModalProps {
  onClose: () => void;
}

export function GpsWarningModal({ onClose }: GpsWarningModalProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="w-full max-w-md pointer-events-auto"
        style={{ animation: 'slide-up 0.3s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-lg)]">
          {/* 헤더 */}
          <div className="bg-red-600 px-5 py-4 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="text-[15px] font-bold leading-tight">GPS 위치 설정 안내</p>
                <p className="text-[12px] font-medium text-white/75">위치 정보가 꺼져 있거나 차단되어 있습니다.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-base text-white/70 transition-colors hover:bg-white/15 active:bg-white/25 hover:text-white"
            >
              ×
            </button>
          </div>

          {/* 본문 */}
          <div className="space-y-4 px-6 py-5">
            <p className="text-[13px] text-[var(--toss-gray-5)] leading-relaxed font-semibold">
              출퇴근 체크를 위해서는 기기의 GPS 활성화 및 브라우저의 위치 권한 허용이 필요합니다. 아래 가이드에 따라 설정을 확인해 주세요.
            </p>

            <div className="space-y-3 rounded-[var(--radius-lg)] bg-[var(--muted)] p-4 border border-[var(--border-subtle)] text-[12px] text-[var(--foreground)]">
              <div>
                <p className="font-black text-red-600 flex items-center gap-1.5 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
                  1. 브라우저 주소창 확인
                </p>
                <p className="pl-3 text-[var(--toss-gray-4)] leading-relaxed">
                  주소창 왼쪽의 <b>자물쇠 아이콘(또는 설정 아이콘)</b>을 누른 뒤 <b>&lsquo;위치&rsquo; 권한을 &lsquo;허용&rsquo;</b>으로 변경해 주세요.
                </p>
              </div>
              <div>
                <p className="font-black text-red-600 flex items-center gap-1.5 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
                  2. 윈도우(PC) 위치 서비스 설정
                </p>
                <p className="pl-3 text-[var(--toss-gray-4)] leading-relaxed">
                  시작 &gt; 설정 &gt; <b>개인 정보 및 보안 &gt; 위치</b> 메뉴에서 <b>&lsquo;위치 서비스&rsquo;</b>를 켜고, 사용 중인 브라우저의 위치 액세스 권한을 켬으로 설정해 주세요.
                </p>
              </div>
              <div>
                <p className="font-black text-red-600 flex items-center gap-1.5 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
                  3. 새로고침 후 재시도
                </p>
                <p className="pl-3 text-[var(--toss-gray-4)] leading-relaxed">
                  설정 완료 후 브라우저를 <b>새로고침(F5)</b>한 뒤 다시 시도해 주세요.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-28 px-4 py-2 bg-[var(--accent)] hover:opacity-90 active:scale-95 text-white font-bold rounded-[var(--radius-md)] text-xs shadow-sm transition-all"
              >
                설정 완료 및 닫기
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

