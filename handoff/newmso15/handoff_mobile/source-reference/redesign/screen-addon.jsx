// MSO redesign — 추가기능(Add-on) 메뉴 — 6개 모듈 + 허브
// 2차 사이드바로 모듈 전환, 각 모듈은 자체 PageHeader/액션 구성

const ADDON_MODULES = [
  { id: 'hub',       label: '모듈 허브',    icon: 'plusBox',    desc: '12개 모듈 한눈에' },
  { id: 'org',       label: '조직도',       icon: 'users',      desc: '6 부서 · 27명' },
  { id: 'inventory', label: '부서별 재고',  icon: 'package',    desc: '경영지원팀 1,247종' },
  { id: 'worknow',   label: '근무현황',     icon: 'clock',      desc: '근무중 18 · 휴게 3' },
  { id: 'handoff',   label: '인계노트',     icon: 'fileText',   desc: '오늘 공통 4건' },
  { id: 'eval',      label: '직원평가',     icon: 'star',       desc: '11명 평가 대상' },
  { id: 'discharge', label: '퇴원심사',     icon: 'fileText',   desc: '심사중 7건' },
  { id: 'consult',   label: '수술상담',     icon: 'chat',       desc: '오늘 상담 5건 · 음성분석' },
  { id: 'opcheck',   label: 'OP체크',       icon: 'checkCircle',desc: '오늘 수술 1건' },
  { id: 'deposit',   label: '입금 실시간조회', icon: 'won',     desc: '오늘 142건 · 9,407,830원', external:'chart' },
  { id: 'closing',   label: '마감보고',     icon: 'fileText',   desc: '6건 · 미제출 1일', external:'chart' },
  { id: 'parking',   label: '주차관제',     icon: 'package',    desc: '외부 시스템 연동', external:'iframe' },
  { id: 'webfax',    label: '웹팩스',       icon: 'send',       desc: '외부 시스템 연동', external:'iframe' },
];

// ───────────────────────────── 허브 ─────────────────────────────
const AddonHub = ({ onPick }) => {
  const modules = ADDON_MODULES.slice(1); // hub 제외
  return (
    <>
      <div className="addon-hero">
        <div className="ah-kicker">추가기능 · ADD-ON</div>
        <div className="ah-title">병원 운영을 돕는 <b>12개 모듈</b></div>
        <div className="ah-sub">필요한 모듈만 켜서 쓸 수 있도록 분리된 화면입니다. 좌측 메뉴에서 모듈을 선택하거나, 아래 카드를 클릭해 진입하세요.</div>
      </div>
      <div className="addon-grid">
        {modules.map(m => (
          <div className="addon-card" key={m.id} onClick={() => onPick(m.id)}>
            <div className={'ac-ico ico-' + m.id}><Icon name={m.icon} size={20}/></div>
            <div className="row" style={{gap: 6, alignItems:'center'}}>
              <div className="ac-label">{m.label}</div>
              {m.external === 'chart'  && <Chip tone="warn">Chart 이관 예정</Chip>}
              {m.external === 'iframe' && <Chip tone="muted">외부 연동</Chip>}
            </div>
            <div className="ac-desc">{m.desc}</div>
            <div className="ac-chev"><Icon name="chevR" size={16}/></div>
          </div>
        ))}
      </div>
    </>
  );
};

// ───────────────────────────── 부서별 물품·장비 ─────────────────────────────
// 핵심 변경: 부서 컨텍스트(MSO 본사 vs 일반 부서)에 따라 발주 흐름이 다름.
// - 일반 부서: 자동 발주가 "MSO 본사"에게 요청을 보냄 (내부 요청)
// - MSO 본사: 자동 발주 일괄이 외부 거래처에 발주서(PO)를 생성·발송
const DEPTS = [
  { id:'mso',  name:'MSO 본사 (자재)', isMSO: true,  count: 8421 },
  { id:'ou',   name:'외래팀',          isMSO: false, count: 312 },
  { id:'wd',   name:'병동팀',          isMSO: false, count: 489 },
  { id:'la',   name:'검사팀',          isMSO: false, count: 124 },
  { id:'nu',   name:'영양팀',          isMSO: false, count: 87  },
  { id:'cl',   name:'진료팀',          isMSO: false, count: 167 },
  { id:'mg',   name:'경영지원팀',       isMSO: false, count: 68  },
];

