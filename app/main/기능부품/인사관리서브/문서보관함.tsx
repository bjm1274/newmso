'use client';

/**
 * 문서 보관함 — 보관 문서 + 발급 증명서 통합 열람
 *
 * - 시스템 문서(근로계약서·연차촉진·증명서) / 전자결재 양식별 / 수동 보관 분류
 * - 우측은 선택 문서 원본 열람만
 * - 발급 증명서는 certificate_issuances → 「증명서」 폴더
 */

import { useActionDialog } from '@/app/components/useActionDialog';
import { toast } from '@/lib/toast';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';
import { canAccessHrSection } from '@/lib/access-control';
import {
  extractApprovalDocNumberFromDocument,
  mapApprovalToDocumentRepositoryEntry,
} from '@/lib/approval-document-shared';
import {
  DOC_REPO_GROUP_META,
  buildFolderCategories,
  extractRelatedStaffName,
  getDocCategoryMeta,
  normalizeDocCategory,
  type DocRepoCategoryGroup,
} from '@/lib/document-repository-categories';
import { isEncryptedContract } from '@/lib/contract-crypto';
import {
  buildIssuedCertificatePrintHtml,
  downloadHtmlFile,
  openIssuedCertificatePrintView,
  type IssuedCertificate,
  type IssuedCertificateContext,
} from '../마이페이지/certificate-print-utils';
import { getProfilePhotoUrl } from '@/lib/profile-photo';
import { STAFF_DOC_CONTEXT_SELECT } from '@/lib/staff-query-columns';
import ArchivedDocumentView from './ArchivedDocumentView';
import LaborContractViewer from './LaborContractViewer';
import { openDocumentPrintView } from './document-print-utils';

type UserRecord = Record<string, unknown> | null | undefined;

type StaffRow = {
  id: string;
  name?: string | null;
  company?: string | null;
  department?: string | null;
  position?: string | null;
  joined_at?: string | null;
  join_date?: string | null;
  employee_no?: string | null;
  role?: string | null;
  profile_photo_path?: string | null;
  profile_photo_updated_at?: string | null;
  avatar_url?: string | null;
  photo_url?: string | null;
};

type IssuedCertRow = IssuedCertificate & {
  staff_id?: string | null;
  staff_members?: { name?: string | null; company?: string | null } | null;
};

function hasApprovalArchiveSignature(doc: Record<string, unknown> | null | undefined): boolean {
  if (!doc) return false;
  const docNumber = String(
    (doc as Record<string, unknown>).doc_number ||
      ((doc as Record<string, unknown>).meta_data as Record<string, unknown> | null | undefined)
        ?.doc_number ||
      '',
  );
  if (/^APRV-/i.test(docNumber)) return true;
  if (/^[A-Z][A-Z0-9]+-[A-Z]+-\d{8}-\d+$/i.test(docNumber)) return true;
  const content = String(doc.content || '');
  if (/^문서번호:\s*APRV-/im.test(content)) return true;
  if (/^문서번호:\s*[A-Z][A-Z0-9]+-[A-Z]+-\d{8}-\d+/im.test(content)) return true;
  if (/^기안자:/im.test(content) && /^기안일시:/im.test(content)) return true;
  return false;
}

function formatShortDate(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
}

function withNormalizedCategory(doc: Record<string, unknown>): Record<string, unknown> {
  const category = normalizeDocCategory(String(doc.category || ''), String(doc.title || ''), {
    content: String(doc.content || ''),
  });
  return { ...doc, category, _raw_category: doc.category };
}

/** certificate_issuances 행 → 목록 공통 형태 */
function mapCertToListDoc(cert: IssuedCertRow): Record<string, unknown> {
  const staffName = String(cert.staff_members?.name || '').trim();
  const certType = String(cert.cert_type || '증명서');
  const title = staffName ? `${certType} - ${staffName}` : certType;
  return {
    id: `cert-${cert.id}`,
    title,
    category: '증명서',
    content: null,
    file_url: null,
    version: 1,
    company_name: String(cert.staff_members?.company || '전체'),
    created_by: cert.staff_id || null,
    created_at: cert.issued_at || null,
    updated_at: cert.issued_at || null,
    source_type: 'certificate',
    read_only: true,
    cert_payload: cert,
  };
}

