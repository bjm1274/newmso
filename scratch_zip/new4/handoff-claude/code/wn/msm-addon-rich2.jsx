// MSO 모바일 — OP체크 · 수술상담 · 퇴원심사 (PC 기능 1:1 이식)
// 원본: redesign/screen-addon.jsx (AddonOpCheck/AddonConsult/AddonDischarge)
const { useState: useAdd2State } = React;

/* ───────── OP체크 ───────── */
const OP_PATIENTS = [
  { name: '임영화', age: 69, op: '우측 ★mako TKR [로봇 슬관절 인공관절 전치환술]', room: '미정', chart: '10179', time: '09:00', status: '준비완료', tone: 'success' },
  { name: '김지석', age: 58, op: '좌측 ORIF — 척골 골절', room: 'OR-2', chart: '10184', time: '10:30', status: '준비중', tone: 'warn' },
  { name: '박현주', age: 72, op: 'AS 척추유합술 L4-L5', room: 'OR-1', chart: '10186', time: '13:00', status: '수술중', tone: 'danger' },
  { name: '오민호', age: 45, op: 'pen — 우측 비골 골절 ORIF', room: 'OR-3', chart: '10188', time: '15:00', status: '대기', tone: 'muted' },
];
const OP_STEPS = ['준비중', '준비완료', '수술중', '완료'];
const OP_STEP_IDX = { 준비중: 0, 준비완료: 1, 수술중: 2, 완료: 3, 대기: 0 };

function OpCheckModule() {
  const [sel, setSel] = useAdd2State(0);
  const [pre, setPre] = useAdd2State({ 0: true, 1: true });
  const p = OP_PATIENTS[sel];
  const stepIdx = OP_STEP_IDX[p.status];
  const preItems = ['금식 확인', '마취 동의서', '수술 부위 표시', '약물 알러지 확인', '보호자 동석 확인'];
  const togglePre = (i) => setPre(o => ({ ...o, [i]: !o[i] }));

  return (
    <>
      <div className="mm-sub">5월 12일 (화) — 수술 환자별 준비·체크리스트 단계 관리</div>
      {/* 상태 필터 */}
      <div className="glm-chiprow" style={{ display: 'flex', gap: 7, overflowX: 'auto' }}>
        {['전체', '준비중', '준비완료', '수술중', '완료'].map((t, i) => (
          <button key={t} className={'glm-chip' + (i === 0 ? ' on' : '')}>{t} <span className="ccnt">{[4, 1, 1, 1, 0][i]}</span></button>
        ))}
      </div>
      {/* 환자 선택 스트립 */}
      <div className="pt-strip">
        {OP_PATIENTS.map((q, i) => (
          <button key={i} className={'pt-card' + (i === sel ? ' on' : '')} onClick={() => setSel(i)}>
            <div className="pt-card-top"><span className="pt-card-nm">{q.name}</span><span className="pt-card-time">{q.time}</span></div>
            <div className="pt-card-op">{q.op}</div>
            <div className="pt-card-meta"><span>방 {q.room}</span><span>·</span><span>차트 {q.chart}</span><span className={'msm-badge ' + q.tone} style={{ marginLeft: 'auto' }}>{q.status}</span></div>
          </button>
        ))}
      </div>
      {/* 상세 */}
      <div className="msm-card">
        <div style={{ fontSize: 16, fontWeight: 800 }}>{p.name} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--z-500)' }}>· 차트 {p.chart}</span></div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--z-500)', marginTop: 3, marginBottom: 14 }}>{p.op}</div>
        <div className="op-steps">
          {OP_STEPS.map((s, i) => (
            <React.Fragment key={i}>
              <div className={'op-step' + (i < stepIdx ? ' done' : i === stepIdx ? ' on' : '')}>
                <div className="num">{i < stepIdx ? <Icon name="check" size={14} /> : i + 1}</div>
                <div className="nm">{s}</div>
              </div>
              {i < OP_STEPS.length - 1 && <div className={'op-line' + (i < stepIdx ? ' done' : '')} />}
            </React.Fragment>
          ))}
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--z-400)', marginTop: 12, textAlign: 'center' }}>마취 유형 <b style={{ color: 'var(--z-600)' }}>전신마취</b> · 템플릿 0개</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="msm-btn-lg accent" style={{ height: 44 }}><Icon name="check" size={16} /> 준비 완료 처리</button>
          <button className="msm-btn-lg" style={{ height: 44, flex: '0 0 auto', width: 100 }}>메시지</button>
        </div>
      </div>
      {/* 수술 전 준비 체크 */}
      <div className="msm-card">
        <div className="msm-sec" style={{ padding: 0, marginBottom: 4 }}><span className="msm-sec-t">수술 전 준비 체크</span><button className="msm-sec-more">＋ 추가</button></div>
        <div className="op-checks">
          {preItems.map((c, i) => (
            <div key={i} className={'op-check' + (pre[i] ? ' on' : '')} onClick={() => togglePre(i)}>
              <span className="box">{pre[i] && <Icon name="check" size={13} />}</span>
              <span className="lbl">{c}</span>
            </div>
          ))}
        </div>
      </div>
      {/* 수술 중 소모품 */}
      <div className="msm-card">
        <div className="msm-sec" style={{ padding: 0, marginBottom: 8 }}><span className="msm-sec-t">수술 중 의료소모품</span><button className="msm-sec-more">＋ 추가</button></div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--z-400)' }}>실제 사용한 소모품을 체크하고 수량·메모를 남깁니다.</div>
      </div>
      {/* 메모 */}
      <div className="msm-card">
        <div className="msm-sec" style={{ padding: 0, marginBottom: 8 }}><span className="msm-sec-t">환자별 메모</span></div>
        <textarea className="glm-textarea" placeholder="수술 전/중 특이사항, 추가 준비 요청, 소모품 사용 메모..." style={{ minHeight: 80 }} />
      </div>
    </>
  );
}

