// MSO redesign — 근무현황 (AFTER 모드)
// 커밋된 app/main/기능부품/근무현황.tsx 사양 반영:
//   - 현재 근무중: 시프트(Day/Evening/Night/기타) 밴드별 그룹
//   - 월간 캘린더: 날짜별 인원 카운트, 클릭 시 상세 모달
//   - 다중 근무유형 칩 (주근무/부근무)
//   - 부서 필터 + 빠른 칩 + "오늘 근무중만" 토글
//   - 마지막 갱신 시각 (실시간 반영 인디케이터)

// ─────────────────────────── 더미 데이터 ───────────────────────────
const WN_TODAY = new Date(2026, 4, 12); // 2026-05-12 (화)
const WN_TODAY_KEY = '2026-05-12';

const WN_SHIFTS = [
  { id: 'd1', name: '일반근무 (외래)',  start: '08:30', end: '17:30', band: 'D' },
  { id: 'd2', name: '병동 데이',        start: '07:00', end: '15:00', band: 'D' },
  { id: 'e1', name: '병동 이브닝',      start: '14:30', end: '22:30', band: 'E' },
  { id: 'n1', name: '병동 나이트',      start: '22:00', end: '07:00', band: 'N' },
  { id: 'o1', name: '영양팀 조기',      start: '06:00', end: '14:00', band: 'D' },
  { id: 'x1', name: '경영지원 시차',    start: '10:00', end: '19:00', band: 'D' },
];

const WN_STAFFS = [
  { id: 's1',  name: '박철홍', role: '병원장',   dept: '진료팀',     primary: 'd1', extras: [] },
  { id: 's2',  name: '김지오', role: '간호과장', dept: '외래팀',     primary: 'd1', extras: ['d2'] },
  { id: 's3',  name: '지민수', role: '실장',     dept: '외래팀',     primary: 'd1', extras: [] },
  { id: 's4',  name: '이은혜', role: '사원',     dept: '외래팀',     primary: 'd1', extras: [] },
  { id: 's5',  name: '박지영', role: '사원',     dept: '외래팀',     primary: 'd1', extras: [] },
  { id: 's6',  name: '김수지', role: '수간호사', dept: '병동팀',     primary: 'd2', extras: ['e1','n1'] },
  { id: 's7',  name: '이가연', role: '사원',     dept: '병동팀',     primary: 'd2', extras: ['e1'] },
  { id: 's8',  name: '조현준', role: '사원',     dept: '병동팀',     primary: 'd2', extras: [] },
  { id: 's9',  name: '윤서연', role: '사원',     dept: '병동팀',     primary: 'e1', extras: ['d2'] },
  { id: 's10', name: '임소현', role: '사원',     dept: '병동팀',     primary: 'e1', extras: [] },
  { id: 's11', name: '한지수', role: '사원',     dept: '병동팀',     primary: 'n1', extras: [] },
  { id: 's12', name: '최찬',   role: '사원',     dept: '검사팀',     primary: 'd1', extras: [] },
  { id: 's13', name: '강민호', role: '사원',     dept: '검사팀',     primary: 'd1', extras: [] },
  { id: 's14', name: '조숙현', role: '팀장',     dept: '영양팀',     primary: 'o1', extras: [] },
  { id: 's15', name: '방영란', role: '사원',     dept: '영양팀',     primary: 'o1', extras: [] },
  { id: 's16', name: '백정민', role: '이사',     dept: '경영지원팀', primary: 'x1', extras: [] },
  { id: 's17', name: '홍자비', role: '주임',     dept: '경영지원팀', primary: 'x1', extras: [] },
];

// 출근 (check-in 있고 check-out 없음 = 현재 근무중)
const WN_ACTIVE_IDS = new Set(['s1','s2','s4','s5','s6','s7','s9','s10','s11','s12','s14','s15','s16','s17']);
const WN_CHECKIN = {
  s1:'09:02', s2:'08:48', s4:'08:50', s5:'08:55', s6:'07:45', s7:'07:50',
  s9:'14:25', s10:'14:30', s11:'21:55', s12:'09:00', s14:'06:30', s15:'06:45',
  s16:'08:30', s17:'09:10',
};

