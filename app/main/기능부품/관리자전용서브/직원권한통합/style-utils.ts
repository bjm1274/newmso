import type { FeaturePermissionItem } from '@/lib/feature-permissions';

export function getToneClasses(tone: FeaturePermissionItem['tone'], active: boolean) {
  if (!active) {
    return 'bg-[var(--card)] border-[var(--border)] hover:border-[var(--border)]';
  }

  if (tone === 'critical') {
    return 'bg-danger/10 border-danger/20';
  }

  if (tone === 'warning') {
    return 'bg-warning/10 border-warning/20';
  }

  return 'bg-[var(--accent)]/10 border-[var(--accent)]/20';
}

export function getToggleClasses(tone: FeaturePermissionItem['tone'], active: boolean) {
  if (!active) {
    return 'bg-[var(--tab-bg)] hover:bg-[var(--muted)]';
  }

  if (tone === 'critical') {
    return 'bg-danger ring-danger/20';
  }

  if (tone === 'warning') {
    return 'bg-warning ring-warning/20';
  }

  return 'bg-[var(--accent)] ring-[var(--accent)]/20';
}

export function compareKoreanLabels(a: string, b: string) {
  return a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' });
}

export function getStaffCompanyLabel(staff: any) {
  return String(staff?.company || '미지정 회사').trim() || '미지정 회사';
}

export function getStaffTeamLabel(staff: any) {
  return String(staff?.department || '미지정 부서').trim() || '미지정 부서';
}

export function sortStaffRows(a: any, b: any) {
  const companyDiff = compareKoreanLabels(getStaffCompanyLabel(a), getStaffCompanyLabel(b));
  if (companyDiff !== 0) return companyDiff;

  const departmentDiff = compareKoreanLabels(getStaffTeamLabel(a), getStaffTeamLabel(b));
  if (departmentDiff !== 0) return departmentDiff;

  const employeeNoDiff = compareKoreanLabels(String(a?.employee_no || ''), String(b?.employee_no || ''));
  if (employeeNoDiff !== 0) return employeeNoDiff;

  return compareKoreanLabels(String(a?.name || ''), String(b?.name || ''));
}
