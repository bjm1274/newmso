'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { CERTIFICATE_TYPES } from '@/lib/certificate-types';

function formatDate(d: string | null) {
  if (!d) return '현재';
  const date = new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

export default function CertificateGenerator({ staffs = [], selectedCo = '전체' }: any) {
  const filteredStaffs = staffs.filter((s: any) => selectedCo === '전체' || s.company === selectedCo);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [certType, setCertType] = useState('재직증명서');
  const [purpose, setPurpose] = useState('금융기관 제출용');
  const [serialNo, setSerialNo] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const printRef = useRef<HTMLDivElement>(null);
  const [seals, setSeals] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.from('contract_templates').select('company_name, seal_url').then(({ data }) => {
      if (data) {
        const map: Record<string, string> = {};
        data.forEach(d => { if (d.seal_url && d.company_name) map[d.company_name] = d.seal_url; });
        setSeals(map);
      }
    });
  }, []);

  const joined = selectedStaff?.joined_at || selectedStaff?.join_date;
  const resigned = selectedStaff?.resigned_at;
  const workPeriod = joined ? `${formatDate(joined)} ~ ${resigned ? formatDate(resigned) : formatDate(new Date().toISOString())}` : '-';
  const baseSalary = selectedStaff?.base_salary ?? selectedStaff?.base ?? 0;
  const totalPay = baseSalary + (selectedStaff?.meal_allowance ?? selectedStaff?.meal ?? 0);

  const certClosingText: Record<string, string> = {
    재직증명서: '위와 같이 재직 중임을 증명함.',
    경력증명서: '위와 같이 경력을 증명함.',
    퇴직증명서: '위와 같이 퇴직하였음을 증명함.',
    급여인증서: '위와 같이 급여를 지급한 사실을 증명함.',
    보수지급명세서: '위와 같이 보수를 지급한 사실을 증명함.',
    연봉금액확인서: '위와 같이 연봉 계약 금액을 확인하며 이를 증명함.',
    근무확인서: '위와 같이 근무하였음을 확인함.',
    '직무교육 이수확인서': '위와 같은 사내 직무 교육 과정을 충실히 이수하였음을 증명함.',
    원천징수영수증: '본 문서는 내부 확인용이며, 위와 같이 원천징수 되었음을 증명함.',
    소득금액증명원: '본 문서는 내부 확인용이며, 위와 같이 소득금액을 증명함.',
    근로소득원천징수필증: '위와 같이 근로소득을 원천징수 하였음을 증명함.',
  };

  const handleIssue = async () => {
    if (!selectedStaff) return alert("발급 대상을 선택해주세요.");
    const sn = `CERT-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(Date.now()).slice(-6)}`;
    setSerialNo(sn);
    const u = typeof window !== 'undefined' ? (() => { try { return JSON.parse(localStorage.getItem('erp_user') || '{}'); } catch { return {}; } })() : {};
    try {
      await supabase.from('certificate_issuances').insert({
        staff_id: selectedStaff.id,
        cert_type: certType,
        serial_no: sn,
        purpose,
        issued_by: u.id,
      });
    } catch (_) { }
    setTimeout(() => {
      if (!printRef.current) return;
      const html = printRef.current.innerHTML.replace('제 2026-0001', `제 ${sn}`).replace(/2026-0001/g, sn);
      const w = window.open('', '_blank');
      if (!w) return;
      const printStyles = `
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;700&display=swap');
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; }
        body { font-family: 'Noto Serif KR', serif; padding: 0; margin: 0; background: #fff; color: #111; }
        #cert-print-root { width: 210mm; min-height: 297mm; padding: 30mm 25mm; margin: 0 auto; background: #fff; position: relative; display: flex; flex-direction: column; }
        .cert-watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0.02; pointer-events: none; font-size: 120px; font-weight: 700; transform: rotate(-45deg); white-space: nowrap; }
        .cert-header { text-align: center; margin-bottom: 40px; }
        .cert-no { font-size: 13px; font-weight: 400; color: #666; text-align: left; margin-bottom: 15px; }
        .cert-title { font-size: 48px; font-weight: 700; letter-spacing: 15px; border-bottom: 3px double #000; padding-bottom: 10px; display: inline-block; margin-top: 10px; }
        .cert-body { flex: 1; padding-top: 40px; }
        .cert-table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
        .cert-row { display: flex; border-bottom: 1px solid #ddd; padding: 12px 0; align-items: center; }
        .cert-label { width: 120px; font-size: 15px; font-weight: 700; color: #444; }
        .cert-value { font-size: 17px; font-weight: 400; color: #000; flex: 1; }
        .cert-footer { margin-top: auto; padding-top: 60px; text-align: center; }
        .cert-closing { font-size: 18px; font-weight: 700; letter-spacing: 2px; margin-bottom: 40px; }
        .cert-date { font-size: 16px; font-weight: 400; margin-bottom: 60px; }
        .cert-sign-area { position: relative; display: inline-block; margin-top: 80px; padding-right: 20px; line-height: 1; }
        .cert-sign-text { font-size: 32px; font-weight: 700; position: relative; z-index: 2; letter-spacing: 2px; }
        .cert-seal-img { position: absolute; right: -35px; top: -15px; width: 85px; height: 85px; object-fit: contain; mix-blend-mode: multiply; z-index: 1; opacity: 0.95; }
        @media print { body { padding: 0; } #cert-print-root { border: none; width: 100%; height: 100%; } }
      `;
      w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${certType}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600;700&display=swap" rel="stylesheet"><style>${printStyles}</style></head><body><div id="cert-print-root">
        <div class="cert-no">제 ${sn} 호</div>
        <div class="cert-header"><h1 class="cert-title">${certType}</h1></div>
        <div class="cert-body">${html.split('<div class="cert-body')[1].split('</div>\n                </div>')[0]}</div>
        <div class="cert-footer">
          <p class="cert-closing">${certClosingText[certType] || '위와 같이 증명함.'}</p>
          <p class="cert-date">${formatDate(new Date().toISOString())}</p>
          <div class="cert-sign-area">
            <span class="cert-sign-text">${selectedStaff.company || 'SY INC.'}</span>
            ${seals[selectedStaff.company || '전체'] ? `<img src="${seals[selectedStaff.company || '전체']}" class="cert-seal-img" />` : ''}
          </div>
        </div>
      </div></body></html>`);
      w.document.close();
      w.print();
      w.close();
    }, 150);
  };

  useEffect(() => {
    if (!showHistory) return;
    (async () => {
      let query = supabase.from('certificate_issuances').select('*, staff_members(name, company)');
      if (selectedCo !== '전체') {
        query = query.filter('staff_members.company', 'eq', selectedCo);
      }
      const { data } = await query.order('issued_at', { ascending: false }).limit(30);
      setHistoryList(data || []);
    })();
  }, [showHistory]);

  return (
    <div className="app-page p-4 md:p-10 space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--foreground)] tracking-tight">디지털 증명서 발급 센터</h2>
          <p className="text-[11px] text-[var(--toss-blue)] font-bold mt-1 tracking-widest">직원 증명서 발급 허브</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowHistory(true)} className="px-5 py-2.5 bg-[var(--toss-card)] border border-[var(--toss-border)] text-[var(--toss-gray-4)] text-[11px] font-semibold rounded-[16px] shadow-sm hover:bg-[var(--toss-gray-1)] transition-all">발급 이력 조회</button>
          <button className="px-5 py-2.5 bg-[var(--foreground)] text-white text-[11px] font-semibold rounded-[16px] shadow-lg hover:scale-[0.98] transition-all">직인 설정</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* 설정 패널 */}
        <div className="lg:col-span-4 space-y-8">
          <div className="bg-[var(--toss-card)] p-8 rounded-[2.5rem] border border-[var(--toss-border)] shadow-xl space-y-8">
            <div className="space-y-4">
              <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">1. 발급 대상 직원</label>
              <select
                onChange={(e) => setSelectedStaff(staffs.find((s: any) => s.id === e.target.value))}
                className="w-full p-5 bg-[var(--input-bg)] rounded-[12px] text-sm font-semibold border-none outline-none focus:ring-2 focus:ring-[var(--toss-blue)] transition-all"
              >
                <option value="">직원 선택...</option>
                {filteredStaffs.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.department} / {s.position})</option>)}
              </select>
            </div>

            <div className="space-y-4">
              <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">2. 용도</label>
              <input type="text" value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="금융기관 제출용" className="w-full p-4 bg-[var(--input-bg)] rounded-[12px] text-sm font-bold border-none outline-none focus:ring-2 focus:ring-[var(--toss-blue)]" />
            </div>
            <div className="space-y-4">
              <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">3. 증명서 종류</label>
              <div className="grid grid-cols-1 gap-3">
                {CERTIFICATE_TYPES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCertType(c.id)}
                    className={`p-5 rounded-[12px] text-xs font-semibold border-2 text-left transition-all flex justify-between items-center ${certType === c.id ? 'border-[var(--toss-blue)] bg-[var(--toss-blue-light)] text-[var(--toss-blue)]' : 'border-[var(--toss-border)] text-[var(--toss-gray-3)] hover:border-[var(--toss-border)] bg-[var(--toss-gray-1)]/50'}`}
                  >
                    <span>{c.label}</span>
                    {certType === c.id && <span className="w-2 h-2 bg-[var(--toss-blue)] rounded-full animate-pulse"></span>}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleIssue}
              className="w-full py-6 bg-[var(--toss-blue)] text-white rounded-[16px] font-semibold text-sm shadow-xl shadow-[var(--toss-blue)] hover:scale-[0.98] transition-all"
            >
              ⚡ 증명서 즉시 발급
            </button>
          </div>

          <div className={`p-6 rounded-[20px] transition-all duration-300 border ${certType === '원천징수영수증' || certType === '소득금액증명원' ? 'bg-amber-50 border-amber-100 shadow-sm' : 'bg-blue-50 border-blue-100 shadow-sm'}`}>
            <p className={`text-[11px] font-black uppercase mb-2 ${certType === '원천징수영수증' || certType === '소득금액증명원' ? 'text-amber-800' : 'text-blue-800'}`}>
              {certType === '원천징수영수증' || certType === '소득금액증명원' ? '⚠️ 공식 서류 안내' : '💡 발급 안내'}
            </p>
            <p className={`text-[11px] font-bold leading-relaxed ${certType === '원천징수영수증' || certType === '소득금액증명원' ? 'text-amber-700' : 'text-blue-700'}`}>
              {certType === '원천징수영수증' || certType === '소득금액증명원'
                ? '본 증명서는 내부 확인용 약식 문서입니다. 금융기관/관공서 제출을 위한 공식 문서는 홈택스(Hometax)를 통해 발급받으시기 바랍니다.'
                : '발급된 증명서는 고유 번호가 부여되며, 위변조 방지를 위한 디지털 직인이 자동으로 포함됩니다.'}
            </p>
          </div>
        </div>

        {/* 미리보기 패널 */}
        <div className="lg:col-span-8 bg-[var(--toss-card)] rounded-[3rem] p-8 md:p-16 border border-[var(--toss-border)] shadow-2xl flex flex-col items-center justify-center relative overflow-hidden min-h-[800px]">
          <div className="absolute top-8 right-8 bg-[var(--foreground)] text-white px-4 py-1.5 text-[11px] font-semibold rounded-full tracking-widest">PREVIEW</div>

          {selectedStaff ? (
            <div ref={printRef} className="w-full max-w-[600px] bg-[var(--toss-card)] shadow-2xl p-12 md:p-20 space-y-12 text-center border border-[var(--toss-border)] relative animate-in zoom-in-95 duration-500">
              {/* 워터마크: 발급 대상 직원 소속 회사 (인쇄창 스타일용 클래스) */}
              <div className="cert-watermark absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none select-none">
                <p className="text-9xl font-semibold -rotate-45">{selectedStaff.company || 'SY INC.'}</p>
              </div>

              <div className="cert-header space-y-2">
                <p className="cert-no text-[11px] font-semibold text-[var(--toss-gray-3)] tracking-[0.5em]">제 {serialNo || '2026-0001'} 호</p>
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
                  <p className="cert-closing text-[15px] font-black text-[var(--foreground)] tracking-[0.05em]">{certClosingText[certType] || '위와 같이 증명함.'}</p>
                  <p className="cert-date text-[13px] font-black text-[var(--toss-gray-3)]">{formatDate(new Date().toISOString())}</p>

                  <div className="cert-sign-wrap relative inline-block pt-24 text-right pr-6">
                    <p className="cert-sign text-3xl font-black tracking-widest text-[var(--foreground)] relative z-10">{selectedStaff.company || 'SY INC.'}</p>
                    {seals[selectedStaff.company || '전체'] ? (
                      <img
                        src={seals[selectedStaff.company || '전체']}
                        alt="seal"
                        className="absolute -right-6 top-8 w-28 h-28 object-contain mix-blend-multiply opacity-95 z-0"
                      />
                    ) : (
                      <div className="absolute -right-8 top-10 w-28 h-28 border-4 border-red-600/60 rounded-full flex items-center justify-center rotate-12 opacity-60 z-0">
                        <div className="text-[14px] font-bold text-red-600/60 text-center leading-tight">
                          {selectedStaff.company || 'SY'}<br />대표인
                        </div>
                      </div>
                    )}
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
          <div className="bg-[var(--toss-card)] rounded-[12px] p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">발급 이력</h3>
            <div className="space-y-2">
              {historyList.map((r) => (
                <div key={r.id} className="flex justify-between items-center py-2 border-b text-sm">
                  <span>{r.staff_members?.name} · {r.cert_type}</span>
                  <span className="text-[var(--toss-gray-3)]">{r.serial_no} · {new Date(r.issued_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setShowHistory(false)} className="mt-4 w-full py-3 bg-[var(--foreground)] text-white font-semibold rounded-[16px]">닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}
