'use client';
import { toast } from '@/lib/toast';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function DataReseter({ onRefresh }: { onRefresh: () => void }) {
  const [password, setPassword] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);

  // 1. 보안 잠금 해제 로직 (서버에서 bcrypt 검증)
  const handleUnlock = async () => {
    const res = await fetch('/api/admin/verify-unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({ ok: false }));
    if (data.ok) {
      setIsUnlocked(true);
      toast("보안 잠금이 해제되었습니다. 모든 초기화 기능이 활성화됩니다.");
    } else {
      toast("보안 암호가 일치하지 않습니다.");
    }
  };

  // 2. 통합 초기화 로직
  const runReset = async (type: string) => {
    if (!confirm("이 작업은 복구가 불가능합니다. 정말로 진행하시겠습니까?")) return;

    try {
      if (type === 'chat') {
        // 채팅 메시지, 읽음 확인, 알림 설정, 채팅방 전체 삭제
        await supabase.from('messages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('message_reads').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('room_notification_settings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('chat_rooms').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }
      else if (type === 'inventory') {
        // 재고 및 로그 삭제
        await supabase.from('inventory_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('inventory').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }
      else if (type === 'board') {
        // 게시판(공지사항, 경조사 등) 게시물 및 댓글 삭제 (수술일정/MRI 제외)
        await supabase.from('posts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('board_post_comments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('board_posts').delete().neq('board_type', '수술일정').neq('board_type', 'MRI일정표').neq('board_type', 'mri');
      }
      else if (type === 'schedule') {
        // 수술일정 및 MRI일정표 게시물 삭제
        await supabase.from('board_posts').delete().in('board_type', ['수술일정', 'MRI일정표', 'mri']);
      }
      else if (type === 'staff') {
        // 서버 API에서 Service Role로 삭제 (관리자 제외)
        const res = await fetch('/api/admin/reset-staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        toast((data?.message || '삭제 완료') + " 페이지를 새로고침합니다.", 'success');
        window.location.reload();
        return;
      }
      else if (type === 'system_logs') {
        // 시스템 감사 로그 삭제
        await supabase.from('audit_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }
      else if (type === 'expired_contracts') {
        // 미체결 계약서 초안 삭제 (30일 경과)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        await supabase.from('employment_contracts').delete().eq('status', 'pending').lt('created_at', thirtyDaysAgo);
      }
      else if (type === 'expired_popups') {
        // 비활성화된 팝업 미디어 정리
        await supabase.from('popups').delete().eq('is_active', false);
      }
      else if (type === 'force_logout') {
        // 전역 세션 만료 시간 업데이트
        const now = new Date().toISOString();
        await supabase
          .from('system_configs')
          .upsert({ key: 'min_auth_time', value: now, description: '전체 로그아웃 시점' }, { onConflict: 'key' });
      }

      toast("선택하신 데이터 초기화 작업이 성공적으로 완료되었습니다.", 'success');
      onRefresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast("데이터 삭제 중 오류가 발생했습니다.\n\n" + msg + "\n\nSupabase 대시보드에서 RLS 정책 또는 API 권한을 확인해 주세요.", 'error');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full animate-in fade-in duration-500">
      {!isUnlocked ? (
        <div className="bg-[var(--card)] p-6 border border-red-100 shadow-sm text-center space-y-4 max-w-sm w-full">
          <h3 className="font-semibold text-base text-red-600 tracking-tight uppercase">시스템 보안 인증</h3>
          <p className="text-[11px] text-[var(--toss-gray-3)] font-bold tracking-widest uppercase">보안 구역 접근을 위해 암호를 입력하세요</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 bg-[var(--muted)] border border-[var(--border)] text-center font-semibold text-xl outline-none focus:border-red-600"
            placeholder="••••••"
          />
          <button onClick={handleUnlock} className="w-full py-2 bg-red-600 text-white text-xs font-semibold shadow-sm">보안 잠금 해제</button>
        </div>
      ) : (
        <div className="w-full max-w-2xl space-y-4">
          <div className="bg-red-500/10 p-4 border border-red-100 text-center mb-4">
            <h3 className="text-red-600 font-semibold text-sm mb-1 tracking-tight uppercase">통합 데이터 초기화 관리</h3>
            <p className="text-[11px] text-red-400 font-bold uppercase tracking-widest">항목별 실행 버튼을 누르면 즉시 영구 삭제됩니다.</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {/* 기본 항목 */}
            <ResetButton onClick={() => runReset('chat')} label="💬 사내 채팅 내역 및 채팅방 전체 삭제" />
            <ResetButton onClick={() => runReset('inventory')} label="📦 재고 현황 및 입출고 로그 전체 삭제" />
            <ResetButton onClick={() => runReset('board')} label="📋 게시판 게시물(공지/경조사 등) 전체 삭제" />
            <ResetButton onClick={() => runReset('schedule')} label="🏥 수술일정 및 MRI일정표 전체 삭제" />

            {/* 추천 항목 */}
            <ResetButton onClick={() => runReset('system_logs')} label="🕒 시스템 활동 및 접속 로그 초기화 (용량 확보)" />
            <ResetButton onClick={() => runReset('expired_contracts')} label="📄 30일 경과 미체결 계약서 초안 일괄 삭제" />
            <ResetButton onClick={() => runReset('expired_popups')} label="🖼️ 비활성화된 홈페이지 팝업 데이터 정리" />
            <ResetButton onClick={() => runReset('force_logout')} label="🚫 모든 시스템 접속자 강제 로그아웃" />

            {/* 직원 삭제: 관리자는 항상 제외 */}
            <button
              onClick={() => runReset('staff')}
              className="p-4 bg-[var(--card)] border-2 border-red-50 hover:border-red-600 hover:bg-red-500/10 text-left font-semibold text-xs text-red-600 flex justify-between items-center transition-all group"
            >
              <span>👤 관리자 제외 전 직원 계정 및 데이터 삭제</span>
              <span className="text-[11px] font-bold px-2 py-1 bg-red-600 text-white uppercase">관리자 유지</span>
            </button>
          </div>

          <button
            onClick={() => setIsUnlocked(false)}
            className="w-full py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest hover:text-[var(--toss-gray-4)] transition-colors"
          >
            관리자 모드 종료 및 화면 잠금
          </button>
        </div>
      )}
    </div>
  );
}

// 공통 버튼 컴포넌트 (각진 디자인)
function ResetButton({ onClick, label }: { onClick: () => void, label: string }) {
  return (
    <button onClick={onClick} className="p-3 bg-[var(--card)] border border-[var(--border)] hover:border-red-500 hover:text-red-600 text-left font-semibold text-xs flex justify-between items-center transition-all group">
      <span>{label}</span>
      <span className="text-[11px] opacity-0 group-hover:opacity-100 transition-opacity font-bold uppercase text-red-500">실행하기</span>
    </button>
  );
}