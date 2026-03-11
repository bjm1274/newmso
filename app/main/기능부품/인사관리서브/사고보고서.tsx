'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  staffs: any[];
  selectedCo: string;
  user: any;
}

const INCIDENT_TYPES = ['낙상', '의료사고', '화재', '안전사고', '감염사고', '장비오작동', '기타'];
const SEVERITIES = ['경미', '중등', '중증', '사망'];
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
  type: '낙상',
  severity: '경미',
  description: '',
  involved_persons: [],
  immediate_action: '',
  root_cause: '',
  preventive_measures: '',
  reporter_id: '',
  reporter_name: '',
  status: '접수',
});

export default function IncidentReport({ staffs, selectedCo, user }: Props) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'목록' | '작성' | '통계'>('목록');
  const [form, setForm] = useState<Report>(() => emptyForm());
  const [saving, setSaving] = useState(false);
  const [selectedPersons, setSelectedPersons] = useState<string[]>([]);

  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('incident_reports')
        .select('*')
        .order('created_at', { ascending: false });
      setReports(data || []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, []);

  const handleSave = async () => {
    if (!form.location.trim() || !form.description.trim()) return alert('장소와 사고 경위를 입력해주세요.');
    setSaving(true);
    try {
      await supabase.from('incident_reports').insert({
        ...form,
        involved_persons: selectedPersons,
        reporter_id: user?.id,
        reporter_name: user?.name || user?.email || '',
        created_at: new Date().toISOString(),
      });
      alert('사고 보고서가 등록되었습니다.');
      setForm(emptyForm());
      setSelectedPersons([]);
      setTab('목록');
      fetchReports();
    } catch {
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await supabase.from('incident_reports').update({ status }).eq('id', id);
      setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch {
      alert('상태 변경에 실패했습니다.');
    }
  };

  const handlePrint = (report: Report) => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><head><title>사고보고서</title><style>body{font-family:sans-serif;padding:40px}h1{text-align:center}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px;font-size:12px}</style></head><body>
      <h1>사고 보고서</h1>
      <table>
        <tr><th>사고일시</th><td>${report.incident_date} ${report.incident_time}</td><th>장소</th><td>${report.location}</td></tr>
        <tr><th>유형</th><td>${report.type}</td><th>심각도</th><td>${report.severity}</td></tr>
        <tr><th>사고 경위</th><td colspan="3">${report.description}</td></tr>
        <tr><th>즉각 조치</th><td colspan="3">${report.immediate_action}</td></tr>
        <tr><th>근본 원인</th><td colspan="3">${report.root_cause}</td></tr>
        <tr><th>재발 방지</th><td colspan="3">${report.preventive_measures}</td></tr>
        <tr><th>보고자</th><td>${report.reporter_name}</td><th>상태</th><td>${report.status}</td></tr>
      </table>
    </body></html>`);
    win.document.close();
    win.print();
  };

  const severityColor = (s: string) =>
    s === '사망' ? 'text-red-700 bg-red-100' :
    s === '중증' ? 'text-red-500 bg-red-50' :
    s === '중등' ? 'text-amber-600 bg-amber-50' :
    'text-green-600 bg-green-50';

  // 통계
  const typeCounts: Record<string, number> = {};
  const severityCounts: Record<string, number> = {};
  reports.forEach(r => {
    typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
    severityCounts[r.severity] = (severityCounts[r.severity] || 0) + 1;
  });
  const maxTypeCount = Math.max(...Object.values(typeCounts), 1);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">사고 보고서 관리</h2>
          <p className="text-xs text-[var(--toss-gray-3)] mt-1">사고 발생 시 즉시 보고하고 이력을 관리합니다.</p>
        </div>
        <div className="flex gap-2">
          {(['목록', '작성', '통계'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-xs font-bold rounded-[8px] ${tab === t ? 'bg-[var(--toss-blue)] text-white' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'}`}>{t}</button>
          ))}
        </div>
      </div>

      {tab === '작성' && (
        <div className="space-y-4 bg-[var(--toss-card)] p-5 rounded-[12px] border border-[var(--toss-border)]">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">사고 날짜</label>
              <input type="date" value={form.incident_date} onChange={e => setForm(f => ({ ...f, incident_date: e.target.value }))} className="w-full p-2 text-xs border border-[var(--toss-border)] rounded-[6px] bg-[var(--toss-gray-1)] mt-1" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">사고 시간</label>
              <input type="time" value={form.incident_time} onChange={e => setForm(f => ({ ...f, incident_time: e.target.value }))} className="w-full p-2 text-xs border border-[var(--toss-border)] rounded-[6px] bg-[var(--toss-gray-1)] mt-1" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">유형</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full p-2 text-xs border border-[var(--toss-border)] rounded-[6px] bg-[var(--toss-gray-1)] mt-1">
                {INCIDENT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">심각도</label>
              <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))} className="w-full p-2 text-xs border border-[var(--toss-border)] rounded-[6px] bg-[var(--toss-gray-1)] mt-1">
                {SEVERITIES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">사고 장소</label>
            <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="예: 3층 처치실" className="w-full p-2 text-xs border border-[var(--toss-border)] rounded-[6px] bg-[var(--toss-gray-1)] mt-1" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">사고 경위</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="사고 발생 경위를 상세히 기술하세요" className="w-full p-2 text-xs border border-[var(--toss-border)] rounded-[6px] bg-[var(--toss-gray-1)] mt-1" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">관련 직원 (다중 선택)</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {filtered.map((s: any) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedPersons(prev =>
                    prev.includes(s.name) ? prev.filter(p => p !== s.name) : [...prev, s.name]
                  )}
                  className={`px-2 py-1 text-[10px] font-bold rounded-[6px] transition-all ${selectedPersons.includes(s.name) ? 'bg-[var(--toss-blue)] text-white' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          {[
            { key: 'immediate_action', label: '즉각 조치사항' },
            { key: 'root_cause', label: '근본 원인 분석' },
            { key: 'preventive_measures', label: '재발 방지 대책' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">{label}</label>
              <textarea
                value={(form as any)[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                rows={2}
                className="w-full p-2 text-xs border border-[var(--toss-border)] rounded-[6px] bg-[var(--toss-gray-1)] mt-1"
              />
            </div>
          ))}
          <button onClick={handleSave} disabled={saving} className="w-full py-2.5 bg-[var(--toss-blue)] text-white text-xs font-bold rounded-[8px] hover:opacity-90 disabled:opacity-50">
            {saving ? '저장 중...' : '보고서 등록'}
          </button>
        </div>
      )}

      {tab === '목록' && (
        loading ? <div className="text-center py-8 text-sm text-[var(--toss-gray-3)]">로딩 중...</div> :
        reports.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-[var(--toss-border)] rounded-[12px]">
            <p className="text-sm text-[var(--toss-gray-3)]">등록된 사고 보고서가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map(report => (
              <div key={report.id} className="p-4 bg-[var(--toss-card)] rounded-[12px] border border-[var(--toss-border)]">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[var(--foreground)]">{report.type}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${severityColor(report.severity)}`}>{report.severity}</span>
                    </div>
                    <p className="text-[11px] text-[var(--toss-gray-4)] mt-0.5">{report.incident_date} {report.incident_time} · {report.location}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <select
                      value={report.status}
                      onChange={e => report.id && handleStatusChange(report.id, e.target.value)}
                      className="text-[10px] font-bold p-1 border border-[var(--toss-border)] rounded-[6px] bg-[var(--toss-gray-1)]"
                    >
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                    <button onClick={() => handlePrint(report)} className="px-2 py-1 text-[10px] font-bold bg-[var(--toss-gray-1)] rounded-[6px] hover:bg-[var(--toss-gray-2)]">PDF 출력</button>
                  </div>
                </div>
                <p className="text-xs text-[var(--toss-gray-4)] line-clamp-2">{report.description}</p>
                <p className="text-[10px] text-[var(--toss-gray-3)] mt-1">보고자: {report.reporter_name}</p>
              </div>
            ))}
          </div>
        )
      )}

      {tab === '통계' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-[var(--toss-card)] rounded-[12px] border border-[var(--toss-border)] p-4">
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-3">유형별 건수</h3>
            {Object.entries(typeCounts).map(([type, count]) => (
              <div key={type} className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-bold text-[var(--toss-gray-4)] w-16 shrink-0">{type}</span>
                <div className="flex-1 bg-[var(--toss-gray-1)] rounded-full h-3 overflow-hidden">
                  <div className="h-full bg-[var(--toss-blue)] rounded-full" style={{ width: `${(count / maxTypeCount) * 100}%` }} />
                </div>
                <span className="text-[10px] font-bold w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
          <div className="bg-[var(--toss-card)] rounded-[12px] border border-[var(--toss-border)] p-4">
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-3">심각도별 건수</h3>
            {SEVERITIES.map(s => {
              const count = severityCounts[s] || 0;
              const max = Math.max(...Object.values(severityCounts), 1);
              return (
                <div key={s} className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[10px] font-bold w-12 shrink-0 ${s === '사망' ? 'text-red-700' : s === '중증' ? 'text-red-500' : s === '중등' ? 'text-amber-600' : 'text-green-600'}`}>{s}</span>
                  <div className="flex-1 bg-[var(--toss-gray-1)] rounded-full h-3 overflow-hidden">
                    <div className={`h-full rounded-full ${s === '사망' ? 'bg-red-700' : s === '중증' ? 'bg-red-500' : s === '중등' ? 'bg-amber-400' : 'bg-green-400'}`} style={{ width: `${(count / max) * 100}%` }} />
                  </div>
                  <span className="text-[10px] font-bold w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
