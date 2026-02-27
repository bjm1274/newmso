import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  const { loginId, password } = await request.json();

  const adminName = process.env.ADMIN_NAME;
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  const masterId = process.env.MASTER_ID;
  const masterPasswordHash = process.env.MASTER_PASSWORD_HASH;

  if (!adminName || !adminPasswordHash || !masterId || !masterPasswordHash) {
    return NextResponse.json({ success: false, error: '마스터 계정 환경변수가 설정되지 않았습니다.' }, { status: 500 });
  }

  // 일반 관리자 계정
  if (loginId.trim() === adminName && await bcrypt.compare(password, adminPasswordHash)) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: msoRow } = await supabase
      .from('staff_members')
      .select('*')
      .eq('name', adminName)
      .maybeSingle();

    const user = msoRow
      ? { ...msoRow, role: 'admin', permissions: { inventory: true, hr: true, approval: true, admin: true, mso: true, hr_교대근무: true } }
      : { id: null, employee_no: '1', name: adminName, role: 'admin', department: '경영지원팀', company: 'SY INC.', company_id: null, permissions: { inventory: true, hr: true, approval: true, admin: true, mso: true, hr_교대근무: true } };

    return NextResponse.json({ success: true, user });
  }

  // 시스템 마스터 계정 (숨김)
  if (loginId.trim() === masterId && await bcrypt.compare(password, masterPasswordHash)) {
    const superAdmin = {
      id: null,
      employee_no: '0',
      name: '시스템관리자',
      role: 'admin',
      department: '경영지원팀',
      company: 'SY INC.',
      company_id: null,
      permissions: { inventory: true, hr: true, approval: true, admin: true, mso: true, hr_교대근무: true },
    };
    return NextResponse.json({ success: true, user: superAdmin });
  }

  return NextResponse.json({ success: false });
}