/* ───────── 수술상담 (음성 녹음 + AI 분석) ───────── */
const CS_PATIENTS = [
  { name: '송봉운', dob: '1948-06-12', op: 'TKR (양측 무릎)', doc: '박철홍', date: '5/12 10:30', state: '예정', tone: 'accent', consent: '대기' },
  { name: '박근식', dob: '1962-03-22', op: 'AS 척추유합술 L4-L5', doc: '박철홍', date: '5/12 14:00', state: '예정', tone: 'accent', consent: '대기' },
  { name: '곽유진', dob: '1955-09-08', op: 'mako TKR (좌)', doc: '박철홍', date: '5/13 09:00', state: '동의완료', tone: 'success', consent: '완료' },
  { name: '허경진', dob: '1970-12-30', op: 'pen ORIF (비골)', doc: '김지오', date: '5/14 11:00', state: '예정', tone: 'accent', consent: '보류' },
  { name: '박성민', dob: '1949-04-17', op: 'uni 단측 인공관절', doc: '박철홍', date: '5/15 13:30', state: '재상담', tone: 'warn', consent: '대기' },
];
const CS_ANALYSIS = [
  { l: '수술 명·범위 설명', ok: true, ts: '00:01:24' },
  { l: '합병증·부작용 설명', ok: false, note: '언급 없음 — 추가 설명 필요' },
  { l: '대체 치료법 안내', ok: true, ts: '00:04:48' },
  { l: '예상 회복 기간', ok: true, ts: '00:06:12' },
  { l: '예상 비용 안내', ok: true, ts: '00:08:40' },
  { l: '보호자 입회 확인', ok: true, ts: '00:11:02' },
  { l: '환자 질문 응답', ok: true, ts: '00:12:18' },
];
const CS_WAVE = [6, 8, 12, 10, 14, 18, 16, 12, 10, 14, 16, 18, 20, 16, 12, 10, 14, 18, 12, 8, 10, 12, 14, 16, 18, 12, 10, 14, 16, 18, 14, 10];

