import { NextRequest, NextResponse } from 'next/server';
import { syncAnnualLeaveUsedForStaff } from '@/lib/annual-leave-ledger';
import { recalculateLeaveBalance } from '@/lib/annual-leave-balance';
import { readSessionFromRequest } from '@/lib/server-session';
import { getD1Binding } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    // 로그인 여부만 검사 (회사 간 접근은 MSO 설계상 허용).
    const session = await readSessionFromRequest(req);
    if (!session?.user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { staffId } = await req.json();
    if (!staffId) {
      return NextResponse.json({ ok: false, error: 'staffId가 필요합니다.' }, { status: 400 });
    }

    // 백정민(38bd18fa...) 직원의 입사일 및 월차/연차 자동 발생 날짜 소급 정정 임시 패치
    if (staffId === '38bd18fa-36ce-46d5-bb51-b9c55ac166e7') {
      const d1 = await getD1Binding();
      if (d1) {
        // 1. staff_members 갱신 (joined_at인 2023-11-01에 맞게 hire_date/join_date 정정)
        await d1.prepare(`
          UPDATE staff_members 
          SET hire_date = '2023-11-01', 
              join_date = '2023-11-01',
              annual_leave_total = 15,
              annual_leave_used = 5
          WHERE id = ?
        `).bind(staffId).run();

        // 2. 2026년 오발생되었던 월차 삭제
        await d1.prepare(`
          DELETE FROM leave_accruals 
          WHERE staff_id = ? AND kind = 'monthly' AND period_key LIKE '2026-%'
        `).bind(staffId).run();

        // 3. 만 1년차 및 만 2년차 연차 자동 부여 내역 날짜 정정
        const companyId = '81eecc3a-2aa0-424a-a70b-6697e83e0d1a';
        
        await d1.prepare(`
          INSERT OR IGNORE INTO leave_accruals (id, staff_id, company_id, kind, period_key, days, year, source_date, note, created_at)
          VALUES ('e72d1948-d120-4b96-9609-d633423f5b01', ?, ?, 'annual', 'annual:1', 15, 2026, '2024-11-01', '만 1년차 연차 15일 자동부여', '2024-11-01T00:00:00.000Z')
        `).bind(staffId, companyId).run();

        await d1.prepare(`
          INSERT OR IGNORE INTO leave_accruals (id, staff_id, company_id, kind, period_key, days, year, source_date, note, created_at)
          VALUES ('3fa1ff2d-7cbd-4ad1-924d-66d0ca22837e', ?, ?, 'annual', 'annual:2', 15, 2026, '2025-11-01', '만 2년차 연차 15일 자동부여', '2025-11-01T00:00:00.000Z')
        `).bind(staffId, companyId).run();

        await d1.prepare(`
          UPDATE leave_accruals 
          SET source_date = '2024-11-01', 
              created_at = '2024-11-01T00:00:00.000Z'
          WHERE staff_id = ? AND period_key = 'annual:1'
        `).bind(staffId).run();

        await d1.prepare(`
          UPDATE leave_accruals 
          SET source_date = '2025-11-01', 
              created_at = '2025-11-01T00:00:00.000Z'
          WHERE staff_id = ? AND period_key = 'annual:2'
        `).bind(staffId).run();

        // 4. 실제 1년 미만 시기(2023-11-01 ~ 2024-10-31) 동안의 만근 월차 11건 생성
        const monthlyData = [
          { period: '2023-11', date: '2023-12-01', note: '1개월차 만근 +1일' },
          { period: '2023-12', date: '2024-01-01', note: '2개월차 만근 +1일' },
          { period: '2024-01', date: '2024-02-01', note: '3개월차 만근 +1일' },
          { period: '2024-02', date: '2024-03-01', note: '4개월차 만근 +1일' },
          { period: '2024-03', date: '2024-04-01', note: '5개월차 만근 +1일' },
          { period: '2024-04', date: '2024-05-01', note: '6개월차 만근 +1일' },
          { period: '2024-05', date: '2024-06-01', note: '7개월차 만근 +1일' },
          { period: '2024-06', date: '2024-07-01', note: '8개월차 만근 +1일' },
          { period: '2024-07', date: '2024-08-01', note: '9개월차 만근 +1일' },
          { period: '2024-08', date: '2024-09-01', note: '10개월차 만근 +1일' },
          { period: '2024-09', date: '2024-10-01', note: '11개월차 만근 +1일' }
        ];

        for (let i = 0; i < monthlyData.length; i++) {
          const m = monthlyData[i];
          const uuid = `b01b00${String(i+1).padStart(2, '0')}-c102-4304-8505-a606707a0001`;
          await d1.prepare(`
            INSERT OR IGNORE INTO leave_accruals (id, staff_id, company_id, kind, period_key, days, year, source_date, note, created_at)
            VALUES (?, ?, ?, 'monthly', ?, 1, 2026, ?, ?, ?)
          `).bind(uuid, staffId, companyId, m.period, m.date, m.note, `${m.date}T09:00:00.000Z`).run();
        }
      }
    }

    // 서버 측에서 D1 바인딩이 보장된 환경이므로 안전하게 동기화 및 잔액 계산 실행
    await syncAnnualLeaveUsedForStaff(staffId);
    await recalculateLeaveBalance(staffId);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[annual-leave/sync] 실패:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
