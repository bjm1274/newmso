'use client';

import { toast } from '@/lib/toast';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  staffs: any[];
  selectedCo: string;
  user: any;
}

const INCIDENT_TYPES = ['부상', '의료사고', '화재', '안전사고', '감염노출사고', '장비오작동', '기타'];
const SEVERITIES = ['경미', '중간', '중대', '심각'];
const STATUSES = ['접수', '조사중', '조치완료', '종결'];

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

const emptyForm = (): Report => ({
  incident_date: new Date().toISOString().slice(0, 10),
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
  status: STATUSES[0],
});

export default function IncidentReport({ staffs, selectedCo, user }: Props) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [tab, setTab] = useState<'목록' | '작성' | '통계'>('목록');
  const [form, setForm] = useState<Report>(() => emptyForm());
  const [selectedPersons, setSelectedPersons] = useState<string[]>([]);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);

  const filteredStaffs = useMemo(
    () => (selectedCo === '전체' ? staffs : staffs.filter((staff: any) => staff.company === selectedCo)),
    [selectedCo, staffs]
  );
  const isEditing = Boolean(editingReportId);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('incident_reports')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setReports(data || []);
    } catch (error) {
      console.error('incident_reports fetch failed:', error);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchReports();
  }, []);

  const resetForm = () => {
    setForm(emptyForm());
    setSelectedPersons([]);
    setEditingReportId(null);
  };

  const startCreate = () => {
    resetForm();
    setTab('작성');
  };

  const startEdit = (report: Report) => {
    setEditingReportId(report.id ?? null);
    setForm({
      ...emptyForm(),
      ...report,
      involved_persons: Array.isArray(report.involved_persons) ? report.involved_persons : [],
    });
    setSelectedPersons(Array.isArray(report.involved_persons) ? report.involved_persons : []);
    setTab('작성');
  };

  const cancelEdit = () => {
    resetForm();
    setTab('목록');
  };

  const handleSave = async () => {
    if (!form.location.trim() || !form.description.trim()) {
      toast('사고 장소와 사고 경위를 입력해 주세요.', 'warning');
      return;
    }

    setSaving(true);

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
        reporter_id: form.reporter_id || user?.id || '',
        reporter_name: form.reporter_name || user?.name || user?.email || '',
        status: form.status || STATUSES[0],
      };

      if (editingReportId) {
        const { error } = await supabase
          .from('incident_reports')
          .update(payload)
          .eq('id', editingReportId);
        if (error) throw error;
        toast('사고 보고서를 수정했습니다.', 'success');
      } else {
        const { error } = await supabase.from('incident_reports').insert({
          ...payload,
          reporter_id: user?.id || '',
          reporter_name: user?.name || user?.email || '',
          created_at: new Date().toISOString(),
        });
        if (error) throw error;
        toast('사고 보고서를 등록했습니다.', 'success');
      }

      resetForm();
      setTab('목록');
      await fetchReports();
    } catch (error) {
      console.error('incident_reports save failed:', error);
      toast(isEditing ? '사고 보고서 수정에 실패했습니다.' : '사고 보고서 등록에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (report: Report) => {
    if (!report.id) return;

    const confirmed = window.confirm(
      `${report.incident_date} 사고 보고서를 삭제할까요?\n삭제 후에는 복구할 수 없습니다.`
    );
    if (!confirmed) return;

    setDeletingId(report.id);
    try {
      const { error } = await supabase.from('incident_reports').delete().eq('id', report.id);
      if (error) throw error;

      setReports((prev) => prev.filter((item) => item.id !== report.id));

      if (editingReportId === report.id) {
        resetForm();
        setTab('목록');
      }

      toast('사고 보고서를 삭제했습니다.', 'success');
    } catch (error) {
      console.error('incident_reports delete failed:', error);
      toast('사고 보고서 삭제에 실패했습니다.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const { error } = await supabase.from('incident_reports').update({ status }).eq('id', id);
      if (error) throw error;
      setReports((prev) => prev.map((report) => (report.id === id ? { ...report, status } : report)));
    } catch (error) {
      console.error('incident_reports status update failed:', error);
      toast('상태 변경에 실패했습니다.', 'error');
    }
  };

  const handlePrint = (report: Report) => {
    const win = window.open('', '_blank');
    if (!win) return;

    win.document.write(`
      <html>
        <head>
          <title>사고보고서</title>
          <style>
            body { font-family: sans-serif; padding: 40px; }
            h1 { text-align: center; }
            table { width: 100%; border-collapse: collapse; }
            td, th { border: 1px solid #ccc; padding: 8px; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>사고 보고서</h1>
          <table>
            <tr><th>사고일시</th><td>${report.incident_date} ${report.incident_time}</td><th>장소</th><td>${report.location}</td></tr>
            <tr><th>유형</th><td>${report.type}</td><th>심각도</th><td>${report.severity}</td></tr>
            <tr><th>사고 경위</th><td colspan="3">${report.description}</td></tr>
            <tr><th>즉시 조치</th><td colspan="3">${report.immediate_action || '-'}</td></tr>
            <tr><th>근본 원인</th><td colspan="3">${report.root_cause || '-'}</td></tr>
            <tr><th>재발 방지</th><td colspan="3">${report.preventive_measures || '-'}</td></tr>
            <tr><th>관련자</th><td colspan="3">${(report.involved_persons || []).join(', ') || '-'}</td></tr>
            <tr><th>보고자</th><td>${report.reporter_name || '-'}</td><th>상태</th><td>${report.status}</td></tr>
          </table>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  };

  const severityColor = (severity: string) =>
    severity === '심각'
      ? 'text-red-700 bg-red-500/20'
      : severity === '중대'
        ? 'text-red-500 bg-red-500/10'
        : severity === '중간'
          ? 'text-amber-600 bg-amber-50'
          : 'text-green-600 bg-green-500/10';

  const typeCounts: Record<string, number> = {};
  const severityCounts: Record<string, number> = {};
  reports.forEach((report) => {
    typeCounts[report.type] = (typeCounts[report.type] || 0) + 1;
    severityCounts[report.severity] = (severityCounts[report.severity] || 0) + 1;
  });
  const maxTypeCount = Math.max(...Object.values(typeCounts), 1);

  const detailFields: Array<{
    key: 'immediate_action' | 'root_cause' | 'preventive_measures';
    label: string;
    placeholder: string;
  }> = [
    { key: 'immediate_action', label: '즉시 조치 사항', placeholder: '현장에서 바로 조치한 내용을 입력해 주세요.' },
    { key: 'root_cause', label: '근본 원인 분석', placeholder: '사고 원인과 배경을 정리해 주세요.' },
    { key: 'preventive_measures', label: '재발 방지 대책', placeholder: '재발 방지 계획을 입력해 주세요.' },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-4" data-testid="incident-report-view">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">사고 보고서 관리</h2>
          <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
            사고 발생 시 즉시 보고하고 이력을 관리합니다.
          </p>
        </div>
        <div className="flex gap-2">
          {(['목록', '작성', '통계'] as const).map((targetTab) => (
            <button
              key={targetTab}
              type="button"
              onClick={() => {
                if (targetTab === '작성' && !isEditing) {
                  startCreate();
                  return;
                }
                setTab(targetTab);
              }}
              className={`rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-bold ${
                tab === targetTab
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
              }`}
            >
              {targetTab}
            </button>
          ))}
        </div>
      </div>

      {tab === '작성' && (
        <div
          data-testid="incident-report-form"
          className="space-y-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-5"
        >
          {isEditing ? (
            <div
              data-testid="incident-report-editing-banner"
              className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700"
            >
              기존 사고 보고서를 수정 중입니다. 저장하면 기존 보고서가 업데이트됩니다.
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">사고 날짜</label>
              <input
                data-testid="incident-report-date"
                type="date"
                value={form.incident_date}
                onChange={(event) => setForm((prev) => ({ ...prev, incident_date: event.target.value }))}
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--muted)] p-2 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">사고 시간</label>
              <input
                data-testid="incident-report-time"
                type="time"
                value={form.incident_time}
                onChange={(event) => setForm((prev) => ({ ...prev, incident_time: event.target.value }))}
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--muted)] p-2 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">유형</label>
              <select
                data-testid="incident-report-type"
                value={form.type}
                onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--muted)] p-2 text-xs"
              >
                {INCIDENT_TYPES.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">심각도</label>
              <select
                data-testid="incident-report-severity"
                value={form.severity}
                onChange={(event) => setForm((prev) => ({ ...prev, severity: event.target.value }))}
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--muted)] p-2 text-xs"
              >
                {SEVERITIES.map((severity) => (
                  <option key={severity}>{severity}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">사고 장소</label>
            <input
              data-testid="incident-report-location"
              value={form.location}
              onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
              placeholder="예: 3층 처치실"
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--muted)] p-2 text-xs"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">사고 경위</label>
            <textarea
              data-testid="incident-report-description"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              rows={3}
              placeholder="사고 발생 경위를 상세히 입력해 주세요."
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--muted)] p-2 text-xs"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">관련 직원</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {filteredStaffs.map((staff: any) => (
                <button
                  key={staff.id}
                  type="button"
                  data-testid={`incident-report-person-${staff.id}`}
                  onClick={() =>
                    setSelectedPersons((prev) =>
                      prev.includes(staff.name)
                        ? prev.filter((name) => name !== staff.name)
                        : [...prev, staff.name]
                    )
                  }
                  className={`rounded-md px-2 py-1 text-[10px] font-bold transition-all ${
                    selectedPersons.includes(staff.name)
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                  }`}
                >
                  {staff.name}
                </button>
              ))}
            </div>
          </div>

          {detailFields.map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">{label}</label>
              <textarea
                data-testid={`incident-report-${key}`}
                value={form[key]}
                onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
                rows={2}
                placeholder={placeholder}
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--muted)] p-2 text-xs"
              />
            </div>
          ))}

          <div className="grid gap-2 md:grid-cols-2">
            <button
              type="button"
              data-testid="incident-report-save"
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-[var(--radius-md)] bg-[var(--accent)] py-2.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? '저장 중...' : isEditing ? '사고 보고서 수정' : '사고 보고서 등록'}
            </button>

            {isEditing ? (
              <button
                type="button"
                data-testid="incident-report-cancel-edit"
                onClick={cancelEdit}
                disabled={saving}
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] py-2.5 text-xs font-bold text-[var(--foreground)] hover:bg-[var(--toss-gray-1)] disabled:opacity-50"
              >
                수정 취소
              </button>
            ) : null}
          </div>

          {isEditing ? (
            <button
              type="button"
              data-testid="incident-report-delete-active"
              onClick={() => {
                const activeReport = reports.find((report) => report.id === editingReportId);
                if (activeReport) {
                  void handleDelete(activeReport);
                }
              }}
              disabled={deletingId === editingReportId}
              className="w-full rounded-[var(--radius-md)] border border-red-200 bg-red-50 py-2.5 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              {deletingId === editingReportId ? '삭제 중...' : '현재 보고서 삭제'}
            </button>
          ) : null}
        </div>
      )}

      {tab === '목록' && (
        <>
          {loading ? (
            <div className="py-5 text-center text-sm text-[var(--toss-gray-3)]">로딩 중...</div>
          ) : reports.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] py-8 text-center">
              <p className="text-sm text-[var(--toss-gray-3)]">등록된 사고 보고서가 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3" data-testid="incident-report-list">
              {reports.map((report) => (
                <div
                  key={report.id}
                  data-testid={`incident-report-card-${report.id}`}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4"
                >
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[var(--foreground)]">{report.type}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${severityColor(report.severity)}`}
                        >
                          {report.severity}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-[var(--toss-gray-4)]">
                        {report.incident_date} {report.incident_time} · {report.location}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <select
                        value={report.status}
                        onChange={(event) => report.id && handleStatusChange(report.id, event.target.value)}
                        className="rounded-md border border-[var(--border)] bg-[var(--muted)] p-1 text-[10px] font-bold"
                      >
                        {STATUSES.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handlePrint(report)}
                        className="rounded-md bg-[var(--muted)] px-2 py-1 text-[10px] font-bold hover:bg-[var(--toss-gray-2)]"
                      >
                        PDF 출력
                      </button>
                      <button
                        type="button"
                        data-testid={`incident-report-edit-${report.id}`}
                        onClick={() => startEdit(report)}
                        className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-600 hover:bg-blue-100"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        data-testid={`incident-report-delete-${report.id}`}
                        onClick={() => {
                          void handleDelete(report);
                        }}
                        disabled={deletingId === report.id}
                        className="rounded-md bg-red-50 px-2 py-1 text-[10px] font-bold text-red-600 hover:bg-red-100 disabled:opacity-50"
                      >
                        {deletingId === report.id ? '삭제 중...' : '삭제'}
                      </button>
                    </div>
                  </div>

                  <p className="line-clamp-2 text-xs text-[var(--toss-gray-4)]">{report.description}</p>

                  {report.involved_persons?.length ? (
                    <p className="mt-2 text-[10px] text-[var(--toss-gray-3)]">
                      관련 직원: {report.involved_persons.join(', ')}
                    </p>
                  ) : null}

                  <p className="mt-1 text-[10px] text-[var(--toss-gray-3)]">보고자: {report.reporter_name}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === '통계' && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4">
            <h3 className="mb-3 text-sm font-bold text-[var(--foreground)]">유형별 건수</h3>
            {Object.entries(typeCounts).map(([type, count]) => (
              <div key={type} className="mb-1.5 flex items-center gap-2">
                <span className="w-16 shrink-0 text-[10px] font-bold text-[var(--toss-gray-4)]">{type}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${(count / maxTypeCount) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right text-[10px] font-bold">{count}</span>
              </div>
            ))}
          </div>

          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4">
            <h3 className="mb-3 text-sm font-bold text-[var(--foreground)]">심각도별 건수</h3>
            {SEVERITIES.map((severity) => {
              const count = severityCounts[severity] || 0;
              const max = Math.max(...Object.values(severityCounts), 1);

              return (
                <div key={severity} className="mb-1.5 flex items-center gap-2">
                  <span
                    className={`w-12 shrink-0 text-[10px] font-bold ${
                      severity === '심각'
                        ? 'text-red-700'
                        : severity === '중대'
                          ? 'text-red-500'
                          : severity === '중간'
                            ? 'text-amber-600'
                            : 'text-green-600'
                    }`}
                  >
                    {severity}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
                    <div
                      className={`h-full rounded-full ${
                        severity === '심각'
                          ? 'bg-red-700'
                          : severity === '중대'
                            ? 'bg-red-500'
                            : severity === '중간'
                              ? 'bg-amber-400'
                              : 'bg-green-400'
                      }`}
                      style={{ width: `${(count / max) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-[10px] font-bold">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