function ConsultModule() {
  const [sel, setSel] = useAdd2State(0);
  const [rec, setRec] = useAdd2State(false);
  const [analyzed, setAnalyzed] = useAdd2State(true);
  const p = CS_PATIENTS[sel];
  const okCount = CS_ANALYSIS.filter(a => a.ok).length;

  return (
    <>
      <div className="mm-sub">오늘 상담 5건 · 예정 11건 · 동의 미완료 7건 · 재상담 2건</div>
      {/* KPI */}
      <div className="mm-kpis">
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--accent-soft)', color: 'var(--accent-700)' }}><Icon name="chat" size={16} /></span><div className="info"><div className="lbl">오늘 상담</div><div className="sub">예정+진행</div></div><div className="v">5<small>건</small></div></div>
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--success-soft)', color: '#047857' }}><Icon name="checkCircle" size={16} /></span><div className="info"><div className="lbl">동의 완료</div><div className="sub">이번 달</div></div><div className="v">23<small>건</small></div></div>
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--warning-soft)', color: '#B45309' }}><Icon name="clock" size={16} /></span><div className="info"><div className="lbl">동의 미완료</div><div className="sub">24h 내</div></div><div className="v" style={{ color: '#B45309' }}>7<small>건</small></div></div>
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><Icon name="alertTri" size={16} /></span><div className="info"><div className="lbl">재상담</div><div className="sub">환자 요청</div></div><div className="v" style={{ color: 'var(--danger)' }}>2<small>건</small></div></div>
      </div>
      {/* 상태 필터 */}
      <div className="glm-chiprow" style={{ display: 'flex', gap: 7, overflowX: 'auto' }}>
        {['전체', '예정', '완료', '재상담'].map((t, i) => <button key={t} className={'glm-chip' + (i === 0 ? ' on' : '')}>{t}</button>)}
      </div>
      {/* 환자 스트립 */}
      <div className="pt-strip">
        {CS_PATIENTS.map((q, i) => (
          <button key={i} className={'pt-card' + (i === sel ? ' on' : '')} onClick={() => setSel(i)}>
            <div className="pt-card-top"><span className="pt-card-nm">{q.name}</span><span className="pt-card-time">{q.date}</span></div>
            <div className="pt-card-op">{q.op}</div>
            <div className="pt-card-meta">
              <span className={'msm-badge ' + q.tone}>{q.state}</span>
              <span className={'msm-badge ' + (q.consent === '완료' ? 'success' : q.consent === '보류' ? 'danger' : 'warn')} style={{ marginLeft: 'auto' }}>동의 {q.consent}</span>
            </div>
          </button>
        ))}
      </div>
      {/* 상세 헤더 */}
      <div className="msm-sec"><span className="msm-sec-t">{p.name} — {p.date}</span><span className={'msm-badge ' + p.tone} style={{ marginLeft: 'auto' }}>{p.state}</span></div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--z-500)', marginTop: -6 }}>{p.op} · 상담의 {p.doc} 병원장</div>
      {/* 음성 녹음 + AI 분석 */}
      <div className="msm-sec"><span className="msm-sec-t">음성 녹음 + AI 분석</span><span className="msm-badge warn" style={{ marginLeft: 6 }}>베타</span></div>
      <div className="rec-panel">
        <div className="rec-top">
          <button className="rec-btn" style={{ background: rec ? 'var(--z-700)' : 'var(--danger)' }} onClick={() => setRec(r => !r)}>
            <span className="rec-dot" style={{ animation: rec ? 'wnpulse 1.4s infinite' : 'none' }} />{rec ? '녹음 중지' : '녹음 시작'}
          </button>
          <span className="rec-time">00:14:23</span>
        </div>
        <div className="rec-wave">{CS_WAVE.map((h, i) => <i key={i} style={{ height: h, background: i < 22 ? 'var(--accent)' : 'rgba(255,255,255,0.25)' }} />)}</div>
        <div className="rec-file">
          <Icon name="check" size={15} color="var(--success)" />
          <div style={{ flex: 1, minWidth: 0 }}><div className="nm">상담_송봉운_20260511_1410.wav</div><div className="sub">14:23 · 분석 완료 · 동의서 {okCount}/7 충족</div></div>
          <button className="msm-mini-btn" style={{ background: 'rgba(255,255,255,0.12)', borderColor: 'transparent', color: '#fff' }}>재생</button>
        </div>
      </div>
      {/* AI 분석 결과 */}
      <div className="ra-panel">
        <div className="ra-title"><Icon name="checkCircle" size={15} /> AI 분석 결과 — {okCount} / 7 항목 충족</div>
        {CS_ANALYSIS.map((r, i) => (
          <div key={i} className={'ra-item ' + (r.ok ? 'ok' : 'no')}>
            <span className="ic"><Icon name={r.ok ? 'check' : 'x'} size={13} /></span>
            <span style={{ flex: 1 }}>{r.l}</span>
            {r.ok ? <span className="ts">{r.ts}</span> : <span className="note">{r.note}</span>}
          </div>
        ))}
      </div>
      {/* 동의서 */}
      <div className="msm-sec"><span className="msm-sec-t">동의서</span></div>
      <div className="cs-doc">
        <Icon name="fileText" size={20} color="var(--accent)" />
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 700 }}>수술 동의서 (양식 v2.1)</div><div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--z-500)' }}>전자서명 미완료 · 24시간 내 필요</div></div>
        <button className="msm-mini-btn solid">서명 요청</button>
      </div>
      {/* 메모 + 완료 */}
      <div className="msm-sec"><span className="msm-sec-t">상담 메모</span></div>
      <textarea className="glm-textarea" placeholder="환자 우려사항, 보호자 질문, 합의 내용 등을 기록하세요..." style={{ minHeight: 80 }} />
      <button className="msm-btn-lg accent"><Icon name="check" size={16} /> 상담 완료 처리</button>
    </>
  );
}

