'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { db, d1 } from '@/lib/db-client';
import type { StaffMember, ErpUser } from '@/types';
import { toast } from '@/lib/toast';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';
import MAvatar from '../공통/MAvatar';
import { pickAvatarTone } from './data-hooks';
import { buildStorageDownloadUrl } from '@/lib/object-storage-url';

interface AdminDocsProps {
  staffs: StaffMember[];
  company?: string;
  user: ErpUser;
}

type TabId = 'contract' | 'autogen' | 'repository' | 'certificate';

export default function 계약문서관리자({ staffs, company, user }: AdminDocsProps) {
  const [subTab, setSubTab] = useState<TabId>('contract');
  const [reloadKey, setReloadKey] = useState(0);

  // 1. 계약 현황
  const [contracts, setContracts] = useState<any[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);

  // 2. 증명서 발급 대기 목록
  const [certificates, setCertificates] = useState<any[]>([]);
  const [loadingCerts, setLoadingCerts] = useState(false);

  // 3. 문서보관함 파일 목록
  const [repoFiles, setRepoFiles] = useState<any[]>([]);
  const [loadingRepo, setLoadingRepo] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docCategory, setDocCategory] = useState('규정');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 4. 계약서 생성 상태
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [contractType, setContractType] = useState('근로계약서');
  const [salary, setSalary] = useState(3000000);
  const [workHours, setWorkHours] = useState('09:00 ~ 18:00');

  const fetchContracts = async () => {
    setLoadingContracts(true);
    try {
      const { data, error } = await db
        .from('employment_contracts')
        .select('*')
        .order('start_date', { ascending: false });
      if (error) throw error;
      setContracts(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingContracts(false);
    }
  };

  const fetchCertificates = async () => {
    setLoadingCerts(true);
    try {
      // approvals 테이블 중 증명서 관련 대기 건 조회
      const { data, error } = await db
        .from('approvals')
        .select('*')
        .ilike('form_type', '%증명서%')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCertificates(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCerts(false);
    }
  };

  const fetchRepoFiles = async () => {
    setLoadingRepo(true);
    try {
      const { data, error } = await db
        .from('document_repository')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRepoFiles(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRepo(false);
    }
  };

  useEffect(() => {
    if (subTab === 'contract') void fetchContracts();
    if (subTab === 'certificate') void fetchCertificates();
    if (subTab === 'repository') void fetchRepoFiles();
  }, [subTab, reloadKey]);

  // 증명서 승인
  const handleApproveCert = async (certId: string) => {
    try {
      const { error } = await db
        .from('approvals')
        .update({
          status: '승인',
          approved_at: new Date().toISOString() })
        .eq('id', certId);
      if (error) throw error;
      toast('증명서 발급이 승인되었습니다.', 'success');
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast('처리에 실패했습니다.', 'error');
    }
  };

  // 계약서 인쇄 생성 — 미구현: 가짜 성공 금지
  const handleGenerateContract = () => {
    if (!selectedStaffId) {
      toast('직원을 선택하세요.', 'warning');
      return;
    }
    toast('모바일 PDF 생성은 준비 중입니다. PC 계약 관리에서 인쇄해 주세요.', 'info');
  };

  // 문서보관함 파일 업로드 — R2 실업로드 후 DB 저장
  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const uploadForm = new FormData();
      uploadForm.append('file', file);
      const uploadRes = await fetch('/api/approvals/upload', {
        method: 'POST',
        body: uploadForm });
      if (!uploadRes.ok) {
        const errJson = (await uploadRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(errJson.error || '파일 업로드에 실패했습니다.');
      }
      const uploadData = (await uploadRes.json()) as { url?: string };
      const fileUrl = typeof uploadData.url === 'string' ? uploadData.url : '';
      if (!fileUrl) throw new Error('업로드 응답에서 파일 주소를 확인할 수 없습니다.');

      const payload = {
        title: file.name,
        category: docCategory,
        file_url: fileUrl,
        file_size: file.size,
        created_by: user.id || null,
        company_name: typeof user.company === 'string' ? user.company : '전체',
        version: 1,
        created_at: new Date().toISOString() };

      const { error } = await db.from('document_repository').insert([payload]);
      if (error) throw error;

      toast('문서가 업로드되었습니다.', 'success');
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast(err instanceof Error ? err.message : '업로드에 실패했습니다.', 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div style={{ padding: '0 0 24px' }}>
      {/* 서브 세그먼트 */}
      <div
        style={{
          padding: '10px 16px',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)' }}
      >
        <div className="m-seg" role="tablist" aria-label="계약 문서 관리 탭">
          <button
            type="button"
            className={subTab === 'contract' ? 'on' : ''}
            onClick={() => setSubTab('contract')}
            role="tab"
            aria-selected={subTab === 'contract'}
          >
            계약 현황
          </button>
          <button
            type="button"
            className={subTab === 'autogen' ? 'on' : ''}
            onClick={() => setSubTab('autogen')}
            role="tab"
            aria-selected={subTab === 'autogen'}
          >
            계약서 생성
          </button>
          <button
            type="button"
            className={subTab === 'repository' ? 'on' : ''}
            onClick={() => setSubTab('repository')}
            role="tab"
            aria-selected={subTab === 'repository'}
          >
            문서보관함
          </button>
          <button
            type="button"
            className={subTab === 'certificate' ? 'on' : ''}
            onClick={() => setSubTab('certificate')}
            role="tab"
            aria-selected={subTab === 'certificate'}
          >
            증명서 승인
          </button>
        </div>
      </div>

      {subTab === 'contract' && (
        <div style={{ padding: '14px 16px 0' }}>
          <div className="m-section-h" style={{ padding: '0 0 6px' }}>
            <div className="lbl">전사 근로계약 현황</div>
          </div>
          {loadingContracts && contracts.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
              계약 정보 불러오는 중...
            </div>
          ) : contracts.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
              조회된 근로계약 내역이 없습니다.
            </div>
          ) : (
            <div className="m-card flush macos-glass macos-squircle">
              {contracts.map((c) => {
                const staffName = staffs.find((s) => s.id === c.staff_id)?.name || '퇴사자';
                const isCurrent = c.status === '적용중' || c.status === 'active';
                const isPending = c.status === '서명대기';
                return (
                  <div key={c.id} className="m-list-row">
                    <MAvatar tone={pickAvatarTone(staffName)}>{staffName.charAt(0)}</MAvatar>
                    <div style={{ flex: 1 }}>
                      <div className="lbl">{c.contract_type || '근로계약서'}</div>
                      <div className="sub">
                        대상: {staffName} · 적용일: {c.start_date}
                      </div>
                    </div>
                    {isCurrent && <MChip tone="success">적용중</MChip>}
                    {isPending && <MChip tone="warning">서명대기</MChip>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === 'autogen' && (
        <div style={{ padding: '14px 16px 0' }}>
          <div className="m-card macos-glass macos-squircle-sm" style={{ padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>인쇄용 수기 계약서 자동생성</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                style={{
                  width: '100%',
                  padding: 10,
                  border: '1px solid var(--m-border)',
                  borderRadius: 8,
                  fontSize: 13,
                  background: 'white' }}
              >
                <option value="">직원을 선택하세요</option>
                {staffs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.department} · {s.position})
                  </option>
                ))}
              </select>

              <select
                value={contractType}
                onChange={(e) => setContractType(e.target.value)}
                style={{
                  width: '100%',
                  padding: 10,
                  border: '1px solid var(--m-border)',
                  borderRadius: 8,
                  fontSize: 13,
                  background: 'white' }}
              >
                <option value="표준근로계약서">표준근로계약서</option>
                <option value="연봉위임계약서">연봉위임계약서</option>
                <option value="용역/프리랜서 계약서">용역/프리랜서 계약서</option>
              </select>

              <input
                type="number"
                value={salary}
                onChange={(e) => setSalary(Number(e.target.value))}
                placeholder="월 기본급 입력"
                style={{
                  width: '100%',
                  padding: 10,
                  border: '1px solid var(--m-border)',
                  borderRadius: 8,
                  fontSize: 13 }}
              />

              <input
                type="text"
                value={workHours}
                onChange={(e) => setWorkHours(e.target.value)}
                placeholder="소정근로시간 (예: 09:00 ~ 18:00)"
                style={{
                  width: '100%',
                  padding: 10,
                  border: '1px solid var(--m-border)',
                  borderRadius: 8,
                  fontSize: 13 }}
              />

              <MBtn variant="primary" block onClick={handleGenerateContract}>
                인쇄용 계약서 PDF 생성
              </MBtn>
            </div>
          </div>
        </div>
      )}

      {subTab === 'repository' && (
        <div style={{ padding: '14px 16px 0' }}>
          {/* 규정 파일 업로드 */}
          <div className="m-card macos-glass macos-squircle-sm" style={{ padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>공용 규정 및 서식 업로드</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={docCategory}
                onChange={(e) => setDocCategory(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--m-border)',
                  fontSize: 13,
                  fontWeight: 700,
                  background: 'white' }}
              >
                <option value="규정">규정</option>
                <option value="양식">양식</option>
                <option value="근로계약서">근로계약서</option>
                <option value="연차촉진">연차촉진</option>
                <option value="제출서류">제출서류</option>
                <option value="기타">기타</option>
              </select>
              <MBtn
                variant="primary"
                icon="upload"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? '업로드 중...' : '문서 등록'}
              </MBtn>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx"
              style={{ display: 'none' }}
              onChange={(e) => void handleUploadFile(e)}
            />
          </div>

          {/* 파일 리스트 */}
          <div className="m-section-h" style={{ padding: '8px 0 6px' }}>
            <div className="lbl">등록된 규정/서식</div>
          </div>
          {loadingRepo && repoFiles.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
              파일 조회 중...
            </div>
          ) : repoFiles.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
              보관함에 등록된 문서가 없습니다.
            </div>
          ) : (
            <div className="m-card flush macos-glass macos-squircle">
              {repoFiles.map((file) => (
                <div key={file.id} className="m-list-row">
                  <div className="ico-tile tone-accent">
                    <MIcon name="fileText" size={18} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="lbl">{file.title}</div>
                    <div className="sub">{file.category}</div>
                  </div>
                  <button
                    type="button"
                    // 저장 URL 은 공개 R2 도메인이라 401 이 난다 — 인증 프록시 경유로 내려받는다.
                    onClick={() => window.open(buildStorageDownloadUrl(String(file.file_url ?? ''), file.title || '문서'), '_blank')}
                    style={{ padding: 6, background: 'none', border: 'none' }}
                  >
                    <MIcon name="download" size={18} color="var(--z-500)" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === 'certificate' && (
        <div style={{ padding: '14px 16px 0' }}>
          <div className="m-section-h" style={{ padding: '0 0 6px' }}>
            <div className="lbl">증명서 발급 결재함</div>
          </div>
          {loadingCerts && certificates.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
              조회 중...
            </div>
          ) : certificates.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
              대기 중인 증명서 발급 요청이 없습니다.
            </div>
          ) : (
            <div className="m-card flush macos-glass macos-squircle">
              {certificates.map((c) => (
                <div
                  key={c.id}
                  className="m-list-row"
                  style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 800 }}>{c.requester_name || '임직원'}</span>
                    <MChip tone="accent">{c.form_type}</MChip>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--z-600)', margin: 0 }}>
                    용도: {c.title} · 요청일: {c.created_at ? c.created_at.slice(0, 10) : ''}
                  </p>
                  {c.status === '대기' || c.status === '진행중' ? (
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={() => void handleApproveCert(c.id)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 8,
                          border: 'none',
                          background: 'var(--m-accent)',
                          color: 'white',
                          fontSize: 11,
                          fontWeight: 700 }}
                      >
                        발급 승인
                      </button>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'right' }}>
                      <MChip tone="success">{c.status}됨</MChip>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
