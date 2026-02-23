'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { CERTIFICATE_TYPES } from '@/lib/certificate-types';

function formatDate(d: string | null) {
  if (!d) return '현재';
  return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '.').replace('.', '');
}

export default function CertificateGenerator({ staffs = [] }: any) {
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [certType, setCertType] = useState('재직증명서');
  const [purpose, setPurpose] = useState('금융기관 제출용');
  const [serialNo, setSerialNo] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

  const joined = selectedStaff?.joined_at || selectedStaff?.join_date;
  const resigned = selectedStaff?.resigned_at;
  const workPeriod = joined ? `${formatDate(joined)} ~ ${resigned ? formatDate(resigned) : '현재'}` : '-';
  const baseSalary = selectedStaff?.base_salary ?? selectedStaff?.base ?? 0;
  const totalPay = baseSalary + (selectedStaff?.meal_allowance ?? selectedStaff?.meal ?? 0);

  const certClosingText: Record<string, string> = {
    재직증명서: '위와 같이 재직 중임을 증명함.',
    경력증명서: '위와 같이 경력을 증명함.',
    퇴직증명서: '위와 같이 퇴직하였음을 증명함.',
    급여인증서: '위와 같이 급여를 지급한 사실을 증명함.',
    근무확인서: '위와 같이 근무하였음을 확인함.',
    원천징수영수증: '위와 같이 원천징수한 사실을 증명함.',
    소득금액증명원: '위와 같이 소득금액을 증명함.',
  };

  const handleIssue = async () => {
    if (!selectedStaff) return alert("발급 대상을 선택해주세요.");
    const sn = `CERT-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(Date.now()).slice(-6)}`;
    setSerialNo(sn);
    const u = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('erp_user') || '{}') : {};
    try {
      await supabase.from('certificate_issuances').insert({
        staff_id: selectedStaff.id,
        cert_type: certType,
        serial_no: sn,
        purpose,
        issued_by: u.id,
      });
    } catch (_) {}
    setTimeout(() => {
      if (!printRef.current) return;
      const html = printRef.current.innerHTML.replace('제 2026-0001', `제 ${sn}`).replace(/2026-0001/g, sn);
      const w = window.open('', '_blank');
      if (!w) return;
      const printStyles = `
        * { box-sizing: border-box; }
        body { font-family: 'Noto Serif KR', Georgia, serif; padding: 40px; max-width: 620px; margin: 0 auto; background: #f5f5f5; color: #191F28; }
        #cert-print-root { max-width: 600px; margin: 0 auto; padding: 3rem 5rem; background: #fff; border: 1px solid #E5E8EB; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.15); position: relative; text-align: center; }
        #cert-print-root .cert-watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0.03; pointer-events: none; font-size: 7rem; font-weight: 600; transform: rotate(-45deg); }
        #cert-print-root .cert-header { margin-bottom: 0.5rem; }
        #cert-print-root .cert-header .cert-no { font-size: 10px; font-weight: 600; color: #6b7280; letter-spacing: 0.5em; }
        #cert-print-root .cert-header .cert-title { font-size: 1.75rem; letter-spacing: 0.3em; border-bottom: 4px solid #191F28; padding-bottom: 1rem; display: inline-block; margin-top: 0.5rem; font-weight: 600; }
        #cert-print-root .cert-body { text-align: left; padding-top: 2.5rem; }
        #cert-print-root .cert-body .cert-row { display: flex; border-bottom: 1px solid #E5E8EB; padding-bottom: 0.5rem; margin-bottom: 1rem; }
        #cert-print-root .cert-body .cert-row .cert-label { width: 6rem; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; flex-shrink: 0; }
        #cert-print-root .cert-body .cert-row .cert-value { font-size: 14px; font-weight: 600; color: #191F28; }
        #cert-print-root .cert-footer { padding-top: 3rem; text-align: center; }
        #cert-print-root .cert-footer .cert-closing { font-size: 14px; font-weight: 600; letter-spacing: 0.1em; margin-bottom: 1rem; }
        #cert-print-root .cert-footer .cert-date { font-size: 12px; font-weight: 700; color: #6b7280; margin-bottom: 1.5rem; }
        #cert-print-root .cert-footer .cert-sign { font-size: 1.25rem; font-weight: 600; font-style: italic; margin-top: 2rem; position: relative; display: inline-block; }
        #cert-print-root .cert-seal { position: absolute; right: -3rem; top: -0.5rem; width: 5rem; height: 5rem; border: 4px solid rgba(220,38,38,0.8); border-radius: 50%; display: flex; align-items: center; justify-content: center; transform: rotate(12deg); opacity: 0.9; font-size: 10px; font-weight: 600; color: rgba(220,38,38,0.9); text-align: center; line-height: 1.2; }
        @media print { body { background: #fff !important; padding: 0; } #cert-print-root { box-shadow: none; border: 1px solid #ccc; } }
      `;
      w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${certType}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600;700&display=swap" rel="stylesheet"><style>${printStyles}</style></head><body><div id="cert-print-root">${html}</div></body></html>`);
      w.document.close();
      w.print();
      w.close();
    }, 150);
  };

  useEffect(() => {
    if (!showHistory) return;
    (async () => {
      const { data } = await supabase.from('certificate_issuances').select('*, staff_members(name, company)').order('issued_at', { ascending: false }).limit(30);
      setHistoryList(data || []);
    })();
  }, [showHistory]);

  return (
    <div className="app-page p-4 md:p-10 space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--foreground)] tracking-tighter italic">디지털 증명서 발급 센터</h2>
          <p className="text-[10px] text-[var(--toss-blue)] font-bold mt-1 tracking-widest">직원 증명서 발급 허브</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowHistory(true)} className="px-5 py-2.5 bg-[var(--toss-card)] border border-[var(--toss-border)] text-[var(--toss-gray-4)] text-[11px] font-semibold rounded-xl shadow-sm hover:bg-[var(--toss-gray-1)] transition-all">발급 이력 조회</button>
          <button className="px-5 py-2.5 bg-[var(--foreground)] text-white text-[11px] font-semibold rounded-xl shadow-lg hover:scale-[0.98] transition-all">직인 설정</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* 설정 패널 */}
        <div className="lg:col-span-4 space-y-8">
          <div className="bg-[var(--toss-card)] p-8 rounded-[2.5rem] border border-[var(--toss-border)] shadow-xl space-y-8">
            <div className="space-y-4">
              <label className="text-[10px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">1. 발급 대상 직원</label>
              <select 
                onChange={(e) => setSelectedStaff(staffs.find((s:any) => s.id === e.target.value))}
                className="w-full p-5 bg-[var(--input-bg)] rounded-lg text-sm font-semibold border-none outline-none focus:ring-2 focus:ring-[var(--toss-blue)] transition-all"
              >
                <option value="">직원 선택...</option>
                {staffs.map((s:any) => <option key={s.id} value={s.id}>{s.name} ({s.department} / {s.position})</option>)}
              </select>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">2. 용도</label>
              <input type="text" value={purpose} onChange={e=>setPurpose(e.target.value)} placeholder="금융기관 제출용" className="w-full p-4 bg-[var(--input-bg)] rounded-lg text-sm font-bold border-none outline-none focus:ring-2 focus:ring-[var(--toss-blue)]" />
            </div>
            <div className="space-y-4">
              <label className="text-[10px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">3. 증명서 종류</label>
              <div className="grid grid-cols-1 gap-3">
                {CERTIFICATE_TYPES.map((c) => (
                  <button 
                    key={c.id} 
                    onClick={() => setCertType(c.id)}
                    className={`p-5 rounded-lg text-xs font-semibold border-2 text-left transition-all flex justify-between items-center ${certType === c.id ? 'border-[var(--toss-blue)] bg-[var(--toss-blue-light)] text-[var(--toss-blue)]' : 'border-[var(--toss-border)] text-[var(--toss-gray-3)] hover:border-[var(--toss-border)] bg-[var(--toss-gray-1)]/50'}`}
                  >
                    <span>{c.label}</span>
                    {certType === c.id && <span className="w-2 h-2 bg-[var(--toss-blue)] rounded-full animate-pulse"></span>}
                  </button>
                ))}
              </div>
            </div>

            <button 
              onClick={handleIssue}
              className="w-full py-6 bg-[var(--toss-blue)] text-white rounded-[2rem] font-semibold text-sm shadow-xl shadow-[var(--toss-blue)] hover:scale-[0.98] transition-all"
            >
              ⚡ 증명서 즉시 발급
            </button>
          </div>

          <div className="bg-orange-50 p-6 rounded-[2rem] border border-orange-100">
            <p className="text-[10px] font-semibold text-orange-800 uppercase mb-2">💡 발급 안내</p>
            <p className="text-[10px] text-orange-700 font-bold leading-relaxed">
              발급된 증명서는 고유 번호가 부여되며, 위변조 방지를 위한 디지털 직인이 자동으로 포함됩니다.
            </p>
          </div>
        </div>

        {/* 미리보기 패널 */}
        <div className="lg:col-span-8 bg-[var(--toss-card)] rounded-[3rem] p-8 md:p-16 border border-[var(--toss-border)] shadow-2xl flex flex-col items-center justify-center relative overflow-hidden min-h-[800px]">
          <div className="absolute top-8 right-8 bg-[var(--foreground)] text-white px-4 py-1.5 text-[10px] font-semibold rounded-full tracking-widest">PREVIEW</div>
          
          {selectedStaff ? (
            <div ref={printRef} className="w-full max-w-[600px] bg-[var(--toss-card)] shadow-2xl p-12 md:p-20 space-y-12 text-center border border-[var(--toss-border)] relative animate-in zoom-in-95 duration-500">
              {/* 워터마크: 발급 대상 직원 소속 회사 (인쇄창 스타일용 클래스) */}
              <div className="cert-watermark absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none select-none">
                <p className="text-9xl font-semibold -rotate-45">{selectedStaff.company || 'SY INC.'}</p>
              </div>

              <div className="cert-header space-y-2">
                <p className="cert-no text-[10px] font-semibold text-[var(--toss-gray-3)] tracking-[0.5em]">제 {serialNo || '2026-0001'} 호</p>
                <h4 className="cert-title text-4xl font-semibold tracking-[0.3em] text-[var(--foreground)] border-b-4 border-[var(--foreground)] pb-4 inline-block">{certType}</h4>
              </div>

              <div className="cert-body text-left space-y-8 pt-10">
                <div className="grid grid-cols-1 gap-6">
                  <div className="cert-row flex border-b border-[var(--toss-border)] pb-2">
                    <span className="cert-label w-24 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">성 명</span>
                    <span className="cert-value text-sm font-semibold text-[var(--foreground)]">{selectedStaff.name}</span>
                  </div>
                  <div className="cert-row flex border-b border-[var(--toss-border)] pb-2">
                    <span className="cert-label w-24 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">소 속</span>
                    <span className="cert-value text-sm font-semibold text-[var(--foreground)]">{selectedStaff.company} / {selectedStaff.department}</span>
                  </div>
                  <div className="cert-row flex border-b border-[var(--toss-border)] pb-2">
                    <span className="cert-label w-24 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">직 위</span>
                    <span className="cert-value text-sm font-semibold text-[var(--foreground)]">{selectedStaff.position}</span>
                  </div>
                  <div className="cert-row flex border-b border-[var(--toss-border)] pb-2">
                    <span className="cert-label w-24 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">재직기간</span>
                    <span className="cert-value text-sm font-semibold text-[var(--foreground)]">{workPeriod}</span>
                  </div>
                  {(certType === '급여인증서' || certType === '소득금액증명원' || certType === '원천징수영수증') && (
                    <div className="cert-row flex border-b border-[var(--toss-border)] pb-2">
                      <span className="cert-label w-24 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">월 급여액</span>
                      <span className="cert-value text-sm font-semibold text-[var(--foreground)]">{totalPay.toLocaleString()}원</span>
                    </div>
                  )}
                  <div className="cert-row flex border-b border-[var(--toss-border)] pb-2">
                    <span className="cert-label w-24 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">용 도</span>
                    <span className="cert-value text-sm font-semibold text-[var(--foreground)]">{purpose}</span>
                  </div>
                </div>

                <div className="cert-footer pt-24 text-center space-y-10">
                  <p className="cert-closing text-sm font-semibold text-[var(--foreground)] tracking-widest">{certClosingText[certType] || '위와 같이 증명함.'}</p>
                  <p className="cert-date text-xs font-bold text-[var(--toss-gray-3)]">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  
                  <div className="cert-sign-wrap relative inline-block pt-10">
                    <p className="cert-sign text-2xl font-semibold tracking-tighter text-[var(--foreground)] italic">{selectedStaff.company || 'SY INC.'} 대표이사 박철홍</p>
                    <div className="cert-seal absolute -right-12 -top-2 w-20 h-20 border-4 border-red-600/80 rounded-full flex items-center justify-center rotate-12 opacity-80">
                      <div className="text-[10px] font-semibold text-red-600/80 text-center leading-tight">
                        {selectedStaff.company || 'SY INC.'}<br/>대표이사<br/>박철홍
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-6 opacity-20">
              <p className="text-8xl">📄</p>
              <p className="text-sm font-semibold text-[var(--foreground)] uppercase tracking-widest">Select Target to Preview</p>
            </div>
          )}
        </div>
      </div>

      {showHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4" onClick={() => setShowHistory(false)}>
          <div className="bg-[var(--toss-card)] rounded-lg p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">발급 이력</h3>
            <div className="space-y-2">
              {historyList.map((r) => (
                <div key={r.id} className="flex justify-between items-center py-2 border-b text-sm">
                  <span>{r.staff_members?.name} · {r.cert_type}</span>
                  <span className="text-[var(--toss-gray-3)]">{r.serial_no} · {new Date(r.issued_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setShowHistory(false)} className="mt-4 w-full py-3 bg-[var(--foreground)] text-white font-semibold rounded-xl">닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}
