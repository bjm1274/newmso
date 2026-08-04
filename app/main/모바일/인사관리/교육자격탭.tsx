 
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '@/lib/db-client';
import type { StaffMember, ErpUser } from '@/types';
import { toast } from '@/lib/toast';
import { getKoreanTodayString } from '@/lib/seoul-time';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';
import { daysUntil, expiryTone } from './data-hooks';

interface LicenseRow {
  id: string;
  staff_id: string | null;
  staff_name: string | null;
  license_name: string | null;
  expiry_date: string | null;
}

interface EduTabProps {
  staffs?: StaffMember[];
  company?: string;
  user?: ErpUser;
}

export default function 교육자격탭({ staffs = [], company, user }: EduTabProps) {
  const [rows, setRows] = useState<LicenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // 등록 폼 상태
  const [newStaffId, setNewStaffId] = useState('');
  const [newLicenseName, setNewLicenseName] = useState('');
  const [newExpiryDate, setNewExpiryDate] = useState(getKoreanTodayString().replaceAll('-', '.'));

  const isHrAdmin = useMemo(() => {
    if (!user) return false;
    const perms = (user.permissions ?? {}) as Record<string, unknown>;
    return (
      perms.mso === true ||
      perms.menu_인사관리 === true ||
      user.role === '관리자' ||
      user.role === '매니저'
    );
  }, [user]);

  // 대상자 정보 매핑
  const targetStaff = useMemo(() => staffs.find((s) => String(s.id) === newStaffId) || null, [staffs, newStaffId]);

  const fetchLicenses = useCallback(async () => {
    setLoading(true);
    try {
      // 정본 테이블은 staff_licenses 이며 staff_name/status/company 컬럼이 없다.
      // 직원 명단과 조인하여 staff_name 매핑 필요
      const q = db
        .from('staff_licenses')
        .select('id, staff_id, license_name, expiry_date')
        .order('expiry_date', { ascending: true })
        .limit(100);

      const { data, error } = await q;
      if (error) throw error;

      const staffMap = new Map(staffs.map((s) => [String(s.id), s] as const));

      setRows(
        ((data ?? []) as Record<string, unknown>[]).map((r) => {
          const sId = typeof r.staff_id === 'string' ? r.staff_id : '';
          const staff = staffMap.get(sId);
          return {
            id: String(r.id ?? ''),
            staff_id: sId || null,
            staff_name: staff?.name || '미지정',
            license_name: typeof r.license_name === 'string' ? r.license_name : null,
            expiry_date: typeof r.expiry_date === 'string' ? r.expiry_date : null,
          };
        }),
      );
    } catch (err) {
      console.error('[mobile-hr] licenses load failed', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [staffs]);

  useEffect(() => {
    void fetchLicenses();
  }, [fetchLicenses]);

  // 등록 동작
  const handleCreateLicense = async () => {
    if (!newStaffId) {
      toast('대상 직원을 선택해 주세요.', 'warning');
      return;
    }
    if (!newLicenseName.trim()) {
      toast('면허/자격증 명칭을 입력해 주세요.', 'warning');
      return;
    }
    if (!newExpiryDate.trim()) {
      toast('만료일자를 입력해 주세요.', 'warning');
      return;
    }

    try {
      const insertData = {
        staff_id: newStaffId,
        license_name: newLicenseName.trim(),
        expiry_date: newExpiryDate.replaceAll('.', '-'),
      };

      const { error } = await db.from('staff_licenses').insert([insertData]);
      if (error) throw error;

      toast('면허·자격증이 등록되었습니다.', 'success');
      setShowCreateModal(false);
      // 폼 리셋
      setNewStaffId('');
      setNewLicenseName('');
      setNewExpiryDate(getKoreanTodayString().replaceAll('-', '.'));
      void fetchLicenses();
    } catch (err) {
      console.error('[mobile-hr] 면허/자격 등록 오류:', err);
      toast('면허·자격 등록에 실패했습니다.', 'error');
    }
  };

  if (loading && rows.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
        불러오는 중...
      </div>
    );
  }

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      {isHrAdmin && (
        <div style={{ marginBottom: 12 }}>
          <MBtn variant="primary" icon="plus" block onClick={() => setShowCreateModal(true)}>
            새 교육·자격 등록
          </MBtn>
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
          등록된 면허·자격증이 없습니다.
        </div>
      ) : (
        <div className="m-card flush macos-glass macos-squircle">
          {rows.map((r) => {
            const left = daysUntil(r.expiry_date);
            const tone = expiryTone(left);
            const label =
              left === null
                ? '정보 부족'
                : left < 0
                  ? `${-left}일 지남`
                  : left <= 30
                    ? `D-${left} 만료 임박`
                    : left <= 90
                      ? '3개월 내 만료'
                      : '정상';
            return (
              <div key={r.id} className="m-list-row">
                <div className={'ico-tile tone-' + (tone || '')}>
                  <MIcon name="badge" size={18} />
                </div>
                <div>
                  <div className="lbl">
                    {r.staff_name ?? '직원'}{' '}
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--z-500)',
                        fontWeight: 600,
                      }}
                    >
                      · {r.license_name ?? '면허'}
                    </span>
                  </div>
                  <div className="sub">만료일 {r.expiry_date ?? '-'}</div>
                </div>
                <MChip tone={tone}>{label}</MChip>
              </div>
            );
          })}
        </div>
      )}

      {/* 새 교육/자격 등록 모달 */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="새 면허·자격 등록"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'flex-end',
          }}
        >
          <div
            className="animate-in slide-in-from-bottom duration-250 macos-glass macos-squircle"
            style={{
              width: '100%',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: '20px 16px 24px',
              maxHeight: '92vh',
              overflowY: 'auto',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--z-900)' }}>새 교육·자격 등록</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                aria-label="닫기"
              >
                <MIcon name="x" size={20} color="var(--z-500)" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* 대상 직원 */}
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--z-600)' }}>대상 직원</span>
                <select
                  value={newStaffId}
                  onChange={(e) => setNewStaffId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 14,
                    borderRadius: 10,
                    border: '1px solid var(--m-border)',
                    background: 'var(--m-bg)',
                    color: 'var(--z-900)',
                    marginTop: 4,
                    outline: 'none',
                  }}
                >
                  <option value="">대상 직원 선택</option>
                  {staffs
                    .filter((s) => s.status !== '퇴사')
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.department || '부서 없음'} · {s.position || '직급 없음'})
                      </option>
                    ))}
                </select>
              </div>

              {/* 면허/자격증 명칭 */}
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--z-600)' }}>면허·자격증 명칭</span>
                <input
                  type="text"
                  value={newLicenseName}
                  onChange={(e) => setNewLicenseName(e.target.value)}
                  placeholder="예: 간호사 면허증, 의사 면허증, 컴퓨터활용능력 1급"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 14,
                    borderRadius: 10,
                    border: '1px solid var(--m-border)',
                    background: 'var(--m-bg)',
                    color: 'var(--z-900)',
                    marginTop: 4,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* 만료일자 */}
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--z-600)' }}>만료일자</span>
                <input
                  type="text"
                  value={newExpiryDate}
                  onChange={(e) => setNewExpiryDate(e.target.value)}
                  placeholder="YYYY.MM.DD"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 14,
                    borderRadius: 10,
                    border: '1px solid var(--m-border)',
                    background: 'var(--m-bg)',
                    color: 'var(--z-900)',
                    marginTop: 4,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* 버튼 그룹 */}
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <MBtn
                  block
                  onClick={() => setShowCreateModal(false)}
                  style={{ background: 'var(--z-100)', color: 'var(--z-700)' }}
                >
                  취소
                </MBtn>
                <MBtn variant="primary" block onClick={() => void handleCreateLicense()}>
                  등록 완료
                </MBtn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