export default function DocumentRepository({
  user,
  selectedCo,
  linkedTarget,
  canManageDocuments = false,
  title = '문서 보관함',
}: {
  user: UserRecord;
  selectedCo: string;
  linkedTarget?: { id?: string; name?: string };
  canManageDocuments?: boolean;
  title?: string;
}) {
  const { dialog, openConfirm } = useActionDialog();
  const [docs, setDocs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [viewContent, setViewContent] = useState('');
  const [staffFilterName, setStaffFilterName] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<'전체' | DocRepoCategoryGroup>('전체');
  const [categoryFilter, setCategoryFilter] = useState<string>('전체');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [repairing, setRepairing] = useState(false);
  const [staffMap, setStaffMap] = useState<Record<string, StaffRow>>({});
  const [sealMap, setSealMap] = useState<Record<string, string>>({});
  const [logoMap, setLogoMap] = useState<Record<string, string>>({});

  const canViewAllCerts = canAccessHrSection(user, 'hr_증명서');
  const ownStaffId = user?.id != null ? String(user.id) : '';

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const repositoryQuery = db
        .from('document_repository')
        .select('*')
        .order('updated_at', { ascending: false });
      const approvalsQuery = db
        .from('approvals')
        .select('*')
        .order('created_at', { ascending: false });

      // 증명서: 인사 권한 또는 본인분만
      let certQuery = db
        .from('certificate_issuances')
        .select('*')
        .order('issued_at', { ascending: false })
        .limit(200);
      if (!canViewAllCerts && ownStaffId) {
        certQuery = certQuery.eq('staff_id', ownStaffId);
      }

      const shouldFetchCerts = canViewAllCerts || Boolean(ownStaffId);

      const [repoRes, approvalRes, certRes, staffRes, sealRes, companyRes] = await Promise.all([
        repositoryQuery,
        approvalsQuery,
        shouldFetchCerts
          ? certQuery
          : Promise.resolve({ data: [] as IssuedCertRow[], error: null }),
        // 예전에는 duty/job_duty/responsibility/rank/grade/level/profile_photo_url 처럼
        // D1 에 없는 컬럼 7개를 함께 셀렉트했다. 쿼리가 에러로 죽지는 않았지만(SQLite 가
        // 큰따옴표 토큰을 문자열 리터럴로 봐줌) 반환 키가 `"duty"` 형태로 망가져 들어와
        // 어디서도 읽히지 않았고, 그래서 아무도 드리프트를 눈치채지 못했다.
        db.from('staff_members').select(STAFF_DOC_CONTEXT_SELECT),
        db.from('contract_templates').select('company_name, seal_url'),
        db.from('companies').select('name, logo_url'),
      ]);

      const repositoryDocs = (repoRes.data || []) as Record<string, unknown>[];
      const approvalDocs = (approvalRes.data || []) as Record<string, unknown>[];

      const existingDocNumbers = new Set(
        repositoryDocs
          .map((doc) => extractApprovalDocNumberFromDocument(doc))
          .filter(Boolean),
      );

      const approvalArchiveDocs = approvalDocs
        .map((approval) => mapApprovalToDocumentRepositoryEntry(approval))
        .filter((approvalDoc) => {
          const approvalDocNumber = extractApprovalDocNumberFromDocument(approvalDoc);
          if (approvalDocNumber && existingDocNumbers.has(approvalDocNumber)) return false;
          return !repositoryDocs.some(
            (doc) =>
              String(doc.title || '').trim() === String(approvalDoc.title || '').trim() &&
              String(doc.created_by || '').trim() ===
                String(approvalDoc.created_by || '').trim() &&
              String(doc.company_name || '').trim() ===
                String(approvalDoc.company_name || '').trim(),
          );
        });

      // 직원 컨텍스트 조회 실패는 화면을 죽이지 않지만(문서 목록은 살아 있다) 조용히
      // 사라지면 부서/직위/사진이 통째로 비는 원인을 추적할 수 없다 → 최소한 로그는 남긴다.
      if (staffRes.error) {
        console.warn('[문서보관함] staff_members 조회 실패 — 직원 컨텍스트 누락', staffRes.error);
      }
      const staffList = (staffRes.data || []) as StaffRow[];
      const newStaffMap: Record<string, StaffRow> = {};
      for (const s of staffList) {
        if (s.id) newStaffMap[s.id] = s;
      }
      setStaffMap(newStaffMap);

      const newSealMap: Record<string, string> = {};
      for (const row of sealRes.data || []) {
        if (row.company_name && row.seal_url) {
          newSealMap[String(row.company_name)] = String(row.seal_url);
        }
      }
      setSealMap(newSealMap);

      const newLogoMap: Record<string, string> = {};
      for (const row of companyRes.data || []) {
        const name = String((row as { name?: string })?.name || '').trim();
        const logo = String((row as { logo_url?: string })?.logo_url || '').trim();
        if (name && logo) {
          newLogoMap[name] = logo;
        }
      }
      setLogoMap(newLogoMap);

      const rawCerts = (certRes.data || []) as IssuedCertRow[];
      const certListDocs = rawCerts.map((cert) => {
        const staffId = String(cert.staff_id || '');
        const matched = newStaffMap[staffId];
        const withStaff: IssuedCertRow = {
          ...cert,
          staff_members: matched
            ? { name: matched.name ?? null, company: matched.company ?? null }
            : cert.staff_members || null,
        };
        return mapCertToListDoc(withStaff);
      });

      const mergedDocs = [
        ...certListDocs,
        ...approvalArchiveDocs,
        ...repositoryDocs,
      ]
        .map(withNormalizedCategory)
        .sort((a, b) =>
          String(b.updated_at || b.created_at || '').localeCompare(
            String(a.updated_at || a.created_at || ''),
          ),
        );

      setDocs(mergedDocs);
    } catch (e) {
      console.error('[DocumentRepository] fetch failed', e);
      toast('문서 목록을 불러오지 못했습니다.', 'error');
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [canViewAllCerts, ownStaffId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll, selectedCo]);

  useEffect(() => {
    if (linkedTarget?.name) setStaffFilterName(linkedTarget.name);
  }, [linkedTarget?.name]);

  const scopedDocs = useMemo(() => {
    return docs.filter((d) => {
      const docCompany = String(d.company_name || '전체').trim() || '전체';
      const scopeCompany = String(selectedCo || '전체').trim() || '전체';
      const matchCompany =
        scopeCompany === '전체' || docCompany === scopeCompany || docCompany === '전체';
      const matchStaff = staffFilterName
        ? `${d.title || ''} ${d.content || ''} ${extractRelatedStaffName(String(d.title || ''))}`.includes(
            staffFilterName,
          )
        : true;
      return matchCompany && matchStaff;
    });
  }, [docs, selectedCo, staffFilterName]);

  const presentCategoryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const d of scopedDocs) ids.add(String(d.category || '기타'));
    return ids;
  }, [scopedDocs]);

  const allFolderCategories = useMemo(
    () => buildFolderCategories(presentCategoryIds),
    [presentCategoryIds],
  );

  const categoryCounts = useMemo(() => {
    const acc: Record<string, number> = { 전체: scopedDocs.length };
    for (const d of scopedDocs) {
      const cat = String(d.category || '기타');
      acc[cat] = (acc[cat] || 0) + 1;
    }
    return acc;
  }, [scopedDocs]);

  const groupCounts = useMemo(() => {
    const acc: Record<string, number> = {
      전체: scopedDocs.length,
      system: 0,
      approval: 0,
      manual: 0,
    };
    for (const d of scopedDocs) {
      const meta = getDocCategoryMeta(String(d.category || '기타'));
      acc[meta.group] = (acc[meta.group] || 0) + 1;
    }
    return acc;
  }, [scopedDocs]);

  const visibleDocs = useMemo(() => {
    return scopedDocs.filter((d) => {
      const cat = String(d.category || '기타');
      const meta = getDocCategoryMeta(cat);
      if (groupFilter !== '전체' && meta.group !== groupFilter) return false;
      if (categoryFilter !== '전체' && cat !== categoryFilter) return false;
      return true;
    });
  }, [scopedDocs, groupFilter, categoryFilter]);

  const categoryChips = useMemo(() => {
    const pool =
      groupFilter === '전체'
        ? allFolderCategories
        : allFolderCategories.filter((c) => c.group === groupFilter);
    // 건수 있는 분류 우선, 0건은 시스템/수동만 상시 노출
    return pool.filter((c) => (categoryCounts[c.id] || 0) > 0 || c.group === 'system' || c.group === 'manual');
  }, [allFolderCategories, groupFilter, categoryCounts]);

  /** 대분류 → 소분류 폴더 트리 */
  const sectionTree = useMemo(() => {
    const groupOrder: DocRepoCategoryGroup[] =
      groupFilter === '전체' ? ['system', 'approval', 'manual'] : [groupFilter];

    return groupOrder.map((g) => {
      const cats =
        categoryFilter === '전체'
          ? allFolderCategories.filter((c) => c.group === g)
          : allFolderCategories.filter((c) => c.group === g && c.id === categoryFilter);

      const folders = cats
        .map((meta) => ({
          meta,
          docs: visibleDocs.filter((d) => String(d.category || '기타') === meta.id),
        }))
        .filter((f) => f.docs.length > 0 || categoryFilter === f.meta.id);

      return {
        group: g,
        groupMeta: DOC_REPO_GROUP_META[g],
        folders,
        total: folders.reduce((n, f) => n + f.docs.length, 0),
      };
    });
  }, [allFolderCategories, groupFilter, categoryFilter, visibleDocs]);

  const isCertificate = selected?.source_type === 'certificate';
  const isReadOnlySelected = Boolean(
    !selected ||
      selected.source_type === 'approval' ||
      selected.source_type === 'certificate' ||
      selected.read_only ||
      hasApprovalArchiveSignature(selected) ||
      selected.category === '연차촉진' ||
      selected.category === '근로계약서' ||
      selected.category === '증명서' ||
      String(selected.title || '').includes('연차유급휴가 사용촉진 통보서'),
  );

  const selectedMeta = selected
    ? getDocCategoryMeta(
        normalizeDocCategory(String(selected.category || ''), String(selected.title || ''), {
          content: String(selected.content || ''),
        }),
      )
    : null;

  const resolveCertContext = useCallback(
    (cert: IssuedCertRow): IssuedCertificateContext => {
      const staffId = String(cert.staff_id || '');
      const staff = staffMap[staffId] || null;
      const companyName = String(
        staff?.company || cert.staff_members?.company || selectedCo || '',
      ).trim();
      const sealUrl = sealMap[companyName] || '';
      const companyLogoUrl = logoMap[companyName] || '';
      // duty/job_duty/responsibility 및 rank/grade/level 은 D1 에 없는 컬럼이라
      // 폴백 체인이 언제나 마지막 항목까지 흘렀다. 실제 동작(role 사용 / rank 없음)만 남긴다.
      const duty = staff?.role || null;
      const rank: string | null = null;
      return {
        companyLabel: companyName || 'SY INC.',
        staffName: staff?.name || cert.staff_members?.name || null,
        position: staff?.position || null,
        department: staff?.department || null,
        joinedAt: staff?.joined_at || staff?.join_date || null,
        sealImageUrl: sealUrl || null,
        companyLogoUrl: companyLogoUrl || null,
        employeeNo: staff?.employee_no || staff?.id || null,
        duty,
        rank,
        profilePhotoUrl: staff ? getProfilePhotoUrl(staff) || null : null,
      };
    },
    [staffMap, sealMap, logoMap, selectedCo],
  );

  const handleSelect = async (d: Record<string, unknown>) => {
    setSelected(d);
    if (d.source_type === 'certificate') {
      setViewContent('');
      return;
    }
    try {
      const { decryptContract } = await import('@/lib/contract-crypto');
      const decrypted = await decryptContract(String(d.content || ''));
      setViewContent(decrypted);
    } catch {
      setViewContent(String(d.content || ''));
    }
  };

  const handleDelete = async (doc: Record<string, unknown>) => {
    if (!doc?.id || String(doc.id).startsWith('cert-')) return;
    if (!canManageDocuments) {
      toast('문서 삭제는 관리자 전용입니다.', 'warning');
      return;
    }
    if (doc.source_type === 'approval' || doc.source_type === 'certificate' || doc.read_only) {
      toast('원본 보관 문서는 삭제할 수 없습니다.', 'warning');
      return;
    }
    if (normalizeDocCategory(String(doc.category || ''), String(doc.title || '')) === '근로계약서') {
      toast('근로계약서 원본은 법적 보관을 위해 삭제할 수 없습니다.', 'warning');
      return;
    }
    const confirmed = await openConfirm({
      title: '문서 완전 삭제',
      description: '해당 문서를 완전히 삭제합니다.\n삭제 후에는 되돌릴 수 없습니다.',
      confirmText: '삭제',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const { error } = await db.from('document_repository').delete().eq('id', doc.id);
      if (error) throw error;
      if (selected?.id === doc.id) {
        setSelected(null);
        setViewContent('');
      }
      await fetchAll();
      toast('문서가 삭제되었습니다.', 'success');
    } catch {
      toast('문서 삭제 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleOpenPdf = async () => {
    if (!selected) return;
    if (selected.source_type === 'certificate') {
      const cert = selected.cert_payload as IssuedCertRow | undefined;
      if (!cert) return;
      try {
        openIssuedCertificatePrintView(cert, resolveCertContext(cert));
      } catch (err) {
        console.error(err);
        toast('인쇄 창을 여는 중 오류가 발생했습니다.', 'error');
      }
      return;
    }
    if (viewContent || selected.content) {
      try {
        openDocumentPrintView({ ...selected, content: viewContent || selected.content }, selectedCo);
      } catch (error) {
        console.error('문서 열기 실패:', error);
        toast('문서를 여는 중 오류가 발생했습니다.', 'error');
      }
      return;
    }
    if (selected.file_url) {
      window.open(selected.file_url as string, '_blank');
      return;
    }
    toast('열 수 있는 문서 내용이나 파일이 없습니다.', 'warning');
  };

  const handleDownloadCert = () => {
    if (!selected || selected.source_type !== 'certificate') return;
    const cert = selected.cert_payload as IssuedCertRow | undefined;
    if (!cert) return;
    try {
      const html = buildIssuedCertificatePrintHtml(cert, resolveCertContext(cert));
      downloadHtmlFile(html, `${cert.cert_type}_${cert.serial_no || ''}`);
    } catch (err) {
      console.error(err);
      toast('다운로드 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleRepairCategories = async () => {
    if (!canManageDocuments) return;
    setRepairing(true);
    try {
      const { data: fullRows, error: fullErr } = await db
        .from('document_repository')
        .select('id, title, category, content');
      if (fullErr) throw fullErr;
      let fixed = 0;
      for (const row of fullRows || []) {
        const next = normalizeDocCategory(String(row.category || ''), String(row.title || ''), {
          content: String(row.content || ''),
        });
        if (next !== String(row.category || '').trim()) {
          const { error: upErr } = await db
            .from('document_repository')
            .update({ category: next, updated_at: new Date().toISOString() })
            .eq('id', row.id);
          if (!upErr) fixed += 1;
        }
      }
      await fetchAll();
      toast(
        fixed > 0
          ? `분류 ${fixed}건을 시스템/전자결재 양식별 폴더로 정리했습니다.`
          : '이미 모든 문서 분류가 정상입니다.',
        'success',
      );
    } catch (e) {
      console.error('[DocumentRepository] category repair failed', e);
      toast('분류 정리 중 오류가 발생했습니다.', 'error');
    } finally {
      setRepairing(false);
    }
  };

  const toggleFolder = (id: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleGroup = (id: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col app-page p-3 md:p-4"
      data-testid="document-repository"
    >
      {dialog}

      {/* 헤더 */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-[var(--foreground)]">{title}</h2>
          <p className="mt-0.5 text-[11px] text-[var(--toss-gray-4)]">
            시스템 문서(계약·연차촉진·증명서)와 전자결재 양식별 문서를 구분해 보관합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={staffFilterName || ''}
            onChange={(e) => setStaffFilterName(e.target.value || null)}
            placeholder="직원·문서명 검색"
            className="min-w-[140px] rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--foreground)]"
          />
          {canManageDocuments && (
            <button
              type="button"
              onClick={() => void handleRepairCategories()}
              disabled={repairing}
              className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)] disabled:opacity-50"
              title="과거 오분류를 정식 폴더로 맞춤"
            >
              {repairing ? '정리 중…' : '분류 정리'}
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {/* 대분류: 시스템 / 전자결재 / 수동 */}
        <div role="group" aria-label="문서 대분류" className="flex flex-wrap gap-1.5">
          <CategoryChip
            label="전체"
            count={groupCounts.전체 || 0}
            active={groupFilter === '전체' && categoryFilter === '전체'}
            onClick={() => {
              setGroupFilter('전체');
              setCategoryFilter('전체');
            }}
          />
          {(
            Object.keys(DOC_REPO_GROUP_META) as DocRepoCategoryGroup[]
          ).map((g) => (
            <CategoryChip
              key={g}
              label={DOC_REPO_GROUP_META[g].label}
              count={groupCounts[g] || 0}
              active={groupFilter === g}
              tone={g === 'system' ? 'warn' : 'default'}
              onClick={() => {
                setGroupFilter(g);
                setCategoryFilter('전체');
              }}
            />
          ))}
        </div>

        {/* 소분류: 양식·시스템 세부 */}
        <div role="group" aria-label="문서 세부 분류" className="flex flex-wrap gap-1.5">
          <CategoryChip
            label="세부 전체"
            count={
              groupFilter === '전체'
                ? groupCounts.전체 || 0
                : groupCounts[groupFilter] || 0
            }
            active={categoryFilter === '전체'}
            onClick={() => setCategoryFilter('전체')}
          />
          {categoryChips.map((c) => (
            <CategoryChip
              key={c.id}
              label={c.label}
              count={categoryCounts[c.id] || 0}
              active={categoryFilter === c.id}
              tone={c.security === '대외비' ? 'warn' : 'default'}
              onClick={() => {
                setCategoryFilter(c.id);
                setGroupFilter(c.group);
              }}
            />
          ))}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12">
          {/* 목록 — 대분류 섹션 + 양식 폴더 */}
          <section className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] lg:col-span-4">
            <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5">
              <span className="text-[12px] font-black text-[var(--foreground)]">
                문서 목록
                <span className="ml-1.5 font-bold tabular-nums text-[var(--toss-gray-3)]">
                  {visibleDocs.length}
                </span>
              </span>
              {staffFilterName && (
                <button
                  type="button"
                  onClick={() => setStaffFilterName(null)}
                  className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]"
                >
                  {staffFilterName} ✕
                </button>
              )}
            </header>

            {loading ? (
              <div className="p-6 text-center text-[12px] text-[var(--toss-gray-3)]">로딩 중…</div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                {sectionTree.map((section) => {
                  if (section.folders.length === 0 && categoryFilter === '전체') {
                    // 해당 대분류에 문서 없으면 접힌 헤더만 (0건 표시)
                  }
                  const groupCollapsed = collapsedGroups[section.group] ?? false;
                  return (
                    <div
                      key={section.group}
                      className="border-b border-[var(--border)]"
                    >
                      <button
                        type="button"
                        onClick={() => toggleGroup(section.group)}
                        className="flex w-full items-center gap-2 bg-[var(--accent)]/5 px-3 py-2.5 text-left hover:bg-[var(--accent)]/10"
                        aria-expanded={!groupCollapsed}
                      >
                        <span className="text-[10px] text-[var(--accent)]">
                          {groupCollapsed ? '▸' : '▾'}
                        </span>
                        <span className="flex-1 text-[12px] font-black text-[var(--accent)]">
                          {section.groupMeta.label}
                        </span>
                        <span className="tabular-nums text-[10px] font-bold text-[var(--toss-gray-3)]">
                          {section.total}
                        </span>
                      </button>
                      {!groupCollapsed &&
                        (section.folders.length === 0 ? (
                          <p className="px-4 py-2 text-[11px] text-[var(--toss-gray-3)]">
                            문서 없음
                          </p>
                        ) : (
                          section.folders.map(({ meta, docs: folderDocs }) => {
                            const collapsed = collapsedFolders[meta.id] ?? false;
                            return (
                              <div key={meta.id}>
                                <button
                                  type="button"
                                  onClick={() => toggleFolder(meta.id)}
                                  className="flex w-full items-center gap-2 bg-[var(--page-bg)]/80 px-3 py-2 pl-5 text-left hover:bg-[var(--muted)]/50"
                                  aria-expanded={!collapsed}
                                >
                                  <span className="text-[10px] text-[var(--toss-gray-3)]">
                                    {collapsed ? '▸' : '▾'}
                                  </span>
                                  <span className="flex-1 text-[11px] font-black text-[var(--toss-gray-4)]">
                                    {meta.label}
                                  </span>
                                  <span className="tabular-nums text-[10px] font-bold text-[var(--toss-gray-3)]">
                                    {folderDocs.length}
                                  </span>
                                  {meta.security === '대외비' && (
                                    <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                                      대외비
                                    </span>
                                  )}
                                </button>
                                {!collapsed &&
                                  folderDocs.map((d) => {
                                    const id = String(d.id ?? '');
                                    const isActive = selected?.id === d.id;
                                    const staffName =
                                      d.source_type === 'certificate'
                                        ? String(
                                            (d.cert_payload as IssuedCertRow | undefined)
                                              ?.staff_members?.name ||
                                              extractRelatedStaffName(String(d.title || '')),
                                          )
                                        : extractRelatedStaffName(String(d.title || ''));
                                    const hasOriginal =
                                      Boolean(d.content) ||
                                      Boolean(d.file_url) ||
                                      d.source_type === 'certificate';
                                    const encrypted = isEncryptedContract(
                                      String(d.content || ''),
                                    );
                                    return (
                                      <button
                                        key={id}
                                        type="button"
                                        onClick={() => void handleSelect(d)}
                                        className={`flex w-full flex-col gap-0.5 border-b border-[var(--muted)] px-3 py-2.5 pl-9 text-left transition-colors hover:bg-[var(--muted)]/40 ${
                                          isActive ? 'bg-[var(--toss-blue-light)]' : ''
                                        }`}
                                      >
                                        <span className="truncate text-[12px] font-bold text-[var(--foreground)]">
                                          {String(d.title ?? '')}
                                        </span>
                                        <span className="flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--toss-gray-3)]">
                                          {staffName && staffName !== '-' && (
                                            <span className="font-bold text-[var(--toss-gray-4)]">
                                              {staffName}
                                            </span>
                                          )}
                                          <span>
                                            {formatShortDate(d.updated_at || d.created_at)}
                                          </span>
                                          {hasOriginal && (
                                            <span className="rounded bg-emerald-500/10 px-1 font-bold text-emerald-700">
                                              원본
                                            </span>
                                          )}
                                          {encrypted && (
                                            <span className="rounded bg-amber-500/10 px-1 font-bold text-amber-700">
                                              암호화
                                            </span>
                                          )}
                                          {d.source_type === 'approval' && (
                                            <span className="rounded bg-blue-500/10 px-1 font-bold text-blue-700">
                                              결재
                                            </span>
                                          )}
                                          {d.source_type === 'certificate' && (
                                            <span className="rounded bg-violet-500/10 px-1 font-bold text-violet-700">
                                              발급
                                            </span>
                                          )}
                                        </span>
                                      </button>
                                    );
                                  })}
                              </div>
                            );
                          })
                        ))}
                    </div>
                  );
                })}

                {visibleDocs.length === 0 && (
                  <div className="p-6 text-center text-[12px] text-[var(--toss-gray-3)]">
                    {staffFilterName
                      ? '검색 조건에 맞는 문서가 없습니다.'
                      : '등록된 문서가 없습니다.'}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 열람 패널 — 선택 시에만 내용 표시 */}
          <section className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 md:p-4 lg:col-span-8">
            {!selected ? (
              <div className="flex min-h-[280px] flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
                <p className="text-[14px] font-bold text-[var(--toss-gray-4)]">
                  왼쪽 목록에서 문서를 선택하세요
                </p>
                <p className="max-w-sm text-[11px] leading-relaxed text-[var(--toss-gray-3)]">
                  근로계약서·연차촉진·발급 증명서 등 원본을 열람·인쇄할 수 있습니다. 새 문서 작성은
                  이 화면이 아니라 각 업무 메뉴에서 진행됩니다.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-[15px] font-black text-[var(--foreground)]">
                      {String(selected.title || '문서 열람')}
                    </h3>
                    {selectedMeta && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 font-bold text-[var(--toss-gray-4)]">
                          {selectedMeta.label}
                        </span>
                        <span className="text-[var(--toss-gray-3)]">
                          보관 {selectedMeta.retention}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 font-bold ${
                            selectedMeta.security === '대외비'
                              ? 'bg-amber-500/15 text-amber-700'
                              : 'bg-emerald-500/15 text-emerald-700'
                          }`}
                        >
                          {selectedMeta.security}
                        </span>
                        {isEncryptedContract(String(selected.content || '')) && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-bold text-amber-700">
                            AES 암호화
                          </span>
                        )}
                        {isCertificate && (
                          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 font-bold text-violet-700">
                            발급 완료
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleOpenPdf()}
                      className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--accent)] hover:bg-[var(--toss-blue-light)]"
                    >
                      {isCertificate ? '인쇄' : '열기/인쇄'}
                    </button>
                    {isCertificate && (
                      <button
                        type="button"
                        onClick={handleDownloadCert}
                        className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                      >
                        다운로드
                      </button>
                    )}
                    {canManageDocuments &&
                      !isReadOnlySelected &&
                      selected.category !== '근로계약서' &&
                      selected.source_type !== 'certificate' && (
                        <button
                          type="button"
                          onClick={() => void handleDelete(selected)}
                          className="rounded-[var(--radius-md)] border border-red-100 px-3 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-500/10"
                        >
                          삭제
                        </button>
                      )}
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(null);
                        setViewContent('');
                      }}
                      className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)]"
                    >
                      닫기
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                  {isCertificate ? (
                    <CertificatePreview
                      cert={selected.cert_payload as IssuedCertRow}
                      context={resolveCertContext(selected.cert_payload as IssuedCertRow)}
                    />
                  ) : selected.category === '근로계약서' ? (
                    <LaborContractViewer
                      doc={selected}
                      content={viewContent}
                      selectedCo={selectedCo}
                    />
                  ) : (
                    <ArchivedDocumentView
                      doc={{ ...selected, content: viewContent || selected.content }}
                      companyName={selectedCo}
                    />
                  )}

                  {selected.category === '근로계약서' && (
                    <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 p-3">
                      <span aria-hidden>🔒</span>
                      <p className="text-[11px] font-bold leading-relaxed text-amber-800">
                        체결된 근로계약서 원본입니다. 서명 시점 본문이 그대로 보관되며 수정·삭제할 수
                        없습니다.
                      </p>
                    </div>
                  )}
                  {selected.category === '연차촉진' && (
                    <div className="mt-3 rounded-[var(--radius-md)] border border-blue-500/20 bg-blue-500/10 p-3">
                      <p className="text-[11px] font-bold leading-relaxed text-blue-700">
                        연차사용촉진 통보서 원본입니다. 발송 시점 내용이 그대로 보관됩니다.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
  tone = 'default',
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: 'default' | 'warn';
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-bold transition-colors ${
        active
          ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
          : tone === 'warn'
            ? 'border-amber-200 bg-amber-50/50 text-amber-800 hover:bg-amber-50'
            : 'border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
      }`}
    >
      {label}
      <span className="tabular-nums opacity-80">{count}</span>
    </button>
  );
}

function CertificatePreview({
  cert,
  context,
}: {
  cert: IssuedCertRow;
  context: IssuedCertificateContext;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)]/40 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded bg-[var(--toss-blue-light)] px-2 py-0.5 text-[11px] font-bold text-[var(--accent)]">
          발급완료
        </span>
        <span className="text-[13px] font-black text-[var(--foreground)]">{cert.cert_type}</span>
      </div>
      <dl className="grid grid-cols-1 gap-2 text-[12px] sm:grid-cols-2">
        <div>
          <dt className="text-[10px] font-bold text-[var(--toss-gray-3)]">대상 직원</dt>
          <dd className="font-bold text-[var(--foreground)]">
            {context.staffName || cert.staff_members?.name || '-'}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold text-[var(--toss-gray-3)]">발급일</dt>
          <dd className="font-bold text-[var(--foreground)]">{formatShortDate(cert.issued_at)}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold text-[var(--toss-gray-3)]">발급번호</dt>
          <dd className="font-bold text-[var(--foreground)]">{cert.serial_no || '-'}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold text-[var(--toss-gray-3)]">용도</dt>
          <dd className="font-bold text-[var(--foreground)]">{cert.purpose || '-'}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold text-[var(--toss-gray-3)]">소속</dt>
          <dd className="font-bold text-[var(--foreground)]">
            {[context.companyLabel, context.department, context.position]
              .filter(Boolean)
              .join(' · ') || '-'}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-[11px] leading-relaxed text-[var(--toss-gray-4)]">
        원본 양식은 <strong>인쇄</strong> 또는 <strong>다운로드</strong>로 확인할 수 있습니다.
      </p>
    </div>
  );
}
