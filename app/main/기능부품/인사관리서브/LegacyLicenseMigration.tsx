'use client';
/**
 * LegacyLicenseMigration.tsx
 *
 * staff_members.license 잔존 데이터를 staff_licenses로 마이그레이션하는 UI 섹션.
 * 자격안전센터(면허자격증관리) 내에서만 사용한다.
 */

import { useState } from 'react';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

const LegacyLicenseSchema = z.object({
  id: z.string().or(z.number()),
  license: z.string().nullable().optional(),
  license_no: z.string().nullable().optional(),
  license_date: z.string().nullable().optional(),
  license_note: z.string().nullable().optional(),
});

interface Props {
  staffs: Record<string, unknown>[];
  canEdit: boolean;
  onMigrated: () => void;
}

export default function LegacyLicenseMigration({ staffs, canEdit, onMigrated }: Props) {
  const [migrateState, setMigrateState] = useState<Record<string, 'idle' | 'loading' | 'done'>>({});

  // staff_members.license 가 있는 직원만 필터
  const staffsWithLegacy = staffs.filter((s) => {
    const parsed = LegacyLicenseSchema.safeParse(s);
    return parsed.success && typeof parsed.data.license === 'string' && parsed.data.license.trim();
  });

  if (staffsWithLegacy.length === 0) return null;

  const handleMigrate = async (s: Record<string, unknown>) => {
    const staffId = String(s.id);
    setMigrateState((prev) => ({ ...prev, [staffId]: 'loading' }));

    const parsed = LegacyLicenseSchema.safeParse(s);
    if (!parsed.success || !parsed.data.license?.trim()) {
      setMigrateState((prev) => ({ ...prev, [staffId]: 'idle' }));
      return;
    }
    const { license, license_no, license_date, license_note } = parsed.data;

    const { data: existingRows } = await supabase
      .from('staff_licenses')
      .select('id')
      .eq('staff_id', staffId)
      .limit(1);

    const isPrimary = !existingRows || existingRows.length === 0;

    const { error } = await supabase.from('staff_licenses').insert([{
      staff_id: staffId,
      license_name: license ?? '면허/자격',
      license_number: license_no ?? null,
      issued_date: license_date ?? null,
      expiry_date: null,
      issuing_body: null,
      memo: license_note ?? null,
      license_type: '기타',
      is_primary: isPrimary,
    }]);

    if (error) {
      toast('가져오기 실패: ' + (error.message ?? ''), 'error');
      setMigrateState((prev) => ({ ...prev, [staffId]: 'idle' }));
      return;
    }

    toast(`${String(s.name)}님의 이전 면허 데이터를 가져왔습니다.`, 'success');
    setMigrateState((prev) => ({ ...prev, [staffId]: 'done' }));
    onMigrated();
  };

  return (
    <section
      className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-[var(--radius-lg)] space-y-2"
      aria-label="이전 면허 데이터 가져오기"
    >
      <h3 className="text-xs font-bold text-amber-700">
        이전 데이터(구 면허 필드) — 자격안전센터로 가져오기
      </h3>
      <p className="text-[10px] text-amber-600">
        아래 직원의 기존 면허 정보(staff_members.license)가 아직 자격안전센터에 등록되지 않았습니다.
        가져오기 버튼을 클릭하면 staff_licenses에 저장됩니다.
      </p>
      <div className="space-y-1.5">
        {staffsWithLegacy.map((s) => {
          const sid = String(s.id);
          const state = migrateState[sid] ?? 'idle';
          const parsed = LegacyLicenseSchema.safeParse(s);
          const licenseText = parsed.success ? `${parsed.data.license ?? ''}${parsed.data.license_no ? ` · ${parsed.data.license_no}` : ''}` : '';
          return (
            <div
              key={sid}
              className="flex items-center justify-between gap-2 bg-[var(--card)] px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)]"
            >
              <div>
                <span className="text-xs font-bold text-[var(--foreground)]">{String(s.name)}</span>
                <span className="ml-2 text-[10px] text-[var(--toss-gray-3)]">{licenseText}</span>
              </div>
              {state === 'done' ? (
                <span className="text-[10px] text-green-600 font-bold" aria-live="polite">
                  마이그레이션 완료
                </span>
              ) : canEdit ? (
                <button
                  onClick={() => handleMigrate(s)}
                  disabled={state === 'loading'}
                  className="px-2 py-1 text-[10px] bg-amber-500/10 text-amber-700 font-bold rounded-md hover:bg-amber-500/20 disabled:opacity-50"
                  aria-label={`${String(s.name)}의 면허 데이터 자격안전센터로 가져오기`}
                >
                  {state === 'loading' ? '처리 중...' : '자격안전센터로 가져오기'}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