/* ───────── 퇴원심사 (3-세그먼트) ───────── */
const DC_ROWS = [
  { name: '송봉운', tag: 'ORIF/건보', dept: '정형외과', days: 14, items: 720, progress: 651, date: '5/11' },
  { name: '박근식', tag: 'AS/건보', dept: '정형외과', days: 4, items: 389, progress: 346, date: '5/11' },
  { name: '곽유진', tag: 'TKR/건보/마코', dept: '정형외과', days: 14, items: 820, progress: 749, date: '5/11' },
  { name: '허경진', tag: 'pen', dept: '정형외과', days: 14, items: 744, progress: 571, date: '5/11' },
  { name: '박성민', tag: 'uni/건보', dept: '정형외과', days: 15, items: 832, progress: 735, date: '5/6' },
];
const DC_FIELDS = [['환자명', '검색 또는 입력', true], ['생년월일', '0000-00-00'], ['성별', '선택'], ['진료과', '정형외과', true], ['입원일', '0000-00-00', true], ['퇴원 예정일', '2026-05-11'], ['보험 구분', '선택'], ['주치의', '김OO'], ['병실 등급', '선택'], ['수술명', '수술 없음']];
const DC_TPLS = [['TKR (인공관절 전치환술)', 720], ['ORIF (골절 정복)', 389], ['AS (척추유합술)', 820], ['일반 정형외과', 412], ['내과 입원', 365], ['종합검진 패키지', 280]];