// 월간 배정 (선택일별 staff_id 배열) — 5월
const WN_ASSIGNMENTS = (() => {
  const map = {};
  const days = 31;
  for (let d = 1; d <= days; d += 1) {
    const key = `2026-05-${String(d).padStart(2,'0')}`;
    const wd = new Date(2026, 4, d).getDay();
    if (wd === 0) { map[key] = ['s6','s11','s14','s15']; continue; } // 일요일 최소 인원
    // 평일 + 토요일 기본 배정
    const base = ['s1','s2','s3','s4','s5','s6','s7','s9','s10','s11','s12','s13','s14','s15','s16','s17'];
    // 일부 변동
    if (d % 3 === 0) base.splice(2, 1); // 한 명 빠짐
    if (wd === 6) base.length = 10;     // 토요일 축소
    map[key] = base;
  }
  return map;
})();

const WN_BAND_LABEL = { D:'Day', E:'Evening', N:'Night', O:'기타' };
const WN_BAND_TONE  = { D:'accent', E:'warn', N:'violet', O:'success' };

const wnInferBand = (shift) => shift?.band || 'O';
const wnFormatRange = (shift) => shift ? `${shift.start} – ${shift.end}` : '–';
const wnFmtMonth = (date) => `${date.getFullYear()}년 ${date.getMonth()+1}월`;
const wnFmtDisplay = (date) => {
  const wd = ['일','월','화','수','목','금','토'][date.getDay()];
  return `${date.getFullYear()}년 ${date.getMonth()+1}월 ${date.getDate()}일 (${wd})`;
};
const wnKey = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const wnMonthGrid = (date) => {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last  = new Date(date.getFullYear(), date.getMonth()+1, 0);
  const cells = [];
  for (let i = 0; i < first.getDay(); i += 1) cells.push(null);
  for (let d = 1; d <= last.getDate(); d += 1) cells.push(new Date(date.getFullYear(), date.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

// ─────────────────────────── 메인 ───────────────────────────
const AddonWorkNowAfter = () => {
  const [dept, setDept] = React.useState('전체');
  const [activeOnly, setActiveOnly] = React.useState(false);
  const [selDate, setSelDate] = React.useState(WN_TODAY);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [lastSync] = React.useState('14:23:05');

  const shiftMap = React.useMemo(() => Object.fromEntries(WN_SHIFTS.map(s => [s.id, s])), []);
  const allDepts = React.useMemo(() => Array.from(new Set(WN_STAFFS.map(s => s.dept))), []);
  const filteredStaffs = React.useMemo(
    () => WN_STAFFS.filter(s => dept === '전체' || s.dept === dept),
    [dept]
  );
  const filteredIds = React.useMemo(() => new Set(filteredStaffs.map(s => s.id)), [filteredStaffs]);

  // 현재 근무중 — 시프트 밴드별 그룹
  const activeGroups = React.useMemo(() => {
    const groups = new Map();
    filteredStaffs.forEach((s) => {
      if (!WN_ACTIVE_IDS.has(s.id)) return;
      const shift = shiftMap[s.primary];
      if (!groups.has(s.primary)) groups.set(s.primary, { shift, staffs: [] });
      groups.get(s.primary).staffs.push(s);
    });
    const order = { D:0, E:1, N:2, O:3 };
    return Array.from(groups.entries())
      .map(([sid, g]) => ({ sid, ...g, band: wnInferBand(g.shift) }))
      .sort((a, b) => (order[a.band] - order[b.band]) || (b.staffs.length - a.staffs.length));
  }, [filteredStaffs, shiftMap]);

  const activeCount = activeGroups.reduce((acc, g) => acc + g.staffs.length, 0);

  // 캘린더 날짜별 카운트
  const dayCount = React.useCallback((key) => {
    const ids = WN_ASSIGNMENTS[key] || [];
    return ids.filter(id => filteredIds.has(id)).length;
  }, [filteredIds]);

  // 모달용: 선택일 시프트별 그룹
  const selDateGroups = React.useMemo(() => {
    const key = wnKey(selDate);
    const ids = (WN_ASSIGNMENTS[key] || []).filter(id => filteredIds.has(id));
    const idToStaff = Object.fromEntries(WN_STAFFS.map(s => [s.id, s]));
    const groups = new Map();
    ids.forEach((id) => {
      const s = idToStaff[id]; if (!s) return;
      if (activeOnly && wnKey(selDate) === WN_TODAY_KEY && !WN_ACTIVE_IDS.has(id)) return;
      const shift = shiftMap[s.primary];
      if (!groups.has(s.primary)) groups.set(s.primary, { shift, staffs: [] });
      groups.get(s.primary).staffs.push(s);
    });
    const counts = { D:0, E:0, N:0, O:0, total:0 };
    groups.forEach((g) => {
      const band = wnInferBand(g.shift);
      counts[band] += g.staffs.length;
      counts.total += g.staffs.length;
    });
    const order = { D:0, E:1, N:2, O:3 };
    const rows = Array.from(groups.entries())
      .map(([sid, g]) => ({ sid, ...g, band: wnInferBand(g.shift) }))
      .sort((a, b) => (order[a.band] - order[b.band]) || (b.staffs.length - a.staffs.length));
    return { rows, counts };
  }, [selDate, filteredIds, shiftMap, activeOnly]);

  const isToday = wnKey(selDate) === WN_TODAY_KEY;
  const cells = wnMonthGrid(selDate);

  return (
    <>
      <div className="addon-pageheader">
        <div>
          <div className="addon-h1">실시간 근무현황</div>
          <div className="addon-sub">
            박철홍정형외과 · 27명 중 {activeCount}명 근무중 · 마지막 갱신 {lastSync}
            <span className="wn-pulse"><span/></span>
          </div>
        </div>
        <div className="row" style={{gap: 8}}>
          <select className="input" value={dept} onChange={(e) => setDept(e.target.value)}>
            <option>전체</option>
            {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <button
            className={'btn ' + (activeOnly ? 'active-toggle on' : 'active-toggle')}
            onClick={() => setActiveOnly(v => !v)}
          >
            오늘 근무중만
          </button>
          <Btn onClick={() => setSelDate(WN_TODAY)}>오늘로</Btn>
          <Btn icon="refresh">새로고침</Btn>
        </div>
      </div>

      {/* 빠른 필터 칩 */}
      <div className="wn-chips">
        <button
          className={'wn-chip' + (dept === '전체' ? ' on' : '')}
          onClick={() => setDept('전체')}
        >전체</button>
        {allDepts.slice(0, 8).map(d => (
          <button
            key={d}
            className={'wn-chip' + (dept === d ? ' on' : '')}
            onClick={() => setDept(d)}
          >{d}</button>
        ))}
        <div style={{flex: 1}}/>
        {activeOnly && (
          <span className="wn-sync success">오늘 근무중 {activeCount}명</span>
        )}
        <span className="wn-sync">선택일 {wnFmtDisplay(selDate)}</span>
      </div>

      {/* 현재 근무중 — 시프트 밴드별 그룹 */}
      <div className="wn-section-h">
        <div className="wn-section-title">
          <span className="wn-section-dot"/> 현재 근무중
          <span className="wn-section-meta">{dept} · {activeCount}명</span>
        </div>
      </div>

      <div className="wn-shift-grid">
        {activeGroups.length === 0 ? (
          <div className="wn-empty">오늘 출근해서 현재 근무중인 직원이 없습니다.</div>
        ) : activeGroups.map((g) => (
          <div key={g.sid} className={'wn-shift-card tone-' + WN_BAND_TONE[g.band]}>
            <div className="wn-shift-head">
              <div>
                <div className={'wn-band-badge tone-' + WN_BAND_TONE[g.band]}>
                  현재 근무중 · {WN_BAND_LABEL[g.band]}
                </div>
                <div className="wn-shift-name">{g.shift?.name || '근무형태 미지정'}</div>
                <div className="wn-shift-time">{wnFormatRange(g.shift)}</div>
              </div>
              <span className="wn-count-pill">{g.staffs.length}명</span>
            </div>
            <div className="wn-staff-chips">
              {g.staffs.map((s) => (
                <div key={s.id} className="wn-staff-card">
                  <div className="wn-staff-name">{s.name}</div>
                  <div className="wn-staff-meta">
                    {s.role} · {s.dept} · 출근 {WN_CHECKIN[s.id] || '--:--'}
                  </div>
                  {(s.extras.length > 0 || s.primary) && (
                    <div className="wn-shift-chips">
                      <span className="wn-shift-chip primary">
                        {shiftMap[s.primary]?.name || s.primary}
                      </span>
                      {s.extras.map(eid => (
                        <span key={eid} className="wn-shift-chip">
                          {shiftMap[eid]?.name || eid}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 월간 캘린더 */}
      <div className="wn-section-h" style={{marginTop: 14}}>
        <div className="wn-section-title">
          <Icon name="calendar" size={14}/> 월간 캘린더
          <span className="wn-section-meta">날짜 클릭 시 시프트별 상세</span>
        </div>
        <div className="row" style={{gap: 6}}>
          <button className="wn-pager" onClick={() => setSelDate(new Date(selDate.getFullYear(), selDate.getMonth()-1, 1))}>
            ‹ 이전달
          </button>
          <span className="wn-month-pill">{wnFmtMonth(selDate)}</span>
          <button className="wn-pager" onClick={() => setSelDate(new Date(selDate.getFullYear(), selDate.getMonth()+1, 1))}>
            다음달 ›
          </button>
        </div>
      </div>

      <div className="wn-cal">
        <div className="wn-cal-wd">
          {['일','월','화','수','목','금','토'].map((w, i) => (
            <div key={w} className={'wn-cal-wd-cell' + (i===0 ? ' sun' : '') + (i===6 ? ' sat' : '')}>{w}</div>
          ))}
        </div>
        <div className="wn-cal-grid">
          {cells.map((cell, i) => {
            if (!cell) return <div key={'e'+i} className="wn-cal-cell empty"/>;
            const k = wnKey(cell);
            const n = dayCount(k);
            const today = k === WN_TODAY_KEY;
            const selected = k === wnKey(selDate);
            const wd = cell.getDay();
            return (
              <button
                key={k}
                className={'wn-cal-cell'
                  + (selected ? ' selected' : '')
                  + (today ? ' today' : '')
                  + (wd === 0 ? ' sun' : '')
                  + (wd === 6 ? ' sat' : '')}
                onClick={() => { setSelDate(cell); setModalOpen(true); }}
              >
                <div className="wn-cal-cell-top">
                  <span className="wn-cal-date">{cell.getDate()}</span>
                  <span className="wn-cal-count">{n}명</span>
                </div>
                <div className="wn-cal-cell-body">총 {n}명</div>
                {today && <div className="wn-cal-today-tag">오늘</div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 상세 모달 */}
      {modalOpen && (
        <div className="wn-modal-bg" onClick={() => setModalOpen(false)}>
          <div className="wn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wn-modal-h">
              <div>
                <div className="wn-modal-title">선택일 전체 근무자 상세</div>
                <div className="wn-modal-sub">{wnFmtDisplay(selDate)}</div>
              </div>
              <div className="wn-modal-meta">
                {dept !== '전체' && <span className="wn-sync">{dept}</span>}
                {activeOnly && isToday && <span className="wn-sync success">오늘 근무중만</span>}
                <span className="wn-band-pill tone-accent">Day {selDateGroups.counts.D}명</span>
                <span className="wn-band-pill tone-warn">Evening {selDateGroups.counts.E}명</span>
                <span className="wn-band-pill tone-violet">Night {selDateGroups.counts.N}명</span>
                <span className="wn-band-pill tone-success">기타 {selDateGroups.counts.O}명</span>
                <span className="wn-band-pill tone-muted">총 {selDateGroups.counts.total}명</span>
                <button className="wn-pager" onClick={() => setModalOpen(false)}>닫기</button>
              </div>
            </div>
            <div className="wn-modal-body">
              {selDateGroups.rows.length === 0 ? (
                <div className="wn-empty">선택한 날짜의 근무 배치가 없습니다.</div>
              ) : (
                <div className="wn-modal-grid">
                  {selDateGroups.rows.map((g) => (
                    <div key={g.sid} className="wn-shift-card secondary">
                      <div className="wn-shift-head">
                        <div>
                          <div className={'wn-band-badge tone-' + WN_BAND_TONE[g.band]}>
                            {WN_BAND_LABEL[g.band]}
                          </div>
                          <div className="wn-shift-name">{g.shift?.name || '근무형태 미지정'}</div>
                          <div className="wn-shift-time">{wnFormatRange(g.shift)}</div>
                        </div>
                        <span className="wn-count-pill accent">{g.staffs.length}명</span>
                      </div>
                      <div className="wn-staff-chips">
                        {g.staffs.map((s) => {
                          const activeNow = isToday && WN_ACTIVE_IDS.has(s.id);
                          return (
                            <div key={s.id} className={'wn-staff-card' + (activeNow ? ' active-now' : '')}>
                              <div className="row" style={{gap: 6, alignItems: 'center'}}>
                                <div className="wn-staff-name">{s.name}</div>
                                {activeNow && <span className="wn-now-tag">근무중</span>}
                              </div>
                              <div className="wn-staff-meta">{s.dept} · {s.role}</div>
                              {s.extras.length > 0 && (
                                <div className="wn-shift-chips">
                                  <span className="wn-shift-chip primary">{shiftMap[s.primary]?.name || s.primary}</span>
                                  {s.extras.map(eid => (
                                    <span key={eid} className="wn-shift-chip">{shiftMap[eid]?.name || eid}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ─────────────────────────── BEFORE (구 6상태) ───────────────────────────
const AddonWorkNowBefore = () => {
  const team = [
    { name:'박철홍', role:'병원장',   team:'진료팀',     status:'근무중', last:'09:02 출근', tone:'success' },
    { name:'김지오', role:'간호과장', team:'외래팀',     status:'근무중', last:'08:48 출근', tone:'success' },
    { name:'지민수', role:'실장',     team:'외래팀',     status:'외근',   last:'10:30 ~ 12:00 진료의뢰', tone:'accent' },
    { name:'이가연', role:'사원',     team:'병동팀',     status:'휴게',   last:'10:15부터 15분', tone:'warn' },
    { name:'김수지', role:'수간호사', team:'병동팀',     status:'근무중', last:'07:45 출근', tone:'success' },
    { name:'박지영', role:'사원',     team:'외래팀',     status:'점심',   last:'12:00 ~ 13:00', tone:'warn' },
    { name:'이은혜', role:'사원',     team:'외래팀',     status:'근무중', last:'08:50 출근', tone:'success' },
    { name:'최찬',   role:'사원',     team:'검사팀',     status:'근무중', last:'09:00 출근', tone:'success' },
    { name:'백정민', role:'이사',     team:'경영지원팀', status:'근무중', last:'08:30 출근', tone:'success' },
    { name:'조현준', role:'사원',     team:'병동팀',     status:'결근',   last:'2026.5.11 — 무단', tone:'danger' },
    { name:'조숙현', role:'팀장',     team:'영양팀',     status:'퇴근',   last:'06:30 ~ 14:30', tone:'muted' },
    { name:'방영란', role:'사원',     team:'영양팀',     status:'근무중', last:'06:45 출근', tone:'success' },
  ];
  const counts = team.reduce((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {});
  return (
    <>
      <div className="addon-pageheader">
        <div>
          <div className="addon-h1">실시간 근무현황</div>
          <div className="addon-sub">2026년 5월 11일 (월) · 27명 중 18명 근무중 · 마지막 갱신 1분 전</div>
        </div>
        <div className="row" style={{gap: 8}}>
          <select className="input"><option>전체 부서</option><option>진료팀</option><option>외래팀</option></select>
          <div className="seg" style={{padding: 2}}>
            <button className="on" style={{padding:'6px 14px', fontSize: 12}}>카드</button>
            <button style={{padding:'6px 14px', fontSize: 12}}>표</button>
          </div>
          <Btn icon="refresh">새로고침</Btn>
        </div>
      </div>

      <div className="wn-stat-row">
        {[
          { lbl:'근무중', v: counts['근무중']||0, tone:'success' },
          { lbl:'휴게',   v: counts['휴게']||0,   tone:'warn'    },
          { lbl:'점심',   v: counts['점심']||0,   tone:'warn'    },
          { lbl:'외근',   v: counts['외근']||0,   tone:'accent'  },
          { lbl:'퇴근',   v: counts['퇴근']||0,   tone:'muted'   },
          { lbl:'결근',   v: counts['결근']||0,   tone:'danger'  },
        ].map((s,i) => (
          <div key={i} className={'wn-stat tone-' + s.tone}>
            <div className="wn-dot"/>
            <div className="wn-lbl">{s.lbl}</div>
            <div className="wn-v">{s.v}<span className="kpi-unit2">명</span></div>
          </div>
        ))}
      </div>

      <div className="wn-grid">
        {team.map((t,i) => (
          <div className="wn-card" key={i}>
            <div className={'wn-card-stat tone-' + t.tone}/>
            <div className="ev-avatar">{t.name[0]}</div>
            <div style={{flex: 1, minWidth: 0}}>
              <div className="row" style={{gap: 6, alignItems:'baseline'}}>
                <div className="wn-name">{t.name}</div>
                <div className="small">{t.role}</div>
              </div>
              <div className="small" style={{marginTop: 2}}>{t.team}</div>
              <div className="wn-last">{t.last}</div>
            </div>
            <Chip tone={t.tone}>{t.status}</Chip>
          </div>
        ))}
      </div>
    </>
  );
};

// ─────────────────────────── 모드 분기 래퍼 ───────────────────────────
const AddonWorkNowSwitcher = () => {
  const [mode, setMode] = React.useState(
    () => document.documentElement.getAttribute('data-mode') || 'after'
  );
  React.useEffect(() => {
    const ob = new MutationObserver(() => {
      setMode(document.documentElement.getAttribute('data-mode') || 'after');
    });
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });
    return () => ob.disconnect();
  }, []);
  return mode === 'before' ? <AddonWorkNowBefore/> : <AddonWorkNowAfter/>;
};

Object.assign(window, {
  AddonWorkNowAfter,
  AddonWorkNowBefore,
  AddonWorkNowSwitcher,
});