const AddonInventory = () => {
  const [deptIdx, setDeptIdx] = React.useState(1); // 외래팀 기본
  const [showPO, setShowPO]   = React.useState(false);
  const [mode, setMode]       = React.useState('view'); // 'view' | 'setting'
  const dept = DEPTS[deptIdx];
  const isMSO = dept.isMSO;

  // 부서별 재고 (일반) — weekly: 주간 소비량, weeks: 보유 기준(주)
  const deptRowsBase = [
    { name: '(3M) 아바가드 손 소독제 (의)',  type: '소모품',  qty: 0,  weekly: 5,  vendor: '3M Korea',     unit: '병', price: 18500 },
    { name: '(3M) 스팀인디게이터테이프',     type: '소모품',  qty: 0,  weekly: 5,  vendor: '3M Korea',     unit: '롤', price: 4200  },
    { name: '(3M) 테가덤 (급) /K6100003',    type: '의료기기', qty: 0,  weekly: 5,  vendor: '3M Korea',     unit: '개', price: 1850  },
    { name: '(BD) 루어락주사기 1cc (산)',    type: '소모품',  qty: 0,  weekly: 5,  vendor: 'BD Korea',     unit: '개', price: 420   },
    { name: '(BNG) 드레싱키트 (급) /M3203208', type: '의료기기', qty: 6, weekly: 5,  vendor: 'BNG Medical',  unit: '개', price: 8800  },
    { name: '(DS) 유린메타 (급) /K3101131',  type: '의료기기', qty: 15, weekly: 4,  vendor: 'DS Healthcare',unit: '개', price: 3200  },
    { name: '(KM) 간호사 모자 (산)',        type: '소모품',  qty: 3,  weekly: 5,  vendor: 'KM Medical',   unit: '개', price: 800   },
    { name: '(MS) 압박용 밴드(MST-04) (비)', type: '의료기기', qty: 24, weekly: 6,  vendor: 'MS Medical',   unit: '개', price: 12500 },
  ];
  const msoRowsBase = [
    { name: '(3M) 아바가드 손 소독제 (의)',  type: '소모품',  qty: 4,   weekly: 25, vendor: '3M Korea',     unit: '병', price: 18500 },
    { name: '(3M) 스팀인디게이터테이프',     type: '소모품',  qty: 12,  weekly: 40, vendor: '3M Korea',     unit: '롤', price: 4200  },
    { name: '(3M) 테가덤 (급) /K6100003',    type: '의료기기', qty: 28,  weekly: 100,vendor: '3M Korea',     unit: '개', price: 1850  },
    { name: '(BD) 루어락주사기 1cc (산)',    type: '소모품',  qty: 80,  weekly: 250,vendor: 'BD Korea',     unit: '개', price: 420   },
    { name: '(BNG) 드레싱키트 (급) /M3203208', type: '의료기기', qty: 32, weekly: 50, vendor: 'BNG Medical',  unit: '개', price: 8800  },
    { name: '(DS) 유린메타 (급) /K3101131',  type: '의료기기', qty: 245, weekly: 50, vendor: 'DS Healthcare',unit: '개', price: 3200  },
    { name: '(KM) 간호사 모자 (산)',        type: '소모품',  qty: 18,  weekly: 25, vendor: 'KM Medical',   unit: '개', price: 800   },
  ];

  // 부서별 주(week) 기준 — useState로 변경 가능
  const [deptWeeks, setDeptWeeks] = React.useState(() => deptRowsBase.map(() => 2));
  const [msoWeeks,  setMsoWeeks ] = React.useState(() => msoRowsBase.map(()  => 2));

  const setWeeks = (i, w) => isMSO
    ? setMsoWeeks(prev => { const n=[...prev]; n[i]=w; return n; })
    : setDeptWeeks(prev => { const n=[...prev]; n[i]=w; return n; });

  // 최종 rows: min = weekly * weeks, action = max(0, min - qty + weekly) 약식
  const dressRows = (base, weeksArr) => base.map((r, i) => {
    const weeks = weeksArr[i] || 2;
    const min = r.weekly * weeks;
    const action = r.qty < min ? Math.max(min - r.qty, 0) : 0;
    return { ...r, weeks, min, action };
  });
  const deptRows = dressRows(deptRowsBase, deptWeeks);
  const msoRows  = dressRows(msoRowsBase,  msoWeeks);
  const rows = isMSO ? msoRows : deptRows;

  // 발주서(PO) — 거래처별 그룹
  const vendorGroups = React.useMemo(() => {
    const need = msoRows.filter(r => r.qty < r.min);
    const map = {};
    need.forEach(r => { (map[r.vendor] = map[r.vendor] || []).push(r); });
    return Object.entries(map).map(([vendor, items]) => ({
      vendor,
      items,
      total: items.reduce((s, it) => s + it.action * it.price, 0),
    }));
  }, [msoRows]);
  const grandTotal = vendorGroups.reduce((s, g) => s + g.total, 0);

  // 미발주 부서 → MSO 요청 통계
  const dangerCount = deptRows.filter(r => r.qty < r.min).length;

  return (
    <>
      <div className="addon-pageheader">
        <div>
          <div className="addon-h1">{isMSO ? 'MSO 본사 — 자재 발주 관리' : dept.name + ' — 물품·장비 현황'}</div>
          <div className="addon-sub">{isMSO
            ? '거래처별 발주서 일괄 생성 · 발송 흐름'
            : '실시간 재고 ↔ MSO 본사 발주 요청 흐름'}</div>
        </div>
        <div className="row" style={{gap: 8}}>
          <select className="input" value={deptIdx} onChange={e => setDeptIdx(+e.target.value)} style={{minWidth: 180}}>
            {DEPTS.map((d, i) => <option key={d.id} value={i}>{d.name}</option>)}
          </select>
          <Btn icon="filter">필터</Btn>
          {isMSO
            ? <Btn variant="primary" icon="send" onClick={() => setShowPO(true)}>자동 발주 일괄 → 발주서 생성</Btn>
            : <Btn variant="primary" icon="send">MSO 일괄 발주 요청 ({dangerCount})</Btn>
          }
        </div>
      </div>

      <div className="addon-summary-row">
        <div className="kpi-simple">
          <div className="kpi-ico"><Icon name="package" size={16}/></div>
          <div className="kpi-info"><div className="kpi-lbl">전체 품목</div><div className="kpi-sub">[{dept.name}]</div></div>
          <div className="kpi-right"><div className="kpi-simple-val">{dept.count.toLocaleString()}<span className="kpi-unit2">종</span></div></div>
        </div>
        <div className="kpi-simple">
          <div className="kpi-ico danger"><Icon name="alertTri" size={16}/></div>
          <div className="kpi-info"><div className="kpi-lbl">발주 필요</div><div className="kpi-sub">잔여 &lt; 최소재고</div></div>
          <div className="kpi-right"><div className="kpi-simple-val" style={{color:'var(--danger)'}}>{rows.filter(r=>r.qty<r.min).length}<span className="kpi-unit2">종</span></div></div>
        </div>
        <div className="kpi-simple">
          <div className="kpi-ico success"><Icon name="checkCircle" size={16}/></div>
          <div className="kpi-info"><div className="kpi-lbl">정상</div><div className="kpi-sub">충분히 보유</div></div>
          <div className="kpi-right"><div className="kpi-simple-val">{rows.filter(r=>r.qty>=r.min).length}<span className="kpi-unit2">종</span></div></div>
        </div>
        <div className="kpi-simple">
          <div className="kpi-ico warn"><Icon name="clock" size={16}/></div>
          <div className="kpi-info">
            <div className="kpi-lbl">{isMSO ? '발주 대기 (외부)' : 'MSO 요청 대기'}</div>
            <div className="kpi-sub">{isMSO ? '발주서 생성 큐' : '본사 확인 대기'}</div>
          </div>
          <div className="kpi-right"><div className="kpi-simple-val">{isMSO ? 14 : 6}<span className="kpi-unit2">건</span></div></div>
        </div>
      </div>

      <div className="card" style={{padding: 0, overflow: 'hidden'}}>
        <div className="addon-toolbar">
          <div className="row" style={{gap: 8}}>
            <div className="input-wrap">
              <Icon name="search" size={14} className="ico"/>
              <input className="input" placeholder="품목명 검색" style={{height: 32, paddingLeft: 30, fontSize: 12, minWidth: 260}}/>
            </div>
            <div className="seg" style={{padding: 2}}>
              <button className="on" style={{padding: '4px 12px', fontSize: 11}}>전체</button>
              <button style={{padding: '4px 12px', fontSize: 11}}>발주 필요</button>
              <button style={{padding: '4px 12px', fontSize: 11}}>정상</button>
            </div>
          </div>
          <div className="row" style={{gap: 8}}>
            <div className="seg" style={{padding: 2}}>
              <button className={mode==='view'    ? 'on' : ''} onClick={() => setMode('view')}    style={{padding: '4px 12px', fontSize: 11}}>재고 보기</button>
              <button className={mode==='setting' ? 'on' : ''} onClick={() => setMode('setting')} style={{padding: '4px 12px', fontSize: 11}}>기준 설정 (주)</button>
            </div>
            <Btn size="sm">정렬</Btn>
            <Btn size="sm" icon="moreH"/>
          </div>
        </div>
        <table className="data-tbl">
          <thead>
            <tr>
              <th style={{width: 32}}><input type="checkbox"/></th>
              <th>품목명</th>
              <th style={{width: 90}}>분류</th>
              {isMSO && <th style={{width: 130}}>거래처</th>}
              <th style={{width: 90, textAlign: 'right'}}>잔여</th>
              <th style={{width: 90, textAlign: 'right'}}>주간 소비</th>
              {mode === 'setting'
                ? <th style={{width: 200}}>보유 기준 (주)</th>
                : <th style={{width: 90, textAlign: 'right'}}>최소재고</th>
              }
              <th style={{width: 100}}>{mode === 'setting' ? '자동 계산' : '상태'}</th>
              <th style={{width: 200, textAlign: 'right'}}>{mode === 'setting' ? '' : '빠른 작업'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const danger = r.qty < r.min;
              const coverage = r.weekly ? (r.qty / r.weekly).toFixed(1) : '-';
              return (
                <tr key={i}>
                  <td><input type="checkbox"/></td>
                  <td className="strong">{r.name}</td>
                  <td><span className={'pri-pill tone-' + (r.type==='의료기기' ? 'accent' : 'muted')}>{r.type}</span></td>
                  {isMSO && <td className="small">{r.vendor}</td>}
                  <td style={{textAlign: 'right', fontFeatureSettings:'"tnum"', fontWeight: 800, color: danger ? 'var(--danger)' : 'var(--z-900)'}}>
                    {r.qty}<span className="kpi-unit2">{r.unit}</span>
                    <div className="small" style={{fontWeight: 600, marginTop: 2}}>{coverage}주 분량</div>
                  </td>
                  <td style={{textAlign: 'right', fontFeatureSettings:'"tnum"', color:'var(--z-700)'}}>
                    {r.weekly}<span className="kpi-unit2">{r.unit}/주</span>
                  </td>
                  {mode === 'setting' ? (
                    <td>
                      <div className="week-seg">
                        {[1,2,3,4].map(w => (
                          <button
                            key={w}
                            className={r.weeks === w ? 'on' : ''}
                            onClick={() => setWeeks(i, w)}
                          >{w}주</button>
                        ))}
                      </div>
                    </td>
                  ) : (
                    <td style={{textAlign: 'right', fontFeatureSettings:'"tnum"', color:'var(--z-500)'}}>
                      {r.min}<span className="kpi-unit2">{r.unit}</span>
                      <div className="small" style={{fontWeight: 600, marginTop: 2}}>{r.weeks}주 기준</div>
                    </td>
                  )}
                  <td>
                    {mode === 'setting'
                      ? <div style={{fontWeight: 800, fontFeatureSettings:'"tnum"'}}>{r.min}<span className="kpi-unit2">{r.unit}</span></div>
                      : (danger ? <Chip tone="warn">발주 필요</Chip> : <Chip tone="success">정상</Chip>)
                    }
                  </td>
                  <td style={{textAlign:'right'}}>
                    {mode === 'setting' ? (
                      <Btn size="sm" icon="check">저장</Btn>
                    ) : (
                      danger
                        ? (isMSO
                            ? <Btn size="sm" variant="primary" icon="plus">발주서에 {r.action}{r.unit}</Btn>
                            : <Btn size="sm" variant="primary" icon="send">MSO에게 {r.action}{r.unit}</Btn>
                          )
                        : <Btn size="sm">기록</Btn>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {mode === 'setting' && (
          <div className="inv-setting-footer">
            <div className="small">
              <b>최소재고 = 주간 소비량 × 보유 기준(주)</b> · 기준은 1주~4주 사이에서 품목별로 다르게 설정 가능. 부서별 사용 패턴에 따라 자유롭게 조정하세요.
            </div>
            <div className="row" style={{gap: 8}}>
              <Btn size="sm">선택된 품목 일괄 적용</Btn>
              <Btn size="sm" variant="primary" icon="check">전체 저장</Btn>
            </div>
          </div>
        )}
      </div>

      {/* MSO 발주서 패널 */}
      {isMSO && showPO && (
        <div className="po-overlay" onClick={() => setShowPO(false)}>
          <div className="po-sheet" onClick={e => e.stopPropagation()}>
            <div className="po-head">
              <div>
                <div className="ah-kicker">PURCHASE ORDER</div>
                <div className="po-title">발주서 일괄 생성</div>
                <div className="small">발주 필요 품목을 거래처별로 묶었습니다. 발송할 거래처만 체크하고 "거래처별 발송"을 누르세요.</div>
              </div>
              <button className="po-close" onClick={() => setShowPO(false)}>
                <Icon name="x" size={18}/>
              </button>
            </div>

            <div className="po-summary-row">
              <div className="po-stat">
                <div className="po-stat-lbl">거래처</div>
                <div className="po-stat-v">{vendorGroups.length}<span className="kpi-unit2">곳</span></div>
              </div>
              <div className="po-stat">
                <div className="po-stat-lbl">발주 품목</div>
                <div className="po-stat-v">{vendorGroups.reduce((s,g)=>s+g.items.length,0)}<span className="kpi-unit2">종</span></div>
              </div>
              <div className="po-stat">
                <div className="po-stat-lbl">총 발주 금액</div>
                <div className="po-stat-v" style={{color:'var(--accent)'}}>{grandTotal.toLocaleString()}<span className="kpi-unit2">원</span></div>
              </div>
            </div>

            <div className="po-list">
              {vendorGroups.map((g, i) => (
                <div className="po-vendor" key={i}>
                  <div className="po-vendor-head">
                    <input type="checkbox" defaultChecked/>
                    <div style={{flex: 1}}>
                      <div className="po-vendor-name">{g.vendor}</div>
                      <div className="small">{g.items.length}종 · {g.items.reduce((s,it)=>s+it.action,0)}{g.items[0].unit}</div>
                    </div>
                    <div className="po-vendor-total">{g.total.toLocaleString()}<span className="kpi-unit2">원</span></div>
                  </div>
                  <table className="data-tbl flat">
                    <thead>
                      <tr>
                        <th>품목</th>
                        <th style={{width: 80, textAlign:'right'}}>현재고</th>
                        <th style={{width: 100, textAlign:'right'}}>발주 수량</th>
                        <th style={{width: 100, textAlign:'right'}}>단가</th>
                        <th style={{width: 110, textAlign:'right'}}>합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((it, j) => (
                        <tr key={j}>
                          <td className="strong">{it.name}</td>
                          <td style={{textAlign:'right', fontFeatureSettings:'"tnum"', color:'var(--danger)'}}>{it.qty}</td>
                          <td style={{textAlign:'right', fontFeatureSettings:'"tnum"', fontWeight: 800}}>{it.action}{it.unit}</td>
                          <td style={{textAlign:'right', fontFeatureSettings:'"tnum"', color:'var(--z-600)'}}>{it.price.toLocaleString()}원</td>
                          <td style={{textAlign:'right', fontFeatureSettings:'"tnum"', fontWeight: 800}}>{(it.action*it.price).toLocaleString()}원</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="po-vendor-foot">
                    <div className="po-vendor-note">
                      <input type="text" className="op-inline-input" placeholder={`${g.vendor} 담당자에게 전달할 메모`}/>
                    </div>
                    <Btn size="sm">미리보기</Btn>
                    <Btn size="sm" variant="primary" icon="send">{g.vendor}에 발송</Btn>
                  </div>
                </div>
              ))}
            </div>

            <div className="po-foot">
              <div>
                <div className="small">발송 시 거래처 담당자에게 이메일·SMS로 발주서 PDF가 전송됩니다.</div>
                <div className="small">전송 후 "발주 대기" → "발주 완료"로 자동 상태 변경.</div>
              </div>
              <div className="row" style={{gap: 8}}>
                <Btn onClick={() => setShowPO(false)}>취소</Btn>
                <Btn variant="primary" icon="send">선택된 거래처 일괄 발송 ({vendorGroups.length}곳)</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ───────────────────────────── OP체크 ─────────────────────────────
const AddonOpCheck = () => {
  const patients = [
    { name: '임영화', age: 69, op: '우측 4 ★mako (69) TKR [로봇 슬관절 인공관절 전치환술]', room: '미정', chart: '10179', time: '09:00', status: '준비완료', tone: 'success' },
    { name: '김지석', age: 58, op: '좌측 ORIF — 척골 골절', room: 'OR-2',   chart: '10184', time: '10:30', status: '준비중',   tone: 'warn' },
    { name: '박현주', age: 72, op: 'AS 척추유합술 L4-L5',     room: 'OR-1',   chart: '10186', time: '13:00', status: '수술중',   tone: 'danger' },
    { name: '오민호', age: 45, op: 'pen — 우측 비골 골절 ORIF', room: 'OR-3',   chart: '10188', time: '15:00', status: '대기',     tone: 'muted' },
  ];
  const [selected, setSelected] = React.useState(0);
  const p = patients[selected];
  const steps = ['준비중', '준비완료', '수술중', '완료'];
  const stepIdx = { '준비중':0, '준비완료':1, '수술중':2, '완료':3, '대기':0 }[p.status];

  return (
    <>
      <div className="addon-pageheader">
        <div>
          <div className="addon-h1">OP체크 — 5월 12일 (화)</div>
          <div className="addon-sub">수술 환자별 준비·체크리스트를 단계별로 관리합니다.</div>
        </div>
        <div className="row" style={{gap: 8}}>
          <div className="seg" style={{padding: 2}}>
            <button className="on" style={{padding: '6px 14px', fontSize: 12}}>환자 체크</button>
            <button style={{padding: '6px 14px', fontSize: 12}}>템플릿 설정</button>
          </div>
          <div className="input-wrap">
            <Icon name="search" size={14} className="ico"/>
            <input className="input" placeholder="환자명·수술명·차트번호" style={{paddingLeft: 30}}/>
          </div>
          <Btn variant="primary">첫 환자 열기</Btn>
        </div>
      </div>

      {/* 환자 + 상세 split */}
      <div className="op-split">
        <div className="op-list">
          <div className="op-list-head">
            <div className="row" style={{gap: 6, flexWrap:'wrap'}}>
              {['전체','준비중','준비완료','수술중','완료'].map((t,i) => (
                <button key={i} className={'todo-chip tone-accent' + (i===0?' on':'')}>{t}<span className="cnt">{[4,1,1,1,0][i]}</span></button>
              ))}
            </div>
          </div>
          <div className="op-list-body">
            {patients.map((q, i) => (
              <div key={i} className={'op-card' + (i===selected?' on':'')} onClick={()=>setSelected(i)}>
                <div className="op-card-top">
                  <div className="op-name">{q.name}</div>
                  <div className="op-time">{q.time}</div>
                </div>
                <div className="op-card-sub">{q.op}</div>
                <div className="op-card-meta">
                  <span>방 {q.room}</span><span>·</span>
                  <span>차트 {q.chart}</span>
                  <Chip tone={q.tone} >{q.status}</Chip>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="op-detail">
          <div className="card">
            <div className="card-row">
              <div>
                <div className="ctitle">{p.name} <span className="small" style={{fontWeight: 600}}>· 차트 {p.chart}</span></div>
                <div className="small" style={{marginTop: 2}}>{p.op}</div>
              </div>
              <div className="row" style={{gap: 6}}>
                <Btn size="sm">← 이전</Btn>
                <Btn size="sm">다음 →</Btn>
                <Btn size="sm">출력</Btn>
                <Btn size="sm" variant="primary">저장</Btn>
              </div>
            </div>

            {/* 진행 스텝 */}
            <div className="op-steps">
              {steps.map((s, i) => (
                <React.Fragment key={i}>
                  <div className={'op-step ' + (i < stepIdx ? 'done' : i === stepIdx ? 'on' : '')}>
                    <div className="ops-num">{i < stepIdx ? <Icon name="check" size={14}/> : i+1}</div>
                    <div className="ops-name">{s}</div>
                  </div>
                  {i < steps.length-1 && <div className={'op-line ' + (i < stepIdx ? 'done' : '')}/>}
                </React.Fragment>
              ))}
            </div>

            <div className="op-actions">
              <Btn variant="primary" icon="check">준비 완료 처리</Btn>
              <Btn>메시지 전송</Btn>
              <Btn icon="check">인계 (수술 시작)</Btn>
              <div style={{flex: 1}}/>
              <div className="small">마취 유형 <b>예: 전신마취</b> · 템플릿 0개</div>
            </div>
          </div>

          {/* 체크리스트 grid */}
          <div className="op-check-grid">
            <div className="card">
              <div className="card-row">
                <div className="ctitle">수술 전 준비 체크</div>
                <Btn size="sm" icon="plus">준비항목 추가</Btn>
              </div>
              <div className="small" style={{marginBottom: 12}}>수술명과 마취 유형 템플릿을 바탕으로 필요한 준비사항을 환자별로 확인합니다.</div>
              <div className="op-check-list">
                {['금식 확인','마취 동의서','수술 부위 표시','약물 알러지 확인','보호자 동석 확인'].map((c,i) => (
                  <label key={i} className="op-check-item">
                    <input type="checkbox" defaultChecked={i<2}/>
                    <span>{c}</span>
                  </label>
                ))}
                <button className="op-add-row">
                  <Icon name="plus" size={12}/>
                  <span>준비 물품명</span>
                  <span className="small">수량 · 단위 · 메모</span>
                </button>
              </div>
            </div>

            <div className="card">
              <div className="card-row">
                <div className="ctitle">수술 중 의료소모품 사용</div>
                <Btn size="sm" icon="plus">소모품 추가</Btn>
              </div>
              <div className="small" style={{marginBottom: 12}}>실제 사용한 소모품을 체크하고 수량과 메모를 남겨 관리합니다.</div>
              <div className="op-check-list">
                <div className="op-soft-row">
                  <input type="text" placeholder="사용 소모품명" className="op-inline-input"/>
                  <div className="row" style={{gap: 4}}>
                    <button className="op-stepper">−</button>
                    <span className="op-qty">0</span>
                    <button className="op-stepper">+</button>
                  </div>
                  <input type="text" placeholder="단위" className="op-inline-input sm"/>
                  <input type="text" placeholder="메모" className="op-inline-input"/>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-row" style={{marginBottom: 8}}>
              <div className="ctitle">환자별 메모</div>
            </div>
            <textarea className="op-textarea" placeholder="수술 전/중 특이사항, 추가 준비 요청, 소모품 사용 메모를 남겨주세요."/>
          </div>
        </div>
      </div>
    </>
  );
};

// ───────────────────────────── 병동 인계노트 ─────────────────────────────
const AddonHandoff = () => {
  const cal = Array.from({length:31}, (_,i)=> i+1);
  const today = 11;
  const [view, setView] = React.useState('common');
  const items = [
    { tag1:'Day', tag2:'일반', tag3:'공통', team:'병동팀1', at:'4. 1. 오전 07:47', body:'0101' },
    { tag1:'Day', tag2:'일반', tag3:'공통', team:'병동팀1', at:'4. 1. 오전 07:47', body:'야간 인계 — 임영화 환자 OR 일정 변경, 9시→10시로 조정. 진통제 PRN 추가.' },
    { tag1:'Eve', tag2:'주의', tag3:'공통', team:'병동팀2', at:'4. 1. 오후 03:21', body:'박지영 환자(202호) 발열 38.2°C — 의료진 호출, 항생제 투여 중. 다음 인계 시 재측정 필요.' },
    { tag1:'Day', tag2:'일반', tag3:'공통', team:'병동팀1', at:'3. 31. 오후 07:00', body:'야간 응급실 환자 입원 처리 완료. 5층 5503호.' },
  ];
  return (
    <>
      <div className="addon-pageheader">
        <div>
          <div className="addon-h1">병동 인계노트</div>
          <div className="addon-sub">2026년 5월 11일 월요일 — 인계 4건 · 환자별 인계 2명 · 검색 결과 8건</div>
        </div>
        <div className="row" style={{gap: 8}}>
          <input className="input" type="date" defaultValue="2026-05-11" style={{minWidth: 150}}/>
          <Btn>오늘</Btn>
          <div className="input-wrap">
            <Icon name="search" size={14} className="ico"/>
            <input className="input" placeholder="인계 검색" style={{paddingLeft: 30}}/>
          </div>
          <Btn variant="primary">병상 설정</Btn>
        </div>
      </div>

      <div className="ho-split">
        <div className="card">
          <div className="card-row">
            <div className="ctitle">2026년 5월</div>
            <div className="row" style={{gap: 6}}>
              <Btn size="sm">이전</Btn>
              <Btn size="sm">다음</Btn>
            </div>
          </div>
          <div className="ho-cal">
            {['일','월','화','수','목','금','토'].map(d => <div className="ho-cal-h" key={d}>{d}</div>)}
            {[null,null,null,null,null].map((_,i)=> <div key={'pad'+i}/>)}
            {cal.map(d => (
              <div key={d} className={'ho-cal-d' + (d===today?' on':'') + (d<11?' past':'')}>{d}</div>
            ))}
          </div>
          <div style={{marginTop: 14, display: 'grid', gridTemplateColumns:'1fr 1fr 1fr', gap: 8}}>
            <div className="ho-mini-stat"><div className="ho-mini-lbl">선택일 공통</div><div className="ho-mini-v">4건</div></div>
            <div className="ho-mini-stat"><div className="ho-mini-lbl">환자별 인계</div><div className="ho-mini-v">2명</div></div>
            <div className="ho-mini-stat"><div className="ho-mini-lbl">검색 결과</div><div className="ho-mini-v">8건</div></div>
          </div>
        </div>

        <div className="card">
          <div className="seg" style={{padding: 3, marginBottom: 14}}>
            <button className={view==='common'?'on':''} onClick={()=>setView('common')} style={{padding:'6px 14px'}}>공통 인계</button>
            <button className={view==='patient'?'on':''} onClick={()=>setView('patient')} style={{padding:'6px 14px'}}>환자별 인계사항</button>
            <div style={{flex:1}}/>
            <span className="small" style={{paddingRight: 8, alignSelf:'center'}}>2026년 5월 11일</span>
          </div>
          <div className="grid-2" style={{gap: 12, marginBottom: 12}}>
            <div>
              <div className="small strong" style={{marginBottom: 4}}>템플릿</div>
              <select className="input" style={{width:'100%'}}>
                <option>저장된 템플릿 없음</option>
              </select>
            </div>
            <div>
              <div className="small strong" style={{marginBottom: 4}}>버전</div>
              <select className="input" style={{width:'100%'}}>
                <option>버전 없음</option>
              </select>
            </div>
          </div>
          <div className="row" style={{gap: 6, marginBottom: 10}}>
            <select className="input sm" style={{width: 120}}>
              <option>Day</option>
              <option>Evening</option>
              <option>Night</option>
            </select>
            <select className="input sm" style={{width: 120}}>
              <option>일반</option>
              <option>주의</option>
            </select>
            <span className="small" style={{alignSelf: 'center'}}>미완료 상태면 이후 날짜에도 계속 표시됩니다.</span>
          </div>
          <textarea className="op-textarea" placeholder="공지사항처럼 공통 인계 내용을 자세히 입력해주세요" rows={4}/>
          <div className="row" style={{justifyContent:'flex-end', gap: 8, marginTop: 8}}>
            <Btn size="sm">템플릿 불러오기</Btn>
            <Btn size="sm">현재 내용으로 템플릿 저장</Btn>
            <Btn variant="primary">공통 인계 등록</Btn>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-row">
          <div className="ctitle">공통 인계 <span className="chip muted" style={{marginLeft: 6}}>4건</span></div>
          <div className="row" style={{gap: 6}}>
            <Btn size="sm" icon="filter">필터</Btn>
          </div>
        </div>
        <div className="ho-list">
          {items.map((it, i) => (
            <div key={i} className="ho-item">
              <div className="ho-tags">
                <span className="chip">{it.tag1}</span>
                <span className="chip muted">{it.tag2}</span>
                <span className="chip">{it.tag3}</span>
                <span className="small">{it.team} · {it.at}</span>
              </div>
              <div className="ho-body">{it.body}</div>
              <div className="ho-right">
                <select className="input sm" style={{width: 90}}>
                  <option>없음</option>
                  <option>주의</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

// ───────────────────────────── 마감보고 ─────────────────────────────
const AddonClosing = () => {
  const [mode, setMode] = React.useState('list');
  const reports = [
    { date: '2026-04-22', total: 9407830,  writer: '한지혜', state: '마감완료' },
    { date: '2026-04-21', total: 10641120, writer: '한지혜', state: '마감완료' },
    { date: '2026-04-20', total: 7615860,  writer: '한지혜', state: '마감완료' },
    { date: '2026-04-18', total: 1835000,  writer: '한지혜', state: '마감완료' },
    { date: '2026-04-17', total: 5396590,  writer: '한지혜', state: '마감완료' },
    { date: '2026-04-16', total: 9672680,  writer: '최은아', state: '마감완료' },
  ];
  return (
    <>
      <div className="addon-pageheader">
        <div>
          <div className="addon-h1">💰 마감보고</div>
          <div className="addon-sub">마감보고 권한이 있는 사용자와 관리자는 등록된 보고를 열람하고 수정할 수 있습니다.</div>
        </div>
        <div className="row" style={{gap: 8}}>
          <div className="seg" style={{padding: 2}}>
            <button className={mode==='list'?'on':''} onClick={()=>setMode('list')} style={{padding:'6px 14px'}}>마감 목록</button>
            <button className={mode==='new'?'on':''} onClick={()=>setMode('new')} style={{padding:'6px 14px'}}>새 마감 작성</button>
          </div>
          {mode==='list' && <Btn variant="primary" icon="plus" onClick={()=>setMode('new')}>새 마감 작성</Btn>}
          {mode==='new'  && <Btn icon="out" onClick={()=>setMode('list')}>목록으로</Btn>}
        </div>
      </div>

      {mode === 'list' ? (
        <div className="cl-list">
          {reports.map((r, i) => (
            <div className="cl-row" key={i}>
              <div className="cl-date">{r.date}</div>
              <div className="cl-total">
                <span className="small">총 수납액</span>
                <b className="cl-total-v">{r.total.toLocaleString()}<span className="kpi-unit2">원</span></b>
              </div>
              <Chip tone="success">{r.state}</Chip>
              <div className="cl-writer">
                <span className="small">작성자</span>
                <b>{r.writer}</b>
              </div>
              <div className="row" style={{gap: 6}}>
                <Btn size="sm">수정</Btn>
                <Btn size="sm" variant="danger">삭제</Btn>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid-3" style={{gap: 12}}>
            <div className="cl-field">
              <label>마감 일자 <span className="req">*</span></label>
              <input className="input" type="date" defaultValue="2026-05-11"/>
            </div>
            <div className="cl-field">
              <label>기초 시재 (전일 이월) <span className="req">*</span></label>
              <input className="input" defaultValue="0"/>
            </div>
            <div className="cl-field">
              <label>기말 시재 (마감 시재) <span className="req">*</span></label>
              <input className="input" defaultValue="0"/>
            </div>
          </div>

          <div className="card">
            <div className="card-row">
              <div className="ctitle">📋 수납 내역 상세</div>
              <Btn size="sm" variant="primary" icon="plus">항목 추가</Btn>
            </div>
            <table className="data-tbl flat">
              <thead>
                <tr><th>환자명</th><th>금액</th><th>수납방식</th><th>항목</th><th style={{width:'30%'}}>메모</th></tr>
              </thead>
              <tbody>
                <tr><td colSpan="5" className="cl-empty">수납 내역을 추가해주세요.</td></tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-row">
              <div className="ctitle">🚩 수표 및 자기앞수표 기록</div>
              <div className="row" style={{gap: 6}}>
                <Btn size="sm">기로 수표조회 가기 ↗</Btn>
                <Btn size="sm" variant="primary" icon="plus">수표 추가</Btn>
              </div>
            </div>
            <div className="cl-empty" style={{textAlign:'center'}}>등록된 수표가 없습니다.</div>
          </div>

          <div className="cl-summary">
            <div>
              <div className="cls-lbl">오늘 총 수납금액</div>
              <div className="cls-val">0<span className="cls-u">원</span></div>
            </div>
            <div style={{textAlign:'right'}}>
              <div className="cls-lbl">정산 오차 (현금)</div>
              <div className="cls-val ok">정상</div>
            </div>
          </div>

          <div>
            <div className="small strong" style={{marginBottom: 6}}>마감 총평 및 특이사항</div>
            <textarea className="op-textarea" placeholder="당일 특이사항을 입력하세요..." rows={3}/>
          </div>

          <button className="cl-submit">
            <Icon name="check" size={18}/>
            <span>오늘 업무 마감 및 보고 저장</span>
          </button>
        </>
      )}
    </>
  );
};

// ───────────────────────────── 직원평가 ─────────────────────────────
const AddonEvaluation = () => {
  const employees = [
    { name:'박철홍', team:'진료팀 · 병원장', initial:'박' },
    { name:'이가연', team:'병동팀 · 사원',   initial:'이' },
    { name:'김수지', team:'병동팀 · 사원',   initial:'김' },
    { name:'박지영', team:'외래팀 · 사원',   initial:'박' },
    { name:'이은혜', team:'외래팀 · 사원',   initial:'이' },
    { name:'최찬',   team:'검사팀 · 사원',   initial:'최' },
    { name:'백정민', team:'경영지원팀 · 이사', initial:'백' },
    { name:'조현준', team:'병동팀 · 사원',   initial:'조' },
    { name:'조숙현', team:'영양팀 · 사원',   initial:'조' },
    { name:'방영란', team:'영양팀 · 사원',   initial:'방' },
    { name:'박하연', team:'외래팀 · 사원',   initial:'박' },
  ];
  const [selected, setSelected] = React.useState(0);
  const [type, setType] = React.useState('성과');
  const [score, setScore] = React.useState(3);
  const e = employees[selected];
  const history = [
    { type:'성과', score:4, body:'5월 진료 일정 조율 적극적, 환자 클레임 0건', at:'2026-05-08' },
    { type:'주의', score:2, body:'근태 — 지각 3회 발생, 면담 예정', at:'2026-05-01' },
    { type:'칭찬', score:5, body:'OP체크 템플릿 정리에 큰 기여', at:'2026-04-22' },
  ];
  return (
    <>
      <div className="addon-pageheader">
        <div>
          <div className="addon-h1">직원 평가</div>
          <div className="addon-sub">직원별 성과·문제사항·칭찬·주의를 실시간으로 기록하고 누적 관리합니다.</div>
        </div>
        <div className="row" style={{gap: 8}}>
          <div className="input-wrap">
            <Icon name="search" size={14} className="ico"/>
            <input className="input" placeholder="직원·부서 검색" style={{paddingLeft: 30}}/>
          </div>
          <Btn icon="filter">필터</Btn>
        </div>
      </div>

      <div className="ev-split">
        <div className="card" style={{padding: 0}}>
          <div className="ev-list-head">
            <div className="ctitle">평가 대상 직원 <span className="chip muted" style={{marginLeft: 4}}>{employees.length}</span></div>
          </div>
          <div className="ev-list">
            {employees.map((emp, i) => (
              <div className={'ev-row' + (i===selected?' on':'')} key={i} onClick={()=>setSelected(i)}>
                <div className="ev-avatar">{emp.initial}</div>
                <div>
                  <div className="ev-name">{emp.name}</div>
                  <div className="ev-team">{emp.team}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="card">
            <div className="ev-head">
              <div className="ev-avatar big">{e.initial}</div>
              <div style={{flex: 1}}>
                <div className="ev-h-name">{e.name} <span className="chip muted">{e.team.split('·')[1] || '직책'}</span></div>
                <div className="small">{e.team.split('·')[0]} 소속</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div className="small">기록자 (부서장)</div>
                <div className="strong">백정민 이사</div>
              </div>
            </div>

            <div className="ev-form-row">
              <div>
                <div className="small strong" style={{marginBottom: 6}}>기록 유형</div>
                <div className="row" style={{gap: 4}}>
                  {['성과','문제사항','칭찬','주의','기타'].map(t => (
                    <button key={t} className={'ev-type-chip' + (type===t?' on':'')} onClick={()=>setType(t)}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="small strong" style={{marginBottom: 6}}>평정 점수 (1–5)</div>
                <div className="row" style={{gap: 10, alignItems:'center'}}>
                  <input type="range" min="1" max="5" value={score} onChange={e=>setScore(+e.target.value)} className="ev-slider"/>
                  <span className="ev-score">{score}</span>
                </div>
              </div>
            </div>

            <div style={{marginTop: 14}}>
              <div className="small strong" style={{marginBottom: 6}}>상세 기록 사항</div>
              <textarea className="op-textarea" placeholder="업무 성과, 태도 변화, 발생한 이슈 등을 구체적으로 기록하세요..." rows={3}/>
            </div>
            <div className="row" style={{justifyContent:'flex-end', marginTop: 10}}>
              <Btn variant="primary" icon="check">실시간 기록 저장</Btn>
            </div>
          </div>

          <div className="card">
            <div className="card-row">
              <div className="ctitle">📜 평가 기록 히스토리</div>
              <span className="small">{history.length}건 · 최신순</span>
            </div>
            <div className="ev-history">
              {history.map((h, i) => (
                <div key={i} className="ev-hist-row">
                  <span className={'pri-pill tone-' + ({성과:'accent', 주의:'warn', 칭찬:'success', 문제사항:'danger', 기타:'muted'}[h.type])}>{h.type}</span>
                  <div className="ev-hist-score">{'★'.repeat(h.score)}<span style={{color:'var(--z-300)'}}>{'★'.repeat(5-h.score)}</span></div>
                  <div className="ev-hist-body">{h.body}</div>
                  <div className="small">{h.at}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// ───────────────────────────── 퇴원심사 ─────────────────────────────
const AddonDischarge = () => {
  const [mode, setMode] = React.useState('list');
  const rows = [
    { name:'송봉운', tag:'ORIF/건보',     dept:'정형외과', days:14, items:720, progress:651, date:'2026. 5. 11.' },
    { name:'박근식', tag:'AS/건보',       dept:'정형외과', days:4,  items:389, progress:346, date:'2026. 5. 11.' },
    { name:'곽유진', tag:'TKR/건보/마코', dept:'정형외과', days:14, items:820, progress:749, date:'2026. 5. 11.' },
    { name:'허경진', tag:'pen',          dept:'정형외과', days:14, items:744, progress:571, date:'2026. 5. 11.' },
    { name:'박성민', tag:'uni/건보',      dept:'정형외과', days:15, items:832, progress:735, date:'2026. 5. 6.'  },
    { name:'탁순자', tag:'TKR/급여',      dept:'정형외과', days:14, items:721, progress:611, date:'2026. 5. 4.'  },
  ];
  return (
    <>
      <div className="addon-pageheader">
        <div>
          <div className="addon-h1">📔 퇴원심사</div>
          <div className="addon-sub">진행중인 심사 {rows.length}건 · 평균 진행률 88% · 오늘 신규 4건</div>
        </div>
        <div className="seg" style={{padding: 2}}>
          <button className={mode==='list'?'on':''} onClick={()=>setMode('list')} style={{padding:'6px 14px'}}>📑 심사 목록</button>
          <button className={mode==='new'?'on':''}  onClick={()=>setMode('new')}  style={{padding:'6px 14px'}}>＋ 새 심사</button>
          <button className={mode==='setting'?'on':''} onClick={()=>setMode('setting')} style={{padding:'6px 14px'}}>⚙ 기본 항목 설정</button>
        </div>
      </div>

      {mode === 'list' && (
        <>
          <div className="addon-summary-row">
            <div className="kpi-simple">
              <div className="kpi-ico"><Icon name="fileText" size={16}/></div>
              <div className="kpi-info"><div className="kpi-lbl">진행 중</div><div className="kpi-sub">심사 중</div></div>
              <div className="kpi-right"><div className="kpi-simple-val">7<span className="kpi-unit2">건</span></div></div>
            </div>
            <div className="kpi-simple">
              <div className="kpi-ico success"><Icon name="checkCircle" size={16}/></div>
              <div className="kpi-info"><div className="kpi-lbl">완료</div><div className="kpi-sub">이번 주</div></div>
              <div className="kpi-right"><div className="kpi-simple-val">12<span className="kpi-unit2">건</span></div></div>
            </div>
            <div className="kpi-simple">
              <div className="kpi-ico warn"><Icon name="alertTri" size={16}/></div>
              <div className="kpi-info"><div className="kpi-lbl">평균 진행률</div><div className="kpi-sub">항목 채움</div></div>
              <div className="kpi-right"><div className="kpi-simple-val">88<span className="kpi-unit2">%</span></div></div>
            </div>
            <div className="kpi-simple">
              <div className="kpi-ico"><Icon name="calendar" size={16}/></div>
              <div className="kpi-info"><div className="kpi-lbl">신규 신청</div><div className="kpi-sub">오늘</div></div>
              <div className="kpi-right"><div className="kpi-simple-val">4<span className="kpi-unit2">건</span></div></div>
            </div>
          </div>

          <div className="dc-list">
            {rows.map((r, i) => {
              const pct = Math.round(r.progress / r.items * 100);
              return (
                <div className="dc-row" key={i}>
                  <div className="dc-row-top">
                    <Chip tone="warn">심사 중</Chip>
                    <div className="dc-name">{r.name}</div>
                    <Chip>{r.tag}</Chip>
                    <div className="small">{r.dept} · {r.days}일 · {r.items}개 항목</div>
                    <div style={{flex: 1}}/>
                    <div className="small">{r.date}</div>
                    <div className="dc-frac"><b>{r.progress}</b>/{r.items}</div>
                  </div>
                  <div className="dc-bar">
                    <div className="dc-bar-fill" style={{width: pct + '%'}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {mode === 'new' && (
        <div className="card">
          <div className="card-row">
            <div className="ctitle">새 퇴원심사 등록</div>
            <span className="small">필수 항목(*)을 모두 채워야 저장됩니다.</span>
          </div>
          <div className="dc-form">
            {[
              ['환자명 *','검색 또는 입력'],
              ['생년월일','0000-00-00'],
              ['성별','선택'],
              ['진료과 *','정형외과, 내과...'],
              ['입원일 *','0000-00-00'],
              ['퇴원 예정일','2026-05-11'],
              ['보험 구분','선택'],
              ['주치의','김OO'],
              ['병실 등급','선택'],
              ['수술명','수술 없음'],
              ['수술일','0000-00-00'],
              ['입원 경로','선택'],
              ['퇴원 유형','선택'],
              ['DRG 코드','포괄수가 코드'],
            ].map(([l,p],i) => (
              <div key={i} className="cl-field">
                <label>{l}</label>
                <input className="input" placeholder={p}/>
              </div>
            ))}
          </div>
          <div className="cl-field" style={{marginTop: 14}}>
            <label>동반 질환</label>
            <input className="input" placeholder="고혈압, 당뇨, 심부전..."/>
          </div>
          <div className="cl-field" style={{marginTop: 14}}>
            <label>상병명 (진단코드)</label>
            <textarea className="op-textarea" rows={3} placeholder="차트에서 상병명을 복사-붙여넣기 (여러 줄 가능)  예: M17.1 원발성 무릎관절증  I10 고혈압  E11 2형 당뇨"/>
          </div>
          <div className="cl-field" style={{marginTop: 14}}>
            <label>진단명 / 입원 사유 (템플릿 선택)</label>
            <select className="input"><option>-- 템플릿 선택 (선택 안 함) --</option></select>
          </div>
          <div className="row" style={{justifyContent:'flex-end', gap: 8, marginTop: 18}}>
            <Btn onClick={()=>setMode('list')}>취소</Btn>
            <Btn variant="primary" icon="check">심사 등록</Btn>
          </div>
        </div>
      )}

      {mode === 'setting' && (
        <div className="card">
          <div className="card-row">
            <div className="ctitle">기본 심사 항목 설정</div>
            <Btn size="sm" variant="primary" icon="plus">템플릿 추가</Btn>
          </div>
          <div className="small">심사 시 자동으로 불러올 항목 그룹을 관리합니다. 진단명·수술명별 템플릿을 만들어두면 새 심사 등록이 빨라집니다.</div>
          <div className="dc-tpl-grid">
            {['TKR (인공관절 전치환술)','ORIF (골절 정복)','AS (척추유합술)','일반 정형외과','내과 입원','종합검진 패키지'].map((t,i) => (
              <div className="dc-tpl-card" key={i}>
                <div className="dc-tpl-name">{t}</div>
                <div className="small">{[720, 389, 820, 412, 365, 280][i]}개 항목 · 최근 사용 {i+1}일 전</div>
                <div className="row" style={{gap: 6, marginTop: 10}}>
                  <Btn size="sm">템플릿 열기</Btn>
                  <Btn size="sm" icon="edit">수정</Btn>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

// ───────────────────────────── 조직도 (원본 hierarchical org chart) ─────────────────────────────
const OrgEmp = ({ name, role, status = 'off' }) => {
  // status: 'on' (출근중) | 'off' (출근 전)
  return (
    <div className="org-emp">
      <div className="org-emp-pic">
        <span>{name[0]}</span>
        {status === 'on' && <span className="org-emp-dot on"/>}
        {status === 'off' && <span className="org-emp-dot off"/>}
      </div>
      <div className="org-emp-info">
        <div className="org-emp-name">{name}</div>
        <div className="org-emp-role">{role}</div>
      </div>
    </div>
  );
};

const OrgTeam = ({ name, count, tone = 'gray', children }) => (
  <div className="org-team">
    <div className={'org-team-head tone-' + tone}>
      <div className="org-team-name">{name}</div>
      <div className="org-team-count">{count}명</div>
    </div>
    <div className="org-team-body">{children}</div>
  </div>
);

const OrgDeptGroup = ({ name, count, teams, tone, children, empty }) => (
  <div className={'org-dept-group tone-' + tone}>
    <div className="org-dept-band">
      <div className="org-dept-band-name">{name}</div>
      <div className="org-dept-band-count">{teams}팀 · {count}명</div>
    </div>
    <div className="org-dept-teams">
      {empty
        ? <div className="org-dept-empty">팀원 없음</div>
        : children}
    </div>
  </div>
);

const OrgHospital = ({ title, sub, hasHead = true, hasManagers = true, children }) => (
  <section className="org-hospital">
    <div className="org-hosp-head">
      <div>
        <div className="org-hosp-name">{title}</div>
        <div className="org-hosp-sub">{sub}</div>
      </div>
      <span className="org-hosp-tag">ORG</span>
    </div>
    {hasHead && (
      <>
        <div className="org-top">
          <div className="org-emp-card big">
            <div className="org-emp-pic lg"><span>박</span><span className="org-emp-dot off"/></div>
            <div className="org-emp-info">
              <div className="org-emp-name big">박철홍</div>
              <div className="org-emp-role">병원장</div>
            </div>
            <Chip tone="warn">● 출근 전</Chip>
          </div>
        </div>
        <div className="org-tree-line"/>
      </>
    )}
    {hasManagers && (
      <div className="org-managers">
        <div className="org-managers-label">관리자</div>
        <div className="org-managers-row">
          <div className="org-emp-card">
            <div className="org-emp-pic"><span>지</span><span className="org-emp-dot off"/></div>
            <div className="org-emp-info">
              <div className="org-emp-name">지민수</div>
              <div className="org-emp-role">실장 · 외래팀</div>
            </div>
            <Chip tone="warn">● 출근 전</Chip>
          </div>
          <div className="org-emp-card">
            <div className="org-emp-pic"><span>김</span><span className="org-emp-dot off"/></div>
            <div className="org-emp-info">
              <div className="org-emp-name">김지오</div>
              <div className="org-emp-role">간호과장 · 외래팀</div>
            </div>
            <Chip tone="warn">● 출근 전</Chip>
          </div>
        </div>
      </div>
    )}
    <div className="org-tree-line"/>
    <div className="org-depts">{children}</div>
  </section>
);

const AddonOrg = () => {
  return (
    <>
      <div className="addon-pageheader">
        <div>
          <div className="addon-h1">조직도</div>
          <div className="addon-sub">박철홍정형외과 · 수연의원 — 다중 병원 통합 조직</div>
        </div>
        <div className="row" style={{gap: 8}}>
          <div className="input-wrap">
            <Icon name="search" size={14} className="ico"/>
            <input className="input" placeholder="이름·부서·직급 검색" style={{paddingLeft: 30, minWidth: 240}}/>
          </div>
          <Btn icon="filter">필터</Btn>
        </div>
      </div>

      <OrgHospital title="박철홍정형외과" sub="재직 37명 · 근무중 5명">
        <OrgDeptGroup name="간호부" teams={4} count={23} tone="blue">
          <OrgTeam name="병동팀" count={10} tone="cyan">
            <OrgEmp name="이가연" role="사원"/>
            <OrgEmp name="김수지" role="사원"/>
            <OrgEmp name="조현준" role="사원" status="on"/>
            <OrgEmp name="최민정" role="사원"/>
            <OrgEmp name="정지웅" role="사원"/>
            <OrgEmp name="이승현" role="사원" status="on"/>
            <OrgEmp name="이지현" role="사원"/>
            <OrgEmp name="박지연" role="사원"/>
            <OrgEmp name="김민정" role="사원"/>
            <OrgEmp name="반민정" role="사원" status="on"/>
          </OrgTeam>
          <OrgTeam name="수술팀" count={4} tone="gray">
            <OrgEmp name="정가영" role="사원"/>
            <OrgEmp name="박소연" role="사원"/>
            <OrgEmp name="이대성" role="사원"/>
            <OrgEmp name="김규빈" role="사원"/>
          </OrgTeam>
          <OrgTeam name="검사팀" count={3} tone="plain">
            <OrgEmp name="최찬"   role="사원"/>
            <OrgEmp name="김영대" role="사원"/>
            <OrgEmp name="김재영" role="사원"/>
          </OrgTeam>
          <OrgTeam name="외래팀" count={6} tone="green">
            <OrgEmp name="박지영" role="사원"/>
            <OrgEmp name="이은혜" role="사원" status="on"/>
            <OrgEmp name="박하연" role="사원"/>
            <OrgEmp name="송소현" role="사원"/>
            <OrgEmp name="진보경" role="사원"/>
            <OrgEmp name="김정수" role="사원"/>
          </OrgTeam>
        </OrgDeptGroup>

        <OrgDeptGroup name="진료부" teams={0} count={0} tone="green-light" empty/>

        <OrgDeptGroup name="총무부" teams={3} count={8} tone="orange">
          <OrgTeam name="원무팀" count={2} tone="pink">
            <OrgEmp name="한지혜" role="사원"/>
            <OrgEmp name="박민지" role="사원"/>
          </OrgTeam>
          <OrgTeam name="관리팀" count={2} tone="purple">
            <OrgEmp name="윤연이" role="사원"/>
            <OrgEmp name="하순정" role="사원"/>
          </OrgTeam>
          <OrgTeam name="영양팀" count={4} tone="orange">
            <OrgEmp name="조숙현" role="사원"/>
            <OrgEmp name="방영란" role="사원" status="on"/>
            <OrgEmp name="박유진" role="사원"/>
            <OrgEmp name="박은안" role="사원"/>
          </OrgTeam>
        </OrgDeptGroup>

        <OrgDeptGroup name="기타" teams={1} count={3} tone="violet">
          <OrgTeam name="부서 미지정" count={3} tone="plain">
            <OrgEmp name="병동팀1" role="사원"/>
            <OrgEmp name="외래팀1" role="사원"/>
            <OrgEmp name="수술팀1" role="직급 미지정"/>
          </OrgTeam>
        </OrgDeptGroup>
      </OrgHospital>

      <OrgHospital title="수연의원" sub="재직 4명 · 근무중 0명" hasHead={false} hasManagers={false}>
        <OrgDeptGroup name="간호부" teams={2} count={3} tone="blue">
          <OrgTeam name="외래팀" count={2} tone="green">
            <OrgEmp name="이주리" role="사원"/>
            <OrgEmp name="박세진" role="사원"/>
          </OrgTeam>
          <OrgTeam name="병동팀" count={1} tone="cyan">
            <OrgEmp name="조혜영" role="사원"/>
          </OrgTeam>
        </OrgDeptGroup>
        <OrgDeptGroup name="진료부" teams={0} count={0} tone="green-light" empty/>
        <OrgDeptGroup name="총무부" teams={1} count={1} tone="orange">
          <OrgTeam name="원무팀" count={1} tone="pink">
            <OrgEmp name="신지원" role="사원"/>
          </OrgTeam>
        </OrgDeptGroup>
      </OrgHospital>

      <OrgHospital title="MSO 본사" sub="재직 5명 · 근무중 3명 · 그룹 본사" hasHead={false} hasManagers={false}>
        <OrgDeptGroup name="경영지원본부" teams={2} count={5} tone="blue">
          <OrgTeam name="경영지원팀" count={3} tone="cyan">
            <OrgEmp name="백정민" role="이사" status="on"/>
            <OrgEmp name="한지혜" role="사원" status="on"/>
            <OrgEmp name="홍자비" role="사원" status="on"/>
          </OrgTeam>
          <OrgTeam name="IT 지원팀" count={2} tone="gray">
            <OrgEmp name="김이지" role="사원"/>
            <OrgEmp name="오은서" role="사원"/>
          </OrgTeam>
        </OrgDeptGroup>
        <OrgDeptGroup name="자재본부" teams={1} count={3} tone="orange">
          <OrgTeam name="자재구매팀" count={3} tone="orange">
            <OrgEmp name="이지훈" role="팀장"/>
            <OrgEmp name="최현주" role="사원"/>
            <OrgEmp name="박상민" role="사원"/>
          </OrgTeam>
        </OrgDeptGroup>
        <OrgDeptGroup name="신규 추가 영역" teams={0} count={0} tone="violet" empty/>
      </OrgHospital>

      {/* 새 회사 추가 placeholder */}
      <button className="org-add-hospital">
        <Icon name="plus" size={18}/>
        <span>새 회사·병원 추가</span>
      </button>
    </>
  );
};

// ───────────────────────────── 근무현황 ─────────────────────────────
const AddonWorkNow = () => {
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

// ───────────────────────────── 수술상담 ─────────────────────────────
const AddonConsult = () => {
  const items = [
    { name:'송봉운', dob:'1948-06-12', op:'TKR (양측 무릎)', doc:'박철홍', date:'2026-05-12 10:30', state:'예정',  tone:'accent',  consent:'대기' },
    { name:'박근식', dob:'1962-03-22', op:'AS 척추유합술 L4-L5', doc:'박철홍', date:'2026-05-12 14:00', state:'예정',  tone:'accent',  consent:'대기' },
    { name:'곽유진', dob:'1955-09-08', op:'mako TKR (좌)',    doc:'박철홍', date:'2026-05-13 09:00', state:'동의완료', tone:'success', consent:'완료' },
    { name:'허경진', dob:'1970-12-30', op:'pen ORIF (비골)',  doc:'김지오', date:'2026-05-14 11:00', state:'예정',  tone:'accent',  consent:'보류' },
    { name:'박성민', dob:'1949-04-17', op:'uni 단측 인공관절', doc:'박철홍', date:'2026-05-15 13:30', state:'재상담', tone:'warn',    consent:'대기' },
    { name:'탁순자', dob:'1958-11-05', op:'TKR 우측',         doc:'박철홍', date:'2026-05-09 10:00', state:'완료',  tone:'muted',   consent:'완료' },
  ];
  const checks = [
    { l:'수술 명·범위 설명',     done: true },
    { l:'합병증·부작용 설명',     done: true },
    { l:'대체 치료법 안내',      done: true },
    { l:'예상 회복 기간',        done: false },
    { l:'예상 비용 안내',        done: false },
    { l:'보호자 입회 확인',      done: false },
  ];
  return (
    <>
      <div className="addon-pageheader">
        <div>
          <div className="addon-h1">수술 상담</div>
          <div className="addon-sub">오늘 상담 5건 · 예정 11건 · 동의 미완료 7건 · 재상담 2건</div>
        </div>
        <div className="row" style={{gap: 8}}>
          <div className="input-wrap">
            <Icon name="search" size={14} className="ico"/>
            <input className="input" placeholder="환자·수술명 검색" style={{paddingLeft: 30}}/>
          </div>
          <Btn icon="filter">필터</Btn>
          <Btn variant="primary" icon="plus">새 상담</Btn>
        </div>
      </div>

      <div className="addon-summary-row">
        {[
          { lbl:'오늘 상담',  v:5, tone:'',        sub:'예정 + 진행' },
          { lbl:'동의 완료',  v:23, tone:'success',sub:'이번 달' },
          { lbl:'동의 미완료',v:7,  tone:'warn',  sub:'24시간 내 필요' },
          { lbl:'재상담 요청',v:2,  tone:'danger',sub:'환자 요청' },
        ].map((s, i) => (
          <div className="kpi-simple" key={i}>
            <div className={'kpi-ico ' + s.tone}><Icon name={['chat','checkCircle','alertCircle','refresh'][i]} size={16}/></div>
            <div className="kpi-info"><div className="kpi-lbl">{s.lbl}</div><div className="kpi-sub">{s.sub}</div></div>
            <div className="kpi-right"><div className="kpi-simple-val">{s.v}<span className="kpi-unit2">건</span></div></div>
          </div>
        ))}
      </div>

      <div className="cs-split">
        <div className="card" style={{padding: 0, overflow:'hidden'}}>
          <div className="addon-toolbar">
            <div className="row" style={{gap: 8}}>
              <div className="seg" style={{padding: 2}}>
                <button className="on" style={{padding:'4px 12px', fontSize: 11}}>전체</button>
                <button style={{padding:'4px 12px', fontSize: 11}}>예정</button>
                <button style={{padding:'4px 12px', fontSize: 11}}>완료</button>
                <button style={{padding:'4px 12px', fontSize: 11}}>재상담</button>
              </div>
            </div>
            <span className="small">{items.length}건</span>
          </div>
          <table className="data-tbl">
            <thead>
              <tr>
                <th>환자</th>
                <th>수술명</th>
                <th>상담의</th>
                <th>일시</th>
                <th>상태</th>
                <th style={{textAlign:'right'}}>동의</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className={i===0 ? 'row-active' : ''}>
                  <td>
                    <div className="strong">{it.name}</div>
                    <div className="small">생 {it.dob}</div>
                  </td>
                  <td>{it.op}</td>
                  <td>{it.doc}</td>
                  <td style={{fontFeatureSettings:'"tnum"'}}>{it.date}</td>
                  <td><Chip tone={it.tone}>{it.state}</Chip></td>
                  <td style={{textAlign:'right'}}>
                    {it.consent === '완료'
                      ? <Chip tone="success">완료</Chip>
                      : it.consent === '대기'
                        ? <Chip tone="warn">대기</Chip>
                        : <Chip tone="danger">보류</Chip>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-row">
            <div>
              <div className="ctitle">송봉운 — 5월 12일 10:30</div>
              <div className="small">TKR (양측 무릎) · 상담의 박철홍 병원장</div>
            </div>
            <Chip tone="accent">예정</Chip>
          </div>

          <div className="cs-section">
            <div className="cs-section-title">
              <span style={{display:'inline-flex', alignItems:'center', gap: 8}}>
                음성 녹음 + AI 분석
                <Chip tone="warn">베타</Chip>
              </span>
            </div>
            <div className="rec-panel">
              <div className="rec-controls">
                <button className="rec-btn rec">
                  <span className="rec-dot"/>
                  녹음 시작
                </button>
                <div className="rec-time">00:14:23</div>
                <div className="rec-wave">
                  {[6,8,12,10,14,18,16,12,10,14,16,18,20,16,12,10,14,18,12,8,10,12,14,16,18,12,10,14,16,18,14,10].map((h,i)=>(
                    <span key={i} style={{height: h, background: i < 22 ? 'var(--accent)' : 'var(--z-300)'}}/>
                  ))}
                </div>
                <Btn size="sm" icon="check">완료 후 분석</Btn>
              </div>
              <div className="rec-files">
                <div className="rec-file">
                  <Icon name="check" size={14} color="var(--success)"/>
                  <div style={{flex: 1}}>
                    <div className="strong">상담_송봉운_20260511_1410.wav</div>
                    <div className="small">14:23 · 분석 완료 · 동의서 6/7 항목 충족</div>
                  </div>
                  <Btn size="sm">재생</Btn>
                  <Btn size="sm">스크립트</Btn>
                </div>
              </div>
              <div className="rec-analysis">
                <div className="ra-title">
                  <Icon name="checkCircle" size={14} color="var(--accent)"/>
                  AI 분석 결과 — 6 / 7 항목 충족
                </div>
                <div className="ra-list">
                  {[
                    { l:'수술 명·범위 설명',    ok:true, ts:'00:01:24' },
                    { l:'합병증·부작용 설명',   ok:false, ts:null, note:'언급 없음 — 추가 설명 필요' },
                    { l:'대체 치료법 안내',    ok:true, ts:'00:04:48' },
                    { l:'예상 회복 기간',      ok:true, ts:'00:06:12' },
                    { l:'예상 비용 안내',      ok:true, ts:'00:08:40' },
                    { l:'보호자 입회 확인',    ok:true, ts:'00:11:02' },
                    { l:'환자 질문 응답',      ok:true, ts:'00:12:18' },
                  ].map((r, i) => (
                    <div key={i} className={'ra-item ' + (r.ok ? 'ok' : 'no')}>
                      <Icon name={r.ok ? 'check' : 'alertCircle'} size={13}/>
                      <span style={{flex: 1}}>{r.l}</span>
                      {r.ok
                        ? <span className="small" style={{fontFeatureSettings:'"tnum"'}}>{r.ts}</span>
                        : <span className="small" style={{color:'var(--danger)'}}>{r.note}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="cs-section">
            <div className="cs-section-title">상담 체크리스트</div>
            <div className="op-check-list">
              {checks.map((c, i) => (
                <label key={i} className="op-check-item">
                  <input type="checkbox" defaultChecked={c.done}/>
                  <span style={{flex: 1}}>{c.l}</span>
                  {c.done && <span className="small" style={{color:'var(--success)'}}>완료</span>}
                </label>
              ))}
            </div>
          </div>

          <div className="cs-section">
            <div className="cs-section-title">동의서</div>
            <div className="cs-doc-row">
              <Icon name="fileText" size={18} color="var(--accent)"/>
              <div style={{flex: 1}}>
                <div className="strong">수술 동의서 (양식 v2.1)</div>
                <div className="small">전자서명 미완료 · 24시간 내 필요</div>
              </div>
              <Btn size="sm">미리보기</Btn>
              <Btn size="sm" variant="primary">서명 요청 발송</Btn>
            </div>
          </div>

          <div className="cs-section" style={{borderBottom: 0}}>
            <div className="cs-section-title">상담 메모</div>
            <textarea className="op-textarea" rows={3} placeholder="환자 우려사항, 보호자 질문, 합의 내용 등을 기록하세요..."/>
          </div>
          <div className="row" style={{justifyContent:'flex-end', gap: 8, marginTop: 8}}>
            <Btn>임시 저장</Btn>
            <Btn variant="primary" icon="check">상담 완료 처리</Btn>
          </div>
        </div>
      </div>
    </>
  );
};

// ───────────────────────────── 분석 ─────────────────────────────
const AnalBars = ({ data, color = '#2563EB' }) => {
  const max = Math.max(...data, 1);
  return (
    <div className="anal-bars">
      {data.map((v, i) => (
        <div key={i} className="anal-bar" style={{height: (v/max*100) + '%', background: color}}/>
      ))}
    </div>
  );
};
const AnalLine = ({ data, color = '#2563EB' }) => {
  const w = 100, h = 40;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = (max - min) || 1;
  const sx = w / (data.length - 1);
  const pts = data.map((v, i) => `${i*sx},${h - ((v-min)/range)*h*0.9 - 2}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height={h+4}>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#lg)"/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
};
const AddonAnalytics = () => {
  const [period, setPeriod] = React.useState('month');
  return (
    <>
      <div className="addon-pageheader">
        <div>
          <div className="addon-h1">병원 운영 분석</div>
          <div className="addon-sub">2026년 5월 1일 ~ 11일 · 17개 지표 자동 집계</div>
        </div>
        <div className="row" style={{gap: 8}}>
          <div className="seg" style={{padding: 2}}>
            <button className={period==='day'?'on':''}   onClick={()=>setPeriod('day')}   style={{padding:'6px 14px', fontSize: 12}}>일별</button>
            <button className={period==='week'?'on':''}  onClick={()=>setPeriod('week')}  style={{padding:'6px 14px', fontSize: 12}}>주간</button>
            <button className={period==='month'?'on':''} onClick={()=>setPeriod('month')} style={{padding:'6px 14px', fontSize: 12}}>월간</button>
            <button className={period==='year'?'on':''}  onClick={()=>setPeriod('year')}  style={{padding:'6px 14px', fontSize: 12}}>연간</button>
          </div>
          <Btn icon="file">내보내기</Btn>
        </div>
      </div>

      <div className="anal-kpi-row">
        {[
          { lbl:'이번 달 매출',  val:'124,580,000', unit:'원', delta:'+8.4%', tone:'success', spark:[100,98,102,105,110,107,114,118,116,120,124], color:'#2563EB' },
          { lbl:'외래 환자',    val:'1,247',       unit:'명', delta:'+2.1%', tone:'success', spark:[120,125,118,128,132,130,134,138,140,142,140], color:'#10B981' },
          { lbl:'평균 진료비',  val:'99,884',      unit:'원', delta:'+6.2%', tone:'success', spark:[88,90,92,89,95,94,97,99,100,99,100], color:'#F59E0B' },
          { lbl:'환자 만족도',  val:'4.6',         unit:'/ 5', delta:'-0.1', tone:'danger',  spark:[4.5,4.6,4.7,4.6,4.6,4.7,4.6,4.5,4.6,4.6,4.6], color:'#7C3AED' },
        ].map((k, i) => (
          <div className="anal-kpi" key={i}>
            <div className="anal-kpi-top">
              <div className="anal-kpi-lbl">{k.lbl}</div>
              <span className={'kpi-delta ' + (k.tone==='success'?'up':'dn')}>
                <Icon name={k.tone==='success'?'arrowUp':'arrowDown'} size={11}/>{k.delta}
              </span>
            </div>
            <div className="anal-kpi-val">{k.val}<span className="kpi-unit2">{k.unit}</span></div>
            <div className="anal-kpi-spark"><AnalLine data={k.spark} color={k.color}/></div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-row">
            <div>
              <div className="ctitle">일별 매출 추이</div>
              <div className="small" style={{marginTop: 2}}>최근 11일 · 단위 백만원</div>
            </div>
            <Chip tone="success">+8.4%</Chip>
          </div>
          <div className="anal-chart">
            <AnalBars data={[8.4, 9.1, 7.8, 10.2, 11.3, 9.6, 12.4, 13.1, 11.8, 12.6, 13.2]} color="#2563EB"/>
            <div className="anal-x">
              {['5/1','5/2','5/3','5/4','5/5','5/6','5/7','5/8','5/9','5/10','5/11'].map(d => <span key={d}>{d}</span>)}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-row">
            <div>
              <div className="ctitle">진료과별 환자 분포</div>
              <div className="small" style={{marginTop: 2}}>이번 달 · 총 1,247명</div>
            </div>
            <Chip>외래팀</Chip>
          </div>
          <div className="anal-dept-list">
            {[
              { dept:'정형외과', v: 612, pct: 49, color:'#2563EB' },
              { dept:'내과',     v: 284, pct: 23, color:'#10B981' },
              { dept:'재활의학과',v: 178, pct: 14, color:'#F59E0B' },
              { dept:'영상의학과',v: 102, pct: 8,  color:'#7C3AED' },
              { dept:'기타',     v: 71,  pct: 6,  color:'#71717A' },
            ].map((d, i) => (
              <div className="anal-dept-row" key={i}>
                <div className="anal-dept-name">{d.dept}</div>
                <div className="anal-dept-bar">
                  <div className="anal-dept-fill" style={{width: d.pct+'%', background: d.color}}/>
                </div>
                <div className="anal-dept-val">{d.v}<span className="small"> · {d.pct}%</span></div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-row">
            <div>
              <div className="ctitle">수술 건수</div>
              <div className="small" style={{marginTop: 2}}>최근 11일</div>
            </div>
            <span className="strong" style={{fontSize: 18}}>54건</span>
          </div>
          <div className="anal-chart">
            <AnalBars data={[3,5,4,6,5,7,6,8,5,4,1]} color="#10B981"/>
            <div className="anal-x">
              {['5/1','5/2','5/3','5/4','5/5','5/6','5/7','5/8','5/9','5/10','5/11'].map(d => <span key={d}>{d}</span>)}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-row">
            <div>
              <div className="ctitle">평균 대기시간</div>
              <div className="small" style={{marginTop: 2}}>접수 → 진료 시작</div>
            </div>
            <Chip tone="warn">14분</Chip>
          </div>
          <div className="anal-chart">
            <AnalBars data={[12,15,13,18,11,14,12,16,17,14,14]} color="#F59E0B"/>
            <div className="anal-x">
              {['5/1','5/2','5/3','5/4','5/5','5/6','5/7','5/8','5/9','5/10','5/11'].map(d => <span key={d}>{d}</span>)}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// ───────────────────────────── 입금 실시간조회 ─────────────────────────────
const AddonDeposit = () => {
  const tx = [
    { time:'14:23:47', name:'송봉운', amt: 152000,  method:'카드',   item:'외래 진료비',    state:'완료', tone:'success' },
    { time:'14:18:12', name:'박근식', amt: 88500,   method:'현금',   item:'영상 검사료',    state:'완료', tone:'success' },
    { time:'14:11:33', name:'곽유진', amt: 1200000, method:'카드',   item:'입원 보증금',    state:'완료', tone:'success' },
    { time:'14:02:08', name:'허경진', amt: 245000,  method:'계좌이체',item:'수술 선납금',   state:'대기', tone:'warn' },
    { time:'13:48:54', name:'박성민', amt: 14200,   method:'카드',   item:'재진료 진료비',  state:'완료', tone:'success' },
    { time:'13:42:11', name:'탁순자', amt: 380500,  method:'카드',   item:'외래 검사료',    state:'완료', tone:'success' },
    { time:'13:38:25', name:'이관식', amt: 56000,   method:'현금',   item:'외래 진료비',    state:'완료', tone:'success' },
    { time:'13:30:02', name:'정만수', amt: 198000,  method:'카드',   item:'영상 검사료',    state:'환불', tone:'danger' },
  ];
  return (
    <>
      <div className="addon-pageheader">
        <div>
          <div className="addon-h1">입금 실시간조회</div>
          <div className="addon-sub">2026년 5월 11일 · 입금 142건 · 총 9,407,830원</div>
        </div>
        <div className="row" style={{gap: 8}}>
          <input className="input" type="date" defaultValue="2026-05-11"/>
          <select className="input"><option>전체 결제수단</option><option>카드</option><option>현금</option><option>계좌이체</option></select>
          <Btn icon="refresh">새로고침</Btn>
          <Btn variant="primary" icon="file">내보내기</Btn>
        </div>
      </div>

      <div className="migrate-banner">
        <Icon name="alertCircle" size={18}/>
        <div style={{flex: 1}}>
          <div className="strong">Chart 프로그램으로 이관 예정</div>
          <div className="small">현재는 MSO에서 조회 가능하나, 2026년 하반기부터 Chart 프로그램에서 통합 관리됩니다.</div>
        </div>
        <Btn size="sm">이관 일정 보기</Btn>
      </div>

      <div className="addon-summary-row">
        <div className="kpi-simple">
          <div className="kpi-ico"><Icon name="won" size={16}/></div>
          <div className="kpi-info"><div className="kpi-lbl">오늘 총 입금</div><div className="kpi-sub">14:24 기준</div></div>
          <div className="kpi-right"><div className="kpi-simple-val" style={{fontSize: 20}}>9,407,830<span className="kpi-unit2">원</span></div></div>
        </div>
        <div className="kpi-simple">
          <div className="kpi-ico success"><Icon name="checkCircle" size={16}/></div>
          <div className="kpi-info"><div className="kpi-lbl">완료 건수</div><div className="kpi-sub">정상 처리</div></div>
          <div className="kpi-right"><div className="kpi-simple-val">138<span className="kpi-unit2">건</span></div></div>
        </div>
        <div className="kpi-simple">
          <div className="kpi-ico warn"><Icon name="clock" size={16}/></div>
          <div className="kpi-info"><div className="kpi-lbl">처리 대기</div><div className="kpi-sub">확인 필요</div></div>
          <div className="kpi-right"><div className="kpi-simple-val">3<span className="kpi-unit2">건</span></div></div>
        </div>
        <div className="kpi-simple">
          <div className="kpi-ico danger"><Icon name="alertTri" size={16}/></div>
          <div className="kpi-info"><div className="kpi-lbl">환불·취소</div><div className="kpi-sub">오늘 누적</div></div>
          <div className="kpi-right"><div className="kpi-simple-val">1<span className="kpi-unit2">건</span></div></div>
        </div>
      </div>

      <div className="card" style={{padding: 0, overflow:'hidden'}}>
        <div className="addon-toolbar">
          <div className="row" style={{gap: 8}}>
            <div className="input-wrap">
              <Icon name="search" size={14} className="ico"/>
              <input className="input" placeholder="환자명·금액 검색" style={{height: 32, paddingLeft: 30, fontSize: 12, minWidth: 240}}/>
            </div>
            <div className="seg" style={{padding: 2}}>
              <button className="on" style={{padding: '4px 12px', fontSize: 11}}>전체</button>
              <button style={{padding: '4px 12px', fontSize: 11}}>완료</button>
              <button style={{padding: '4px 12px', fontSize: 11}}>대기</button>
              <button style={{padding: '4px 12px', fontSize: 11}}>환불</button>
            </div>
          </div>
          <span className="small">실시간 갱신 — 5초 전</span>
        </div>
        <table className="data-tbl">
          <thead>
            <tr>
              <th style={{width: 100}}>시각</th>
              <th>환자</th>
              <th>항목</th>
              <th style={{width: 100}}>결제수단</th>
              <th style={{width: 130, textAlign:'right'}}>금액</th>
              <th style={{width: 90}}>상태</th>
              <th style={{width: 100, textAlign:'right'}}></th>
            </tr>
          </thead>
          <tbody>
            {tx.map((t, i) => (
              <tr key={i}>
                <td style={{fontFeatureSettings:'"tnum"', color:'var(--z-600)'}} className="small">{t.time}</td>
                <td className="strong">{t.name}</td>
                <td className="small">{t.item}</td>
                <td><span className="pri-pill tone-accent">{t.method}</span></td>
                <td style={{textAlign:'right', fontFeatureSettings:'"tnum"', fontWeight: 800}}>{t.amt.toLocaleString()}<span className="kpi-unit2">원</span></td>
                <td><Chip tone={t.tone}>{t.state}</Chip></td>
                <td style={{textAlign:'right'}}><Btn size="sm">상세</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

// ───────────────────────────── 외부 연동 (주차관제 · 웹팩스) ─────────────────────────────
const ExternalLinks = {
  parking: {
    title: '주차관제',
    sub: '병원 주차장 입출차 · 정산 시스템 (외부 연동)',
    vendor: 'ParkSys Pro v3.2',
    icon: 'package',
    color: '#2563EB',
    quickStats: [
      { lbl:'현재 입차',     v: 84, u:'대', tone:'accent'  },
      { lbl:'가용 자리',     v: 36, u:'대', tone:'success' },
      { lbl:'장기 미정산',   v: 3,  u:'대', tone:'warn'    },
      { lbl:'오늘 정산',     v: 156,u:'건', tone:'muted'   },
    ],
    rows: [
      { car:'12가 3456', enter:'09:14', name:'송봉운', dept:'정형외과', state:'외래 완료', tone:'success' },
      { car:'34나 5678', enter:'09:48', name:'박근식', dept:'정형외과', state:'외래 완료', tone:'success' },
      { car:'56다 7890', enter:'10:02', name:'곽유진', dept:'정형외과', state:'외래 진료중', tone:'warn' },
      { car:'78라 1234', enter:'08:30', name:'(직원)', dept:'경영지원팀', state:'직원 무료', tone:'muted' },
      { car:'90마 5678', enter:'11:15', name:'허경진', dept:'정형외과', state:'미정산', tone:'danger' },
    ],
  },
  webfax: {
    title: '웹팩스',
    sub: '인바운드/아웃바운드 팩스 통합 관리 (외부 연동)',
    vendor: 'WebFax Cloud v2.1',
    icon: 'send',
    color: '#7C3AED',
    quickStats: [
      { lbl:'수신',     v: 12, u:'건', tone:'accent'  },
      { lbl:'발신',     v: 8,  u:'건', tone:'success' },
      { lbl:'전송 대기',v: 1,  u:'건', tone:'warn'    },
      { lbl:'미확인',   v: 4,  u:'건', tone:'danger'  },
    ],
    rows: [
      { car:'IN  · 042-***-1284', enter:'14:18', name:'대구병원',  dept:'환자 의뢰서', state:'미확인', tone:'danger' },
      { car:'OUT · 053-***-5512', enter:'13:52', name:'한국건강검진', dept:'검진 결과', state:'전송완료', tone:'success' },
      { car:'IN  · 02-***-7790',  enter:'12:30', name:'영동약국',  dept:'처방 확인',  state:'확인',  tone:'muted' },
      { car:'OUT · 02-***-1102',  enter:'11:14', name:'국민건강보험', dept:'청구 자료', state:'전송완료', tone:'success' },
      { car:'OUT · 053-***-4407', enter:'10:55', name:'서울아산병원', dept:'협진 의뢰',  state:'전송 대기', tone:'warn' },
    ],
  },
};

const AddonExternalLink = ({ kind }) => {
  const cfg = ExternalLinks[kind];
  return (
    <>
      <div className="addon-pageheader">
        <div>
          <div className="addon-h1">{cfg.title}</div>
          <div className="addon-sub">{cfg.sub}</div>
        </div>
        <div className="row" style={{gap: 8}}>
          <Btn icon="refresh">새로고침</Btn>
          <Btn variant="primary" icon="send">외부 시스템 새 창 열기 ↗</Btn>
        </div>
      </div>

      <div className="ext-banner">
        <div className="ext-vendor-ico" style={{background: cfg.color}}>
          <Icon name={cfg.icon} size={22}/>
        </div>
        <div style={{flex: 1}}>
          <div className="strong" style={{fontSize: 15}}>외부 시스템 — {cfg.vendor}</div>
          <div className="small" style={{marginTop: 2}}>MSO에서 핵심 지표만 미러링합니다. 상세 조작은 외부 시스템에서 진행하세요.</div>
        </div>
        <div className="row" style={{gap: 8}}>
          <Chip tone="success">연결됨</Chip>
          <span className="small">동기 1분 전</span>
        </div>
      </div>

      <div className="addon-summary-row">
        {cfg.quickStats.map((s, i) => (
          <div key={i} className="kpi-simple">
            <div className={'kpi-ico ' + (s.tone === 'muted' ? '' : s.tone)}>
              <Icon name={['package','checkCircle','clock','alertTri'][i]} size={16}/>
            </div>
            <div className="kpi-info"><div className="kpi-lbl">{s.lbl}</div><div className="kpi-sub">실시간</div></div>
            <div className="kpi-right"><div className="kpi-simple-val">{s.v}<span className="kpi-unit2">{s.u}</span></div></div>
          </div>
        ))}
      </div>

      <div className="card" style={{padding: 0, overflow:'hidden'}}>
        <div className="addon-toolbar">
          <div className="row" style={{gap: 8}}>
            <div className="input-wrap">
              <Icon name="search" size={14} className="ico"/>
              <input className="input" placeholder={kind === 'parking' ? '차량번호·환자명 검색' : '발신·수신처 검색'} style={{height: 32, paddingLeft: 30, fontSize: 12, minWidth: 260}}/>
            </div>
          </div>
          <span className="small">{cfg.rows.length}건 미리보기 · 전체는 외부 시스템에서 확인</span>
        </div>
        <table className="data-tbl">
          <thead>
            <tr>
              <th style={{width: 180}}>{kind === 'parking' ? '차량번호' : '구분 · 번호'}</th>
              <th style={{width: 80}}>{kind === 'parking' ? '입차' : '시각'}</th>
              <th>{kind === 'parking' ? '환자/직원' : '발신/수신처'}</th>
              <th>{kind === 'parking' ? '진료과' : '내용'}</th>
              <th style={{width: 130}}>상태</th>
              <th style={{width: 100, textAlign:'right'}}></th>
            </tr>
          </thead>
          <tbody>
            {cfg.rows.map((r, i) => (
              <tr key={i}>
                <td className="strong" style={{fontFamily: 'var(--mono)', fontSize: 12}}>{r.car}</td>
                <td className="small" style={{fontFeatureSettings:'"tnum"'}}>{r.enter}</td>
                <td className="strong">{r.name}</td>
                <td className="small">{r.dept}</td>
                <td><Chip tone={r.tone}>{r.state}</Chip></td>
                <td style={{textAlign:'right'}}><Btn size="sm">외부 ↗</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

const AddonParking = () => <AddonExternalLink kind="parking"/>;
const AddonWebfax  = () => <AddonExternalLink kind="webfax"/>;

// ───────────────────────────── 통합 ─────────────────────────────
const ADDON_SCREENS = {
  hub:       AddonHub,
  org:       AddonOrg,
  inventory: AddonInventory,
  worknow:   (props) => {
    const C = window.AddonWorkNowSwitcher || AddonWorkNow;
    return <C {...props}/>;
  },
  handoff:   AddonHandoff,
  eval:      AddonEvaluation,
  discharge: AddonDischarge,
  consult:   AddonConsult,
  opcheck:   AddonOpCheck,
  deposit:   AddonDeposit,
  closing:   AddonClosing,
  parking:   AddonParking,
  webfax:    AddonWebfax,
};

const ADDON_NOTES = {
  hub: {
    kicker:'§ ADD-ON — 모듈 허브',
    title:'12개 모듈을 한 화면에서 빠르게 진입. 외부 연동 · Chart 이관 모듈도 같은 사이드바에서.',
    points:[
      { t:'2차 사이드바로 모듈 전환', b:'원본은 "목록으로 ← 진입 → 목록으로" 반복. 2차 사이드바에 12개 모듈을 고정 노출해 컨텍스트 유지하며 즉시 전환.' },
      { t:'사이드바 그룹 분리 — 핵심 / 외부·이관', b:'상위 9개는 MSO 자체 모듈, 하위 4개는 외부 연동(주차관제·웹팩스) + Chart 이관 예정(입금·마감보고). 사이드바 안에 그룹 디바이더로 구분.' },
      { t:'태그 — Chart / ↗ 외부', b:'사이드바·허브 카드에 작은 태그(Chart, ↗)로 모듈 성격 표시. 사용자가 이관·외부 모듈인지 한눈에 식별.' },
      { t:'허브 카드 — 미니 stat 첨부', b:'카드마다 현재 상태 1줄(예: "오늘 수술 1건", "근무중 18 · 휴게 3", "오늘 142건 · 9.4M원")을 노출해 진입 전 우선순위 판단.' },
      { t:'PageHeader — 모듈 안에서 H1 위계', b:'각 모듈은 22px H1 + 1줄 서브로 시작. 우측에 모듈 전용 액션(셀렉트/검색/CTA).' },
      { t:'분석 모듈 — 관리자로 이관', b:'경영 분석은 추가기능이 아닌 관리자 메뉴에 속하므로 분석 모듈은 제거. 관리자 메뉴 작업 시 경영대시보드/경영분석으로 통합.' },
    ],
  },
  inventory: {
    kicker:'§ ADD-ON — 부서별 재고',
    title:'본사 ↔ 부서 발주 흐름 + 주(week) 기반 최소재고 설정. 부서별로 1~4주 자유 조정.',
    points:[
      { t:'부서 컨텍스트 배너 — 본사/부서 모드 분리', b:'화면 상단에 현재 부서 배지(🏢 본사 / 🩺 부서). 부서 모드는 "MSO 본사에게 자동 요청", 본사 모드는 "외부 거래처에 발주서 직접 발송"으로 흐름 명시.' },
      { t:'기준 설정 모드 — 1~4주', b:'우상단 segmented "재고 보기 / 기준 설정"으로 전환. 설정 모드에서 품목별 1주/2주/3주/4주 segmented로 자유 조정 → 최소재고 자동 재계산.' },
      { t:'주간 소비 컬럼 + 잔여분량 표시', b:'잔여 셀에 "현재고 + N.N주 분량" 부가 정보. 주간 소비 컬럼으로 사용 속도 추적. 부서마다 다른 소비 패턴 반영.' },
      { t:'최소재고 = 주간소비 × 보유기준(주)', b:'복잡한 수치 입력 X. 주간 소비 × 1~4 곱셈만으로 부서별 1주 빠른 회전 vs 4주 안전 재고를 선택. 일괄 적용/전체 저장 풋터.' },
      { t:'행 액션 — 컨텍스트별 라벨 다름', b:'발주 필요 행에서 부서 모드는 "MSO에게 발주" / 본사 모드는 "발주서에 추가". 같은 행에 다른 의미.' },
      { t:'본사 일괄 → 발주서 모달', b:'본사 우상단 "자동 발주 일괄 → 발주서 생성" 클릭 시 발주서 sheet 오버레이. 거래처별 그룹 + 단가 + 합계 + 거래처별 발송.' },
    ],
  },
  opcheck: {
    kicker:'§ ADD-ON — OP체크',
    title:'환자 리스트 + 상세를 split view로. 진행 스텝과 체크리스트가 한 화면에.',
    points:[
      { t:'상단 4-stat 박스 제거', b:'준비중/준비완료/수술중/완료 카운트는 좌측 환자 리스트의 칩 카운트로 통합. 화면 상단 호흡 회복, 본문이 즉시 시작.' },
      { t:'Split view — 좌 리스트 + 우 상세', b:'원본은 main → click → detail full screen 전환. 개선: 좌 280px 환자 리스트 + 우 상세로 컨텍스트 유지.' },
      { t:'환자 카드 — 시간 · 수술 · 상태 칩', b:'각 환자 카드에 09:00 시간 + 수술명 + 방/차트 + 상태 칩. 클릭 즉시 우측에 상세 로딩.' },
      { t:'진행 스텝 4단계 시각화', b:'준비중→준비완료→수술중→완료를 동그라미+선으로. 완료된 단계는 체크 마크 + 진한 톤.' },
      { t:'체크리스트 2칸 그리드', b:'수술 전 준비/수술 중 소모품을 2단 그리드로. 각 항목 체크박스 + 메모 인라인.' },
      { t:'액션 행 — primary + secondary', b:'"준비 완료 처리" primary 녹색, "메시지 전송" / "인계(수술 시작)" / "수술완료"는 보조. 우측에 마취 유형·템플릿 메타.' },
    ],
  },
  handoff: {
    kicker:'§ ADD-ON — 병동인계',
    title:'달력 + 인계 입력 + 인계 리스트를 한 흐름으로.',
    points:[
      { t:'좌 달력 + 우 인계 split', b:'원본은 calendar + form + list 3단. 개선: 좌 달력(8행 캘린더), 우 입력 폼. 아래에 인계 리스트.' },
      { t:'미니 stat 3종 — 캘린더 하단', b:'선택일 공통 / 환자별 인계 / 검색 결과를 3 stat으로 캘린더 카드 안에 통합. 별도 카드 분리 X.' },
      { t:'공통/환자별 segmented + 날짜', b:'우측 패널 최상단 segmented + 우측에 선택 날짜 메타.' },
      { t:'템플릿 + 버전 — 2-col 그리드', b:'템플릿/버전 셀렉트 2열, 그 아래 Day/일반 selects + 안내문. 시간 분류·중요도 분류를 동등 가중치로.' },
      { t:'인계 row — 태그 칩 + 본문 + 액션', b:'Day/일반/공통 + 팀명·시간을 한 줄, 본문 한 줄, 우측에 분류 selecto. 한 row 정보 밀도↑.' },
      { t:'필터 — 인계 검색 / 날짜 선택', b:'2026-05-11 + 오늘 버튼 + 검색을 한 줄로. 우측에 병상 설정 primary.' },
    ],
  },
  closing: {
    kicker:'§ ADD-ON — 마감보고',
    title:'Chart 이관 예정 안내 배너 + 기존 마감 흐름 유지.',
    points:[
      { t:'화면 상단 — Chart 이관 예정 배너', b:'"Chart 프로그램으로 이관 예정" 배너를 PageHeader 직하단에 노출. 사용자가 마감 흐름이 곧 옮겨질 것을 미리 인지.' },
      { t:'목록/새 작성 — segmented', b:'우상단 segmented "마감 목록 / 새 마감 작성" + primary CTA. 한 페이지에서 토글.' },
      { t:'목록 row — 날짜 · 총액 · 작성자 · 상태', b:'카드형 row 5열 그리드(날짜 · 총액 · 칩 · 작성자 · 액션).' },
      { t:'폼 + 다크 summary 카드', b:'기초/기말 시재 3-col + 수납내역 표 + 수표 기록 + 다크 "오늘 총 수납금액" 카드 유지.' },
      { t:'풀폭 primary 저장 버튼', b:'"오늘 업무 마감 및 보고 저장" 풀폭 다크 버튼. 가장 마지막 액션을 명확히.' },
      { t:'이관 이후 — 본 화면 deprecation', b:'Chart 이관 시점에 본 모듈은 "Chart에서 처리" 안내 + 외부 링크로 전환.' },
    ],
  },
  org: {
    kicker:'§ ADD-ON — 조직도',
    title:'원본 hierarchical 조직도 — 병원장 → 관리자 → 부서그룹 → 팀 → 직원 카드.',
    points:[
      { t:'병원장 → 관리자 → 부서 트리', b:'최상단 병원장 1장, 그 아래 관리자 2-3장(실장·간호과장), 다시 그 아래 부서그룹(간호부/진료부/총무부/기타) 패널.' },
      { t:'부서그룹 4종 — 컬러 헤더 밴드', b:'간호부=blue, 진료부=green, 총무부=orange, 기타=violet. 각 패널 상단 컬러 밴드에 부서명·팀수·인원.' },
      { t:'팀 카드 — 팀별 컬러 헤더', b:'병동팀=cyan, 수술팀=gray, 검사팀=plain, 외래팀=green, 원무팀=pink, 관리팀=purple, 영양팀=orange. 헤더 안에 팀명+인원.' },
      { t:'직원 카드 — 사진 + 이름 + 직급 + 상태 dot', b:'28px 동그라미 아바타(이니셜) + 이름(800) + 직급(small) + 우하단 작은 dot(녹색=출근중, 노랑=출근전).' },
      { t:'빈 부서 — "팀원 없음" 안내', b:'진료부처럼 팀이 0개인 부서는 패널 안에 단순 "팀원 없음" 텍스트로 비어있음을 명시. 패널 자체는 유지.' },
      { t:'다중 병원 — 병원별 카드', b:'박철홍정형외과·수연의원처럼 그룹사·분원을 별도 카드로 묶음. 우상단 ORG 태그로 조직도 단위 식별.' },
    ],
  },
  worknow: {
    kicker:'§ ADD-ON — 근무현황',
    title:'근무/휴게/점심/외근/퇴근/결근 6 상태를 한 화면에서 1분 단위 갱신.',
    points:[
      { t:'6 상태 stat bar', b:'근무중(success)/휴게(warn)/점심(warn)/외근(accent)/퇴근(muted)/결근(danger)을 좌측 컬러 dot + 숫자로. 상단에 가로 stat bar로 누적 인원.' },
      { t:'직원 카드 — 좌 컬러 표시', b:'카드 좌측 4px 컬러 stripe로 현재 상태 색. 호버 시 상세 카드로 확장.' },
      { t:'마지막 갱신 시각 명시', b:'"08:48 출근", "10:15부터 15분 휴게" 형식으로 last action 시각 명시. 의사결정에 필요한 컨텍스트 제공.' },
      { t:'부서 필터 + 카드/표 토글', b:'우상단 부서 select + 카드/표 segmented. 결근 임박 직원은 표 뷰에서 정렬 가능.' },
      { t:'새로고침 보조 액션', b:'자동 1분 갱신, 수동 새로고침 버튼 우상단에. 갱신 시각 sub 라인에 항상 노출.' },
      { t:'결근 시 danger 칩', b:'결근/무단 결근은 danger 칩 + danger 좌측 stripe. 관리자가 즉시 후속 조치 가능.' },
    ],
  },
  consult: {
    kicker:'§ ADD-ON — 수술상담',
    title:'음성 녹음 + AI 분석으로 상담 동의서 충족 여부를 자동 확인. 동의서 누락 0건.',
    points:[
      { t:'음성 녹음 + AI 분석 (베타)', b:'원본 기능 복원. 상담 시작 시 한 번 누르면 녹음 + 종료 후 자동 분석. AI가 동의서 7항목 충족 여부를 타임스탬프와 함께 표시.' },
      { t:'분석 결과 — 충족/미충족 즉시 식별', b:'"합병증·부작용 설명 — 언급 없음 — 추가 설명 필요" 같은 누락 항목을 danger 톤으로 강조. 충족 항목은 ✓ + 타임스탬프(클릭 시 재생).' },
      { t:'녹음 파일 자동 정리', b:'"상담_송봉운_20260511_1410.wav" 형식으로 환자·일시 자동 명명. 14분 23초 길이·분석 완료 상태를 한 row에.' },
      { t:'4 KPI — 오늘/완료/미완료/재상담', b:'오늘 상담 / 동의 완료(월) / 동의 미완료(24시간 내) / 재상담 요청을 4개 stat. danger·warn 톤으로 우선순위.' },
      { t:'Split — 좌 리스트 + 우 상담 상세', b:'좌측 표(환자/수술/상담의/일시/상태/동의), 우측에 선택된 상담의 녹음·분석·체크리스트·동의서·메모. 컨텍스트 유지하며 빠른 처리.' },
      { t:'상담 체크리스트 6항목 + AI 자동 체크', b:'수술명/합병증/대체치료/회복기간/비용/보호자 6항목 표준화. AI 분석 결과가 체크박스에도 자동 반영(검토 후 확정).' },
    ],
  },
  analytics: {
    kicker:'§ ADD-ON — 분석',
    title:'(관리자 메뉴로 이관됨)',
    points:[
      { t:'경영분석은 관리자 영역', b:'분석/대시보드 기능은 관리자(경영대시보드/재무대시보드/통합보고서/경영분석)와 의미가 겹쳐, 추가기능에서는 제외.' },
    ],
  },
  deposit: {
    kicker:'§ ADD-ON — 입금 실시간조회',
    title:'실시간 입금 내역을 5초 단위로 미러링. Chart 이관 시 외부로 전환.',
    points:[
      { t:'Chart 이관 예정 배너', b:'헤더 직하단에 노란 톤 배너로 "Chart 프로그램으로 이관 예정" 명시. 이관 일정 보기 액션 포함.' },
      { t:'4 KPI — 총입금/완료/대기/환불', b:'오늘 누적 총입금(원) + 완료/대기/환불 건수. danger/warn 톤으로 처리 필요 건 즉시 식별.' },
      { t:'표 — 시각·환자·항목·결제수단·금액·상태', b:'7열 sticky 헤더. 시각은 tabular nums, 금액은 우측 정렬, 결제수단은 칩, 상태는 톤 칩.' },
      { t:'결제수단 필터 + 상태 segmented', b:'전체 결제수단 select + 전체/완료/대기/환불 segmented control. 1초 안에 좁히기.' },
      { t:'실시간 갱신 표시', b:'우상단에 "실시간 갱신 — 5초 전" 캡션. 사용자가 화면 신선도 즉시 확인.' },
      { t:'내보내기 + 새로고침 액션', b:'헤더 우상단에 PDF/Excel 내보내기 + 수동 새로고침. 일별 마감 시 보조.' },
    ],
  },
  parking: {
    kicker:'§ ADD-ON — 주차관제 (외부 연동)',
    title:'외부 시스템(ParkSys Pro)을 미러링. 핵심 지표 + 미리보기 5건만 노출.',
    points:[
      { t:'외부 시스템 배너 — 연결 상태 명시', b:'ParkSys Pro v3.2와 동기화 1분 전. 연결됨 칩으로 안정 상태 표시.' },
      { t:'4 quick stats — 입차/가용/장기/오늘 정산', b:'현재 입차/가용 자리/장기 미정산/오늘 정산을 4 KPI로. 장기 미정산은 warn 톤.' },
      { t:'표 — 차량번호 · 입차 · 환자 · 상태', b:'5건 미리보기. 차량번호는 monospace 폰트, 입차 시각 tabular. 더 보기는 "외부 ↗" 액션으로 새 창.' },
      { t:'"외부 시스템 새 창 열기" 명시', b:'우상단 primary CTA로 외부 시스템 진입을 분명히. 사용자가 MSO에서 미리보기 후 진짜 조작은 외부에서.' },
      { t:'WebFax와 같은 컴포넌트 재사용', b:'외부 연동은 모두 ExternalLinks 설정 객체 + AddonExternalLink 컴포넌트로 통일. 새 외부 시스템 추가도 한 줄.' },
      { t:'미정산 위험 행 — danger 칩', b:'미정산/장기 주차 행은 danger 톤 칩으로 즉시 식별. 직원 무료는 muted 톤.' },
    ],
  },
  webfax: {
    kicker:'§ ADD-ON — 웹팩스 (외부 연동)',
    title:'WebFax Cloud 인바운드/아웃바운드 미러링. 미확인 4건 즉시 식별.',
    points:[
      { t:'외부 시스템 배너 — WebFax Cloud v2.1', b:'연결 상태 + 동기 시각 표시. 주차관제와 동일한 외부 연동 패턴.' },
      { t:'4 quick stats — 수신/발신/대기/미확인', b:'수신·발신 건수 + 전송 대기 + 미확인. 미확인은 danger 톤으로 우선순위.' },
      { t:'표 — IN/OUT 구분 + 발수신처', b:'"IN · 042-***-1284" 같은 발수신처 표기. 시간 + 발수신처 + 내용 + 상태 5열 row.' },
      { t:'OUT 대기 → 외부에서 처리', b:'전송 대기 OUT 건은 "외부 ↗" 액션으로 외부 시스템에서 마무리. MSO는 미리보기만.' },
      { t:'미확인 IN — 의료진 즉시 확인', b:'대구병원 환자 의뢰서 등 미확인 IN은 danger 칩. 의료진이 빠르게 확인 → 환자 인계.' },
      { t:'발신 검색 + 새로고침', b:'발신·수신처 검색 1줄 + 새로고침. 외부 시스템 새 창 열기 primary로 마무리.' },
    ],
  },
  eval: {
    kicker:'§ ADD-ON — 직원평가',
    title:'좌 리스트 + 우 폼 + 하단 히스토리. 5단계 슬라이더로 점수 빠르게.',
    points:[
      { t:'Split — 좌 직원 + 우 폼', b:'좌측 280px 직원 리스트 + 우측 입력 폼 split. 선택 시 즉시 폼 갱신.' },
      { t:'기록 유형 칩 — 5종', b:'성과/문제사항/칭찬/주의/기타를 5칩으로. 각 칩별 톤(accent/danger/success/warn/muted).' },
      { t:'슬라이더 — 1~5 빠른 점수', b:'드롭다운 X, 슬라이더 + 큰 숫자로. 한 손으로 빠르게.' },
      { t:'기록자 우상단 — 권한 명시', b:'"기록자 (부서장)" + 이름을 카드 우상단 small + strong으로. 평가 권한 시각화.' },
      { t:'히스토리 row — 칩 + 별점 + 본문', b:'평가 기록을 type 칩 + ★ 별점 + 본문 + 날짜 5열 row로. 한 줄에서 검색 가능.' },
      { t:'실시간 저장 강조', b:'"실시간 기록 저장" primary CTA로 자주 저장 유도. 자동 저장 안내는 helper로 추가.' },
    ],
  },
  discharge: {
    kicker:'§ ADD-ON — 퇴원심사',
    title:'심사 목록 / 새 심사 / 기본항목 설정을 segmented 하나로. 진행률은 한 줄.',
    points:[
      { t:'3-segmented — 목록/새심사/설정', b:'원본 화면 6개를 segmented 3개 모드로 묶어 한 페이지에서 전환. 새 심사 등록도 같은 페이지.' },
      { t:'4 KPI — 진행/완료/평균/신규', b:'리스트 모드 상단 4 stat: 진행중·완료·평균 진행률·오늘 신규. 누적 관리 한눈에.' },
      { t:'심사 row — 칩 + 환자 + 진행률 바', b:'심사중 칩 + 환자명 + 태그 + 메타 + 진행률 바를 한 줄로. 진행률은 항목 채움%(N/total).' },
      { t:'새 심사 — 3-col 그리드', b:'환자정보 14개 필드를 3-col 정렬. 필수 *만 강조. 진단/입원 사유는 템플릿 select.' },
      { t:'기본 항목 설정 — 템플릿 카드 그리드', b:'TKR/ORIF/AS 같은 진단별 템플릿을 카드 그리드로. 항목 수 · 최근 사용 표기.' },
      { t:'상병명 — 자유 텍스트 다행', b:'차트에서 복사 붙여넣기 가능한 multi-line textarea. 진단코드 예시를 placeholder에.' },
    ],
  },
};

const AddonScreen = ({ feature = 'hub', setFeature = () => {} }) => {
  const Comp = ADDON_SCREENS[feature] || AddonHub;
  return (
    <div className="main">
      <div className="content">
        {feature === 'hub'
          ? <AddonHub onPick={setFeature}/>
          : <Comp onPick={setFeature}/>
        }
      </div>
    </div>
  );
};

const AddonSidebar2 = ({ feature, setFeature }) => (
  <aside className="sidebar2">
    <div className="s2-scroll" style={{display: 'grid', gap: 2, flex: 1, overflow: 'auto'}}>
      {ADDON_MODULES.map((m, i) => (
        <div key={m.id} className={'s2-item' + (feature === m.id ? ' on' : '')} onClick={() => setFeature(m.id)} title={m.label}>
          <Icon name={m.icon} size={16}/>
          <span style={{flex: 1, minWidth: 0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{m.label}</span>
          {m.external === 'chart'  && <span className="s2-tag chart">Chart</span>}
          {m.external === 'iframe' && <span className="s2-tag ext">↗</span>}
        </div>
      ))}
    </div>
    <div className="s2-foot">
      <select>
        <option>박철홍정형외과</option>
      </select>
    </div>
  </aside>
);

const AddonNotes = ({ feature = 'hub' }) => {
  const n = ADDON_NOTES[feature] || ADDON_NOTES.hub;
  return <Notes kicker={n.kicker} title={n.title} points={n.points}/>;
};

Object.assign(window, { AddonScreen, AddonSidebar2, AddonNotes, ADDON_MODULES });
