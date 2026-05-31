// MSO 모바일 — 추가기능 5개 모듈 (PC 기능 1:1 이식)
// 원본: redesign/screen-addon.jsx (AddonHandoff/AddonOrg/AddonInventory/AddonEvaluation), redesign/feature-worknow.jsx
const { useState: useAddState, useMemo: useAddMemo } = React;

const AV_TONES = ['#2563EB', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#0E7490', '#DB2777'];
const avTone = (s) => AV_TONES[(s || '').charCodeAt(0) % AV_TONES.length];

/* ───────── 1. 인계노트 (캘린더 + 공통/환자별 입력 + 인계 리스트) ───────── */
function NoteModule() {
  const today = 11;
  const [sel, setSel] = useAddState(11);
  const [view, setView] = useAddState('common');
  const [calOpen, setCalOpen] = useAddState(false);
  const cal = Array.from({ length: 31 }, (_, i) => i + 1);
  const pad = [null, null, null, null, null]; // 2026-05-01 = 금요일(앞 5칸)
  const items = [
    { tag1: 'Day', tone1: 'accent', tag2: '일반', tag3: '공통', team: '병동팀1', at: '5/11 07:47', body: '야간 인계 — 임영화 환자 OR 일정 변경, 9시→10시로 조정. 진통제 PRN 추가.' },
    { tag1: 'Eve', tone1: 'warn', tag2: '주의', tag3: '공통', team: '병동팀2', at: '5/11 15:21', body: '박지영 환자(202호) 발열 38.2°C — 의료진 호출, 항생제 투여 중. 다음 인계 시 재측정 필요.' },
    { tag1: 'Day', tone1: 'accent', tag2: '일반', tag3: '공통', team: '병동팀1', at: '5/10 19:00', body: '야간 응급실 환자 입원 처리 완료. 5층 5503호.' },
  ];
  return (
    <>
      <div className="mm-sub">2026년 5월 11일 월요일 — 인계 4건 · 환자별 2명 · 검색 8건</div>
      {/* 캘린더 (기본 접힘) */}
      <div className="msm-card" style={{ padding: 0 }}>
        <button className="msm-acc-head" style={{ width: '100%' }} onClick={() => setCalOpen(o => !o)}>
          <Icon name="calendar" size={17} color="var(--z-500)" />
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--z-800)' }}>2026년 5월</span>
          <span className="msm-badge accent" style={{ marginLeft: 4 }}>{sel}일 선택</span>
          <span className={'chev' + (calOpen ? ' open' : '')} style={{ marginLeft: 'auto', color: 'var(--z-300)', transition: 'transform .2s', transform: calOpen ? 'rotate(90deg)' : 'none' }}><Icon name="chevR" size={18} /></span>
        </button>
        {calOpen && (
          <div style={{ padding: '0 14px 14px' }}>
            <div className="mm-cal">
              {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => <div key={d} className={'mm-cal-h' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>{d}</div>)}
              {pad.map((_, i) => <div key={'p' + i} className="mm-cal-d empty" />)}
              {cal.map(d => <button key={d} className={'mm-cal-d' + (d === sel ? ' on' : '') + (d < today ? ' past' : '')} onClick={() => setSel(d)}>{d}</button>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
              <div className="mm-ministat"><div className="l">선택일 공통</div><div className="v">4건</div></div>
              <div className="mm-ministat"><div className="l">환자별 인계</div><div className="v">2명</div></div>
              <div className="mm-ministat"><div className="l">검색 결과</div><div className="v">8건</div></div>
            </div>
          </div>
        )}
      </div>
      {/* 입력 폼 */}
      <div className="msm-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="mm-seg">
          <button className={view === 'common' ? 'on' : ''} onClick={() => setView('common')}>공통 인계</button>
          <button className={view === 'patient' ? 'on' : ''} onClick={() => setView('patient')}>환자별 인계사항</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="mm-select" style={{ flex: 1 }}><option>Day</option><option>Evening</option><option>Night</option></select>
          <select className="mm-select" style={{ flex: 1 }}><option>일반</option><option>주의</option></select>
        </div>
        <textarea className="glm-textarea" placeholder={view === 'common' ? '공통 인계 내용을 자세히 입력해주세요' : '환자별 인계사항을 입력해주세요'} style={{ minHeight: 96 }} />
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--z-400)' }}>미완료 상태면 이후 날짜에도 계속 표시됩니다.</div>
        <button className="msm-btn-lg accent" style={{ height: 46 }}><Icon name="check" size={16} /> {view === 'common' ? '공통' : '환자별'} 인계 등록</button>
      </div>
      {/* 인계 리스트 */}
      <div className="msm-sec"><span className="msm-sec-t">공통 인계</span><span className="msm-sec-more" style={{ color: 'var(--z-400)' }}>4건</span></div>
      <div className="msm-list">
        {items.map((it, i) => (
          <div key={i} className="mm-ho-item">
            <div className="mm-ho-tags">
              <span className={'msm-badge ' + it.tone1}>{it.tag1}</span>
              <span className="msm-badge muted">{it.tag2}</span>
              <span className="msm-badge accent">{it.tag3}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--z-400)', marginLeft: 'auto' }}>{it.team} · {it.at}</span>
            </div>
            <div className="mm-ho-body">{it.body}</div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ───────── 2. 조직도 (병원장→관리자→부서그룹→팀→직원, 다중 병원) ───────── */
const GROUP_TONE = { blue: '#2563EB', green: '#10B981', orange: '#F59E0B', violet: '#7C3AED' };
const TEAM_TONE = { cyan: '#0E7490', gray: '#52525B', plain: '#71717A', green: '#10B981', pink: '#DB2777', purple: '#7C3AED', orange: '#F59E0B' };

function OrgEmp({ name, role, on }) {
  return (
    <div className="org-emp">
      <span className="org-pic sm" style={{ background: avTone(name) }}>{name[0]}<span className={'pdot ' + (on ? 'on' : 'off')} /></span>
      <div style={{ minWidth: 0 }}><div className="nm">{name}</div><div className="role">{role}</div></div>
    </div>
  );
}
function OrgTeam({ name, count, tone, emps }) {
  return (
    <div>
      <div className="org-team-h"><span className="tdot" style={{ background: TEAM_TONE[tone] || '#71717A' }} /><span className="tn">{name}</span><span className="tc">{count}명</span></div>
      <div className="org-emp-grid" style={{ marginTop: 7 }}>
        {emps.map(e => <OrgEmp key={e.n} name={e.n} role={e.r} on={e.on} />)}
      </div>
    </div>
  );
}
function OrgGroup({ name, teams, count, tone, children, empty }) {
  return (
    <div className="org-group">
      <div className="org-group-band" style={{ background: GROUP_TONE[tone] || '#71717A' }}>
        <span className="gn">{name}</span><span className="gc">{teams}팀 · {count}명</span>
      </div>
      <div className="org-group-body">{empty ? <div className="org-empty">팀원 없음</div> : children}</div>
    </div>
  );
}

function OrgModule() {
  return (
    <>
      <div className="mm-sub">박철홍정형외과 · 수연의원 — 다중 병원 통합 조직</div>
      <div className="glm-search" style={{ position: 'relative', display: 'flex' }}>
        <Icon name="search" size={16} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--z-400)' }} />
        <input className="msm-th-field" style={{ width: '100%', height: 42, borderRadius: 12, paddingLeft: 38, border: '1px solid var(--border)', background: '#fff' }} placeholder="이름·부서·직급 검색" />
      </div>

      <div className="org-hosp">
        <div className="org-hosp-head">
          <div><div className="org-hosp-nm">박철홍정형외과</div><div className="org-hosp-sub">재직 37명 · 근무중 5명</div></div>
          <span className="org-hosp-tag">ORG</span>
        </div>
        {/* 병원장 */}
        <div className="org-card">
          <span className="org-pic" style={{ background: '#2563EB' }}>박<span className="pdot off" /></span>
          <div><div className="nm big">박철홍</div><div className="role">병원장</div></div>
          <span className="st">● 출근 전</span>
        </div>
        {/* 관리자 */}
        <div>
          <div className="org-mgr-label" style={{ marginBottom: 6 }}>관리자</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="org-card"><span className="org-pic sm" style={{ background: avTone('지') }}>지<span className="pdot off" /></span><div><div className="nm">지민수</div><div className="role">실장 · 외래팀</div></div><span className="st">● 출근 전</span></div>
            <div className="org-card"><span className="org-pic sm" style={{ background: avTone('김') }}>김<span className="pdot off" /></span><div><div className="nm">김지오</div><div className="role">간호과장 · 외래팀</div></div><span className="st">● 출근 전</span></div>
          </div>
        </div>
        {/* 부서그룹 */}
        <OrgGroup name="간호부" teams={4} count={23} tone="blue">
          <OrgTeam name="병동팀" count={10} tone="cyan" emps={[{ n: '이가연', r: '사원' }, { n: '김수지', r: '사원' }, { n: '조현준', r: '사원', on: true }, { n: '최민정', r: '사원' }, { n: '이승현', r: '사원', on: true }, { n: '반민정', r: '사원', on: true }]} />
          <OrgTeam name="수술팀" count={4} tone="gray" emps={[{ n: '정가영', r: '사원' }, { n: '박소연', r: '사원' }, { n: '이대성', r: '사원' }, { n: '김규빈', r: '사원' }]} />
          <OrgTeam name="검사팀" count={3} tone="plain" emps={[{ n: '최찬', r: '사원' }, { n: '김영대', r: '사원' }, { n: '김재영', r: '사원' }]} />
          <OrgTeam name="외래팀" count={6} tone="green" emps={[{ n: '박지영', r: '사원' }, { n: '이은혜', r: '사원', on: true }, { n: '박하연', r: '사원' }, { n: '송소현', r: '사원' }]} />
        </OrgGroup>
        <OrgGroup name="진료부" teams={0} count={0} tone="green" empty />
        <OrgGroup name="총무부" teams={3} count={8} tone="orange">
          <OrgTeam name="원무팀" count={2} tone="pink" emps={[{ n: '한지혜', r: '사원' }, { n: '박민지', r: '사원' }]} />
          <OrgTeam name="관리팀" count={2} tone="purple" emps={[{ n: '윤연이', r: '사원' }, { n: '하순정', r: '사원' }]} />
          <OrgTeam name="영양팀" count={4} tone="orange" emps={[{ n: '조숙현', r: '사원' }, { n: '방영란', r: '사원', on: true }, { n: '박유진', r: '사원' }, { n: '박은안', r: '사원' }]} />
        </OrgGroup>
        <OrgGroup name="기타" teams={1} count={3} tone="violet">
          <OrgTeam name="부서 미지정" count={3} tone="plain" emps={[{ n: '병동팀1', r: '사원' }, { n: '외래팀1', r: '사원' }, { n: '수술팀1', r: '직급 미지정' }]} />
        </OrgGroup>
      </div>

      <div className="org-hosp">
        <div className="org-hosp-head">
          <div><div className="org-hosp-nm">수연의원</div><div className="org-hosp-sub">재직 4명 · 근무중 0명</div></div>
          <span className="org-hosp-tag">ORG</span>
        </div>
        <OrgGroup name="간호부" teams={2} count={3} tone="blue">
          <OrgTeam name="외래팀" count={2} tone="green" emps={[{ n: '이주리', r: '사원' }, { n: '김다은', r: '사원' }]} />
          <OrgTeam name="병동팀" count={1} tone="cyan" emps={[{ n: '오세영', r: '사원' }]} />
        </OrgGroup>
      </div>

      <button className="org-add"><Icon name="plus" size={17} /> 새 회사·병원 추가</button>
    </>
  );
}

/* ───────── 3. 근무현황 (시프트 밴드별 그룹 + 월간 캘린더) ───────── */
const WN_SHIFTS = {
  d1: { name: '일반근무 (외래)', start: '08:30', end: '17:30', band: 'D' },
  d2: { name: '병동 데이', start: '07:00', end: '15:00', band: 'D' },
  e1: { name: '병동 이브닝', start: '14:30', end: '22:30', band: 'E' },
  n1: { name: '병동 나이트', start: '22:00', end: '07:00', band: 'N' },
  o1: { name: '영양팀 조기', start: '06:00', end: '14:00', band: 'D' },
  x1: { name: '경영지원 시차', start: '10:00', end: '19:00', band: 'D' },
};
const WN_BAND = { D: { lbl: 'Day', t: 'accent' }, E: { lbl: 'Evening', t: 'warn' }, N: { lbl: 'Night', t: 'violet' }, O: { lbl: '기타', t: 'success' } };
const WN_STAFFS = [
  { name: '박철홍', role: '병원장', dept: '진료팀', primary: 'd1', extras: [], in: '09:02' },
  { name: '김지오', role: '간호과장', dept: '외래팀', primary: 'd1', extras: ['d2'], in: '08:48' },
  { name: '이은혜', role: '사원', dept: '외래팀', primary: 'd1', extras: [], in: '08:50' },
  { name: '박지영', role: '사원', dept: '외래팀', primary: 'd1', extras: [], in: '08:55' },
  { name: '최찬', role: '사원', dept: '검사팀', primary: 'd1', extras: [], in: '09:00' },
  { name: '김수지', role: '수간호사', dept: '병동팀', primary: 'd2', extras: ['e1', 'n1'], in: '07:45' },
  { name: '이가연', role: '사원', dept: '병동팀', primary: 'd2', extras: ['e1'], in: '07:50' },
  { name: '윤서연', role: '사원', dept: '병동팀', primary: 'e1', extras: ['d2'], in: '14:25' },
  { name: '임소현', role: '사원', dept: '병동팀', primary: 'e1', extras: [], in: '14:30' },
  { name: '한지수', role: '사원', dept: '병동팀', primary: 'n1', extras: [], in: '21:55' },
  { name: '조숙현', role: '팀장', dept: '영양팀', primary: 'o1', extras: [], in: '06:30' },
  { name: '방영란', role: '사원', dept: '영양팀', primary: 'o1', extras: [], in: '06:45' },
  { name: '백정민', role: '이사', dept: '경영지원팀', primary: 'x1', extras: [], in: '08:30' },
  { name: '홍자비', role: '주임', dept: '경영지원팀', primary: 'x1', extras: [], in: '09:10' },
];

function WorkNowModule() {
  const [dept, setDept] = useAddState('전체');
  const depts = ['전체', ...Array.from(new Set(WN_STAFFS.map(s => s.dept)))];
  const filtered = WN_STAFFS.filter(s => dept === '전체' || s.dept === dept);
  // 시프트 밴드별 그룹
  const groups = useAddMemo(() => {
    const m = new Map();
    filtered.forEach(s => { if (!m.has(s.primary)) m.set(s.primary, []); m.get(s.primary).push(s); });
    const order = { D: 0, E: 1, N: 2, O: 3 };
    return Array.from(m.entries()).map(([sid, staffs]) => ({ sid, shift: WN_SHIFTS[sid], staffs, band: WN_SHIFTS[sid]?.band || 'O' }))
      .sort((a, b) => order[a.band] - order[b.band]);
  }, [dept]);
  const activeCount = filtered.length;
  // 월간 캘린더 (5월)
  const cells = [];
  for (let i = 0; i < 5; i++) cells.push(null); // 5/1 = 금
  for (let d = 1; d <= 31; d++) cells.push(d);
  const dayCount = (d) => {
    if (d === 12) return activeCount;
    const wd = new Date(2026, 4, d).getDay();
    if (wd === 0) return Math.min(4, activeCount);
    if (wd === 6) return Math.min(10, activeCount);
    return Math.max(activeCount - (d % 3 === 0 ? 1 : 0), 1);
  };

  return (
    <>
      <div className="mm-sub">박철홍정형외과 · 27명 중 {activeCount}명 근무중 · 마지막 갱신 14:23:05<span className="wn-pulse"><i /></span></div>
      {/* 부서 필터 칩 */}
      <div className="glm-chiprow" style={{ display: 'flex', gap: 7, overflowX: 'auto' }}>
        {depts.slice(0, 9).map(d => <button key={d} className={'glm-chip' + (dept === d ? ' on' : '')} onClick={() => setDept(d)}>{d}</button>)}
      </div>
      {/* 현재 근무중 */}
      <div className="msm-sec"><span className="msm-sec-t">● 현재 근무중</span><span className="msm-sec-more" style={{ color: 'var(--z-400)' }}>{dept} · {activeCount}명</span></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {groups.length === 0 ? <div className="msm-empty"><Icon name="clock" size={24} />현재 근무중인 직원이 없습니다.</div> : groups.map(g => {
          const b = WN_BAND[g.band];
          return (
            <div key={g.sid} className={'wn-shiftcard b-' + b.t}>
              <div className="wn-sc-head">
                <div>
                  <span className={'wn-band-badge b-' + b.t}>현재 근무중 · {b.lbl}</span>
                  <div className="wn-sc-name">{g.shift?.name}</div>
                  <div className="wn-sc-time">{g.shift?.start} – {g.shift?.end}</div>
                </div>
                <span className="wn-count">{g.staffs.length}명</span>
              </div>
              <div className="wn-staffs">
                {g.staffs.map(s => (
                  <div key={s.name} className="wn-staff">
                    <div className="wn-staff-row"><span className="wn-staff-nm">{s.name}</span></div>
                    <div className="wn-staff-meta">{s.role} · {s.dept} · 출근 {s.in}</div>
                    <div className="wn-chips">
                      <span className="wn-schip primary">{WN_SHIFTS[s.primary]?.name}</span>
                      {s.extras.map(e => <span key={e} className="wn-schip">{WN_SHIFTS[e]?.name}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {/* 월간 캘린더 */}
      <div className="msm-sec" style={{ marginTop: 4 }}><span className="msm-sec-t">월간 캘린더</span><span className="msm-sec-more" style={{ color: 'var(--z-400)' }}>2026년 5월</span></div>
      <div className="wn-monthcal">
        <div className="mm-cal" style={{ marginBottom: 4 }}>
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => <div key={d} className={'mm-cal-h' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>{d}</div>)}
        </div>
        <div className="mm-cal">
          {cells.map((d, i) => {
            if (!d) return <div key={'e' + i} className="wn-mc-d empty" />;
            const wd = new Date(2026, 4, d).getDay();
            return (
              <div key={d} className={'wn-mc-d' + (d === 12 ? ' today sel' : '') + (wd === 0 ? ' sun' : '') + (wd === 6 ? ' sat' : '')}>
                <span className="dn">{d}</span><span className="cn">{dayCount(d)}명</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* ───────── 4. 부서별 재고 (부서 셀렉터 + 주 기준 + 발주) ───────── */
const INV_DEPTS = [
  { id: 'mso', name: 'MSO 본사 (자재)', isMSO: true, count: 8421 },
  { id: 'ou', name: '외래팀', isMSO: false, count: 312 },
  { id: 'wd', name: '병동팀', isMSO: false, count: 489 },
  { id: 'la', name: '검사팀', isMSO: false, count: 124 },
  { id: 'nu', name: '영양팀', isMSO: false, count: 87 },
];
const INV_DEPT_ROWS = [
  { name: '(3M) 아바가드 손 소독제 (의)', type: '소모품', qty: 0, weekly: 5, unit: '병' },
  { name: '(3M) 테가덤 (급) /K6100003', type: '의료기기', qty: 0, weekly: 5, unit: '개' },
  { name: '(BD) 루어락주사기 1cc (산)', type: '소모품', qty: 0, weekly: 5, unit: '개' },
  { name: '(BNG) 드레싱키트 (급)', type: '의료기기', qty: 6, weekly: 5, unit: '개' },
  { name: '(DS) 유린메타 (급)', type: '의료기기', qty: 15, weekly: 4, unit: '개' },
  { name: '(MS) 압박용 밴드 (비)', type: '의료기기', qty: 24, weekly: 6, unit: '개' },
];

function InvModule() {
  const [deptIdx, setDeptIdx] = useAddState(1);
  const [mode, setMode] = useAddState('view');
  const [weeks, setWeeks] = useAddState(() => INV_DEPT_ROWS.map(() => 2));
  const dept = INV_DEPTS[deptIdx];
  const rows = INV_DEPT_ROWS.map((r, i) => {
    const w = weeks[i] || 2; const min = r.weekly * w;
    return { ...r, weeks: w, min, action: r.qty < min ? Math.max(min - r.qty, 0) : 0 };
  });
  const need = rows.filter(r => r.qty < r.min).length;
  const ok = rows.length - need;
  const setW = (i, w) => setWeeks(prev => { const n = [...prev]; n[i] = w; return n; });

  return (
    <>
      <div className="mm-toolbar">
        <select className="mm-select" style={{ flex: 1 }} value={deptIdx} onChange={e => setDeptIdx(+e.target.value)}>
          {INV_DEPTS.map((d, i) => <option key={d.id} value={i}>{d.name}</option>)}
        </select>
      </div>
      <div className="mm-sub">{dept.isMSO ? '거래처별 발주서 일괄 생성·발송 흐름' : '실시간 재고 ↔ MSO 본사 발주 요청 흐름'}</div>
      {/* KPI */}
      <div className="mm-kpis">
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--accent-soft)', color: 'var(--accent-700)' }}><Icon name="package" size={16} /></span><div className="info"><div className="lbl">전체 품목</div><div className="sub">{dept.name}</div></div><div className="v">{dept.count.toLocaleString()}<small>종</small></div></div>
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><Icon name="alertTri" size={16} /></span><div className="info"><div className="lbl">발주 필요</div><div className="sub">잔여 &lt; 최소</div></div><div className="v" style={{ color: 'var(--danger)' }}>{need}<small>종</small></div></div>
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--success-soft)', color: '#047857' }}><Icon name="checkCircle" size={16} /></span><div className="info"><div className="lbl">정상</div><div className="sub">충분 보유</div></div><div className="v">{ok}<small>종</small></div></div>
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--warning-soft)', color: '#B45309' }}><Icon name="clock" size={16} /></span><div className="info"><div className="lbl">{dept.isMSO ? '발주 대기' : 'MSO 요청'}</div><div className="sub">{dept.isMSO ? '외부 큐' : '본사 확인'}</div></div><div className="v">{dept.isMSO ? 14 : 6}<small>건</small></div></div>
      </div>
      {/* 모드 세그먼트 */}
      <div className="mm-seg">
        <button className={mode === 'view' ? 'on' : ''} onClick={() => setMode('view')}>재고 보기</button>
        <button className={mode === 'setting' ? 'on' : ''} onClick={() => setMode('setting')}>기준 설정 (주)</button>
      </div>
      {/* 품목 리스트 */}
      <div className="msm-list">
        {rows.map((r, i) => {
          const danger = r.qty < r.min;
          const coverage = r.weekly ? (r.qty / r.weekly).toFixed(1) : '-';
          return (
            <div key={i} className={'inv-item' + (danger ? ' danger' : '')}>
              <div className="inv-top">
                <div className="inv-nm">{r.name}</div>
                <span className={'msm-badge ' + (r.type === '의료기기' ? 'accent' : 'muted')}>{r.type}</span>
              </div>
              <div className="inv-metrics">
                <div className="inv-metric"><div className="ml">잔여</div><div className={'mv' + (danger ? ' danger' : '')}>{r.qty}<small>{r.unit} · {coverage}주</small></div></div>
                <div className="inv-metric"><div className="ml">주간 소비</div><div className="mv">{r.weekly}<small>{r.unit}/주</small></div></div>
                <div className="inv-metric"><div className="ml">최소재고</div><div className="mv">{r.min}<small>{r.unit}</small></div></div>
              </div>
              <div className="inv-foot">
                {mode === 'setting' ? (
                  <div className="inv-week-seg">
                    {[1, 2, 3, 4].map(w => <button key={w} className={r.weeks === w ? 'on' : ''} onClick={() => setW(i, w)}>{w}주</button>)}
                  </div>
                ) : (
                  <>
                    <span className={'msm-badge ' + (danger ? 'danger' : 'success')}>{danger ? '발주 필요' : '정상'}</span>
                    {danger && <button className="msm-mini-btn solid" style={{ marginLeft: 'auto' }}>{dept.isMSO ? `발주서에 ${r.action}개` : `MSO에 ${r.action}개`}</button>}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <button className="msm-btn-lg accent"><Icon name="send" size={16} /> {dept.isMSO ? '자동 발주 일괄 → 발주서 생성' : `MSO 일괄 발주 요청 (${need})`}</button>
    </>
  );
}

/* ───────── 5. 직원평가 (직원 선택 + 기록유형 + 슬라이더 + 히스토리) ───────── */
const EV_EMPLOYEES = [
  { name: '박철홍', team: '진료팀 · 병원장' }, { name: '이가연', team: '병동팀 · 사원' },
  { name: '김수지', team: '병동팀 · 사원' }, { name: '박지영', team: '외래팀 · 사원' },
  { name: '이은혜', team: '외래팀 · 사원' }, { name: '최찬', team: '검사팀 · 사원' },
  { name: '백정민', team: '경영지원팀 · 이사' }, { name: '조숙현', team: '영양팀 · 사원' },
];
const EV_TYPES = [{ k: '성과', t: 'accent' }, { k: '문제사항', t: 'danger' }, { k: '칭찬', t: 'success' }, { k: '주의', t: 'warn' }, { k: '기타', t: 'muted' }];
const EV_TYPE_TONE = { 성과: 'accent', 주의: 'warn', 칭찬: 'success', 문제사항: 'danger', 기타: 'muted' };
const EV_HISTORY = [
  { type: '성과', score: 4, body: '5월 진료 일정 조율 적극적, 환자 클레임 0건', at: '2026-05-08' },
  { type: '주의', score: 2, body: '근태 — 지각 3회 발생, 면담 예정', at: '2026-05-01' },
  { type: '칭찬', score: 5, body: 'OP체크 템플릿 정리에 큰 기여', at: '2026-04-22' },
];

function EvalModule() {
  const [sel, setSel] = useAddState(0);
  const [type, setType] = useAddState('성과');
  const [score, setScore] = useAddState(3);
  const e = EV_EMPLOYEES[sel];
  const [team, role] = e.team.split(' · ');
  return (
    <>
      <div className="mm-sub">직원별 성과·문제사항·칭찬·주의를 실시간 기록·누적 관리</div>
      {/* 직원 선택 드롭다운 */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--z-600)', marginBottom: 8 }}>평가 대상 직원</div>
        <select className="mm-select" style={{ width: '100%' }} value={sel} onChange={ev => setSel(+ev.target.value)}>
          {EV_EMPLOYEES.map((emp, i) => <option key={emp.name} value={i}>{emp.name} — {emp.team}</option>)}
        </select>
      </div>
      {/* 선택 직원 + 입력 폼 */}
      <div className="msm-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <span className="org-pic" style={{ background: avTone(e.name) }}>{e.name[0]}</span>
          <div style={{ flex: 1 }}><div style={{ fontSize: 16, fontWeight: 800 }}>{e.name} <span className="msm-badge muted">{role}</span></div><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--z-500)' }}>{team} 소속</div></div>
          <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, color: 'var(--z-400)', fontWeight: 600 }}>기록자</div><div style={{ fontSize: 12.5, fontWeight: 800 }}>백정민 이사</div></div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--z-600)', marginBottom: 8 }}>기록 유형</div>
          <div className="ev-typechips">
            {EV_TYPES.map(t => <button key={t.k} className={'ev-typechip t-' + t.t + (type === t.k ? ' on' : '')} onClick={() => setType(t.k)}>{t.k}</button>)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--z-600)', marginBottom: 8 }}>평정 점수 (1–5)</div>
          <div className="ev-slider-row">
            <input className="ev-slider" type="range" min="1" max="5" value={score} onChange={ev => setScore(+ev.target.value)} />
            <span className="ev-score">{score}</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--z-600)', marginBottom: 8 }}>상세 기록 사항</div>
          <textarea className="glm-textarea" placeholder="업무 성과, 태도 변화, 발생한 이슈 등을 구체적으로 기록하세요..." style={{ minHeight: 90 }} />
        </div>
        <button className="msm-btn-lg accent" style={{ height: 46 }}><Icon name="check" size={16} /> 실시간 기록 저장</button>
      </div>
      {/* 히스토리 */}
      <div className="msm-sec"><span className="msm-sec-t">평가 기록 히스토리</span><span className="msm-sec-more" style={{ color: 'var(--z-400)' }}>{EV_HISTORY.length}건 · 최신순</span></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {EV_HISTORY.map((h, i) => (
          <div key={i} className="ev-hist">
            <div className="ev-hist-top">
              <span className={'ev-pill t-' + EV_TYPE_TONE[h.type]}>{h.type}</span>
              <span className="ev-hist-stars">{'★'.repeat(h.score)}<span className="off">{'★'.repeat(5 - h.score)}</span></span>
              <span className="ev-hist-date">{h.at}</span>
            </div>
            <div className="ev-hist-body">{h.body}</div>
          </div>
        ))}
      </div>
    </>
  );
}

Object.assign(window, { NoteModule, OrgModule, WorkNowModule, InvModule, EvalModule });