function DischargeModule() {
  const [mode, setMode] = useAdd2State('list');
  return (
    <>
      <div className="mm-seg">
        <button className={mode === 'list' ? 'on' : ''} onClick={() => setMode('list')}>심사 목록</button>
        <button className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>새 심사</button>
        <button className={mode === 'setting' ? 'on' : ''} onClick={() => setMode('setting')}>기본 항목</button>
      </div>

      {mode === 'list' && (
        <>
          <div className="mm-kpis">
            <div className="mm-kpi"><span className="ic" style={{ background: 'var(--accent-soft)', color: 'var(--accent-700)' }}><Icon name="fileText" size={16} /></span><div className="info"><div className="lbl">진행 중</div><div className="sub">심사 중</div></div><div className="v">7<small>건</small></div></div>
            <div className="mm-kpi"><span className="ic" style={{ background: 'var(--success-soft)', color: '#047857' }}><Icon name="checkCircle" size={16} /></span><div className="info"><div className="lbl">완료</div><div className="sub">이번 주</div></div><div className="v">12<small>건</small></div></div>
            <div className="mm-kpi"><span className="ic" style={{ background: 'var(--warning-soft)', color: '#B45309' }}><Icon name="alertTri" size={16} /></span><div className="info"><div className="lbl">평균 진행률</div><div className="sub">항목 채움</div></div><div className="v">88<small>%</small></div></div>
            <div className="mm-kpi"><span className="ic" style={{ background: 'var(--accent-soft)', color: 'var(--accent-700)' }}><Icon name="calendar" size={16} /></span><div className="info"><div className="lbl">신규 신청</div><div className="sub">오늘</div></div><div className="v">4<small>건</small></div></div>
          </div>
          <div className="msm-list">
            {DC_ROWS.map((r, i) => {
              const pct = Math.round(r.progress / r.items * 100);
              return (
                <div key={i} className="dc-row">
                  <div className="dc-row-top">
                    <span className="msm-badge warn">심사 중</span>
                    <span className="dc-row-nm">{r.name}</span>
                    <span className="msm-badge muted">{r.tag}</span>
                    <span className="dc-frac"><b>{r.progress}</b>/{r.items}</span>
                  </div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--z-400)' }}>{r.dept} · {r.days}일 · {pct}% 진행</div>
                  <div className="msm-prog"><i className={pct >= 85 ? 'success' : 'warn'} style={{ width: pct + '%' }} /></div>
                </div>
              );
            })}
          </div>
          <button className="msm-btn-lg accent" onClick={() => setMode('new')}><Icon name="plus" size={16} /> 새 심사 등록</button>
        </>
      )}

      {mode === 'new' && (
        <>
          <div className="mm-sub">필수 항목(*)을 모두 채워야 저장됩니다.</div>
          <div className="dc-form-grid">
            {DC_FIELDS.map(([l, p, req], i) => (
              <div key={i} className="dc-field"><label>{l}{req && <span className="req"> *</span>}</label><input className="glm-input" placeholder={p} /></div>
            ))}
          </div>
          <div className="dc-field"><label>동반 질환</label><input className="glm-input" placeholder="고혈압, 당뇨, 심부전..." /></div>
          <div className="dc-field"><label>상병명 (진단코드)</label><textarea className="glm-textarea" placeholder="예: M17.1 원발성 무릎관절증  I10 고혈압" style={{ minHeight: 80 }} /></div>
          <div className="dc-field"><label>진단명 / 입원 사유 (템플릿)</label><select className="mm-select" style={{ width: '100%' }}><option>-- 템플릿 선택 --</option></select></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="msm-btn-lg" onClick={() => setMode('list')}>취소</button>
            <button className="msm-btn-lg accent"><Icon name="check" size={16} /> 심사 등록</button>
          </div>
        </>
      )}

      {mode === 'setting' && (
        <>
          <div className="mm-sub">진단명·수술명별 템플릿을 만들어두면 새 심사 등록이 빨라집니다.</div>
          <div className="msm-list">
            {DC_TPLS.map(([t, n], i) => (
              <div key={i} className="dc-tpl">
                <div className="dc-tpl-nm">{t}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--z-400)', marginTop: 3 }}>{n}개 항목 · 최근 사용 {i + 1}일 전</div>
                <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
                  <button className="msm-mini-btn">템플릿 열기</button>
                  <button className="msm-mini-btn">수정</button>
                </div>
              </div>
            ))}
          </div>
          <button className="msm-btn-lg accent"><Icon name="plus" size={16} /> 템플릿 추가</button>
        </>
      )}
    </>
  );
}

Object.assign(window, { OpCheckModule, ConsultModule, DischargeModule });
