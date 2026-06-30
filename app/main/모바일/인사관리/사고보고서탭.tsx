'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/db-client';
import type { StaffMember, ErpUser } from '@/types';
import { toast } from '@/lib/toast';
import { getKoreanTodayString } from '@/lib/seoul-time';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';

interface Report {
  id?: string;
  incident_date: string;
  incident_time: string;
  location: string;
  type: string;
  severity: string;
  description: string;
  involved_persons: string[];
  immediate_action: string;
  root_cause: string;
  preventive_measures: string;
  reporter_id: string;
  reporter_name: string;
  status: string;
  created_at?: string;
}

interface IncidentReportTabProps {
  staffs: StaffMember[];
  company?: string;
  user: ErpUser;
}

const INCIDENT_TYPES = ['부상', '의료사고', '화재', '안전사고', '감염노출사고', '장비오작동', '기타'];
const SEVERITIES = ['경미', '중간', '중대', '심각'];
const STATUSES = ['접수', '조사중', '조치완료', '종결'];

function normalizeInvolvedPersons(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

const emptyForm = (): Report => ({
  incident_date: getKoreanTodayString(),
  incident_time: '',
  location: '',
  type: INCIDENT_TYPES[0],
  severity: SEVERITIES[0],
  description: '',
  involved_persons: [],
  immediate_action: '',
  root_cause: '',
  preventive_measures: '',
  reporter_id: '',
  reporter_name: '',
  status: STATUSES[0] });

export default function 사고보고서탭({ staffs, company, user }: IncidentReportTabProps) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [form, setForm] = useState<Report>(() => emptyForm());
  const [selectedPersons, setSelectedPersons] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('전체');

  const isHrAdmin = useMemo(() => {
    const perms = (user.permissions ?? {}) as Record<string, unknown>;
    return (
      perms.mso === true ||
      perms.menu_인사관리 === true ||
      user.role === '관리자' ||
      user.role === '매니저'
    );
  }, [user]);

  const filteredStaffs = useMemo(() => {
    return company && company !== '전체' ? staffs.filter((s) => s.company === company) : staffs;
  }, [staffs, company]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const { data, error } = await db
        .from('incident_reports')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setReports(
        (data || []).map((row: any) => ({
          ...row,
          involved_persons: normalizeInvolvedPersons(row.involved_persons) }))
      );
    } catch (err) {
      console.error('[IncidentReportTab] 사고보고서 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchReports();
  }, []);

  const filteredReports = useMemo(() => {
    if (filterType === '전체') return reports;
    return reports.filter((r) => r.type === filterType);
  }, [reports, filterType]);

  const handleOpenCreate = () => {
    setForm(emptyForm());
    setSelectedPersons([]);
    setEditingId(null);
    setShowFormModal(true);
  };

  const handleOpenEdit = (report: Report) => {
    setEditingId(report.id ?? null);
    setForm({ ...report });
    setSelectedPersons(report.involved_persons || []);
    setShowFormModal(true);
  };

  const handleSave = async () => {
    if (!form.location.trim() || !form.description.trim()) {
      toast('사고 장소와 사고 경위를 입력해 주세요.', 'warning');
      return;
    }

    try {
      const payload = {
        incident_date: form.incident_date,
        incident_time: form.incident_time,
        location: form.location.trim(),
        type: form.type,
        severity: form.severity,
        description: form.description.trim(),
        involved_persons: selectedPersons,
        immediate_action: form.immediate_action.trim(),
        root_cause: form.root_cause.trim(),
        preventive_measures: form.preventive_measures.trim(),
        reporter_id: form.reporter_id || user.id || '',
        reporter_name: form.reporter_name || user.name || user.email || '',
        status: form.status || STATUSES[0] };

      if (editingId) {
        const { error } = await db
          .from('incident_reports')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
        toast('사고 보고서가 수정되었습니다.', 'success');
      } else {
        const { error } = await db.from('incident_reports').insert({
          ...payload,
          reporter_id: user.id || '',
          reporter_name: user.name || user.email || '',
          created_at: new Date().toISOString() });
        if (error) throw error;
        toast('사고 보고서가 등록되었습니다.', 'success');
      }

      setShowFormModal(false);
      void fetchReports();
    } catch (err) {
      console.error('[IncidentReportTab] 저장 오류:', err);
      toast('사고 보고서 저장에 실패했습니다.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말로 이 사고 보고서를 삭제하시겠습니까?')) return;
    try {
      const { error } = await db.from('incident_reports').delete().eq('id', id);
      if (error) throw error;
      toast('사고 보고서가 삭제되었습니다.', 'success');
      setShowFormModal(false);
      void fetchReports();
    } catch (err) {
      console.error('[IncidentReportTab] 삭제 오류:', err);
      toast('삭제에 실패했습니다.', 'error');
    }
  };

  const severityTones: Record<string, 'success' | 'warning' | 'danger'> = {
    경미: 'success',
    중간: 'warning',
    중대: 'danger',
    심각: 'danger' };

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{
            flex: 1,
            padding: '10px 12px',
            border: '1px solid var(--m-border)',
            borderRadius: 'var(--m-radius-md)',
            background: 'var(--m-card)',
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--z-800)' }}
        >
          <option value="전체">모든 유형</option>
          {INCIDENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {isHrAdmin && (
          <MBtn variant="primary" icon="plus" onClick={handleOpenCreate}>
            보고서 작성
          </MBtn>
        )}
      </div>

      {loading && filteredReports.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
          불러오는 중...
        </div>
      ) : filteredReports.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
          등록된 사고 보고서가 없습니다.
        </div>
      ) : (
        <div className="m-card flush macos-glass macos-squircle">
          {filteredReports.map((r) => (
            <button
              key={r.id}
              type="button"
              className="m-list-row"
              style={{ textAlign: 'left', width: '100%', cursor: 'pointer', alignItems: 'flex-start' }}
              onClick={() => handleOpenEdit(r)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span className="lbl" style={{ fontWeight: 800 }}>
                    {r.type}
                  </span>
                  <MChip tone={severityTones[r.severity] || ''}>{r.severity}</MChip>
                  <MChip tone="accent">{r.status}</MChip>
                </div>
                <div className="sub" style={{ fontSize: 11 }}>
                  📅 {r.incident_date} {r.incident_time} · 📍 {r.location}
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--z-700)',
                    margin: '6px 0 0 0',
                    lineClamp: 2,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden' }}
                >
                  {r.description}
                </p>
              </div>
              <span style={{ alignSelf: 'center' }}>
                <MIcon name="chevR" size={18} color="var(--z-400)" />
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 보고서 작성/수정 모달 */}
      {showFormModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
          onClick={() => setShowFormModal(false)}
        >
          <div
            className="w-full max-w-md macos-glass macos-squircle animate-in slide-in-from-bottom duration-250"
            style={{
              padding: '20px 16px 24px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 800 }}>
                {editingId ? '사고 보고서 수정' : '새 사고 보고서 작성'}
              </span>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 16, fontWeight: 700 }}
              >
                ✕
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>사고 날짜</label>
                  <input
                    type="date"
                    value={form.incident_date}
                    onChange={(e) => setForm((prev) => ({ ...prev, incident_date: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid var(--m-border)',
                      borderRadius: 8,
                      fontSize: 13,
                      marginTop: 4 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>사고 시간</label>
                  <input
                    type="time"
                    value={form.incident_time}
                    onChange={(e) => setForm((prev) => ({ ...prev, incident_time: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid var(--m-border)',
                      borderRadius: 8,
                      fontSize: 13,
                      marginTop: 4 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>유형</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid var(--m-border)',
                      borderRadius: 8,
                      fontSize: 13,
                      marginTop: 4,
                      background: 'white' }}
                  >
                    {INCIDENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>심각도</label>
                  <select
                    value={form.severity}
                    onChange={(e) => setForm((prev) => ({ ...prev, severity: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid var(--m-border)',
                      borderRadius: 8,
                      fontSize: 13,
                      marginTop: 4,
                      background: 'white' }}
                  >
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>사고 장소</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                  placeholder="예: 3층 수술실 복도"
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid var(--m-border)',
                    borderRadius: 8,
                    fontSize: 13,
                    marginTop: 4 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>사고 경위</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="구체적인 발생 원인 및 위반 상황"
                  style={{
                    width: '100%',
                    height: 60,
                    padding: 10,
                    border: '1px solid var(--m-border)',
                    borderRadius: 8,
                    fontSize: 13,
                    marginTop: 4,
                    resize: 'none' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>관련 직원 (다중 선택)</label>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    maxHeight: 70,
                    overflowY: 'auto',
                    border: '1px solid var(--m-border)',
                    borderRadius: 8,
                    padding: 8,
                    marginTop: 4 }}
                >
                  {filteredStaffs.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setSelectedPersons((prev) =>
                          prev.includes(s.name) ? prev.filter((n) => n !== s.name) : [...prev, s.name]
                        )
                      }
                      style={{
                        padding: '4px 8px',
                        fontSize: 11,
                        borderRadius: 6,
                        border: 'none',
                        background: selectedPersons.includes(s.name) ? 'var(--m-accent)' : 'var(--m-muted)',
                        color: selectedPersons.includes(s.name) ? 'white' : 'var(--z-800)',
                        fontWeight: 700 }}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>즉시 조치 사항</label>
                <textarea
                  value={form.immediate_action}
                  onChange={(e) => setForm((prev) => ({ ...prev, immediate_action: e.target.value }))}
                  placeholder="현장에서의 즉각적 대응"
                  style={{
                    width: '100%',
                    height: 50,
                    padding: 10,
                    border: '1px solid var(--m-border)',
                    borderRadius: 8,
                    fontSize: 13,
                    marginTop: 4,
                    resize: 'none' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>재발 방지 대책</label>
                <textarea
                  value={form.preventive_measures}
                  onChange={(e) => setForm((prev) => ({ ...prev, preventive_measures: e.target.value }))}
                  placeholder="재발 방지를 위한 조치 계획"
                  style={{
                    width: '100%',
                    height: 50,
                    padding: 10,
                    border: '1px solid var(--m-border)',
                    borderRadius: 8,
                    fontSize: 13,
                    marginTop: 4,
                    resize: 'none' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              {editingId && isHrAdmin && (
                <button
                  type="button"
                  onClick={() => handleDelete(editingId)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: 8,
                    border: '1px solid var(--m-danger)',
                    background: 'white',
                    color: 'var(--m-danger)',
                    fontWeight: 700,
                    fontSize: 13 }}
                >
                  삭제
                </button>
              )}
              <MBtn block onClick={() => setShowFormModal(false)}>
                취소
              </MBtn>
              <MBtn block variant="primary" onClick={handleSave}>
                저장하기
              </MBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
