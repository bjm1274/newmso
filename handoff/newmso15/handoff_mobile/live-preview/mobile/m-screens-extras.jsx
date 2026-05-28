// MSO 모바일 — Screens (Extras) : 할일(Todo) · 서류제출(Docs) · 기안함 · 참조 문서함
// PC 메뉴 풀 커버를 위해 추가된 보조 화면.

// ═══════════════════════════════════════════════════════════════
// EX 1. 내정보 — 할일 (Todo)
// ═══════════════════════════════════════════════════════════════
const STodo = ({ onBack }) => {
  const [pri, setPri] = React.useState('all');
  const [range, setRange] = React.useState('day');
  const [done, setDone] = React.useState({});
  const items = [
    { p:'urgent', t:'5월 급여 검토 — 27명',          due:'오늘 18:00',  tag:'HR · 급여대장',     rep:'반복 없음' },
    { p:'high',   t:'의료기기 점검 결재 회신',         due:'내일 17:00',  tag:'결재 · 기안함',     rep:'반복 없음' },
    { p:'normal', t:'3교대 마법사 — 6월 근무표 초안',  due:'05/22',      tag:'HR · 근무표',       rep:'주 1회' },
    { p:'normal', t:'회사 행사 일정 공유 — 전사 메일', due:'05/15',      tag:'게시판 · 공지',     rep:'반복 없음' },
    { p:'low',    t:'백업 데이터 외부 보관 점검',     due:'05/28',      tag:'관리자 · 백업',     rep:'월 1회' },
    { p:'high',   t:'정수아 부서이동 인사발령 결재',  due:'내일 12:00',  tag:'HR · 인사발령',     rep:'반복 없음' },
    { p:'normal', t:'5월 비품 발주 거래처 컨택',     due:'05/14',      tag:'재고 · 발주',       rep:'반복 없음' },
  ];
  const cnt = { all:items.length, urgent:1, high:2, normal:3, low:1 };
  const labels = { all:'전체', urgent:'긴급', high:'높음', normal:'보통', low:'낮음' };
  const tones  = { urgent:'danger', high:'warning', normal:'accent', low:'' };
  const filtered = pri === 'all' ? items : items.filter(i => i.p === pri);
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="할일" sub={'마감 임박 ' + cnt.urgent + '건 · 오늘 ' + items.length}/>
      <div className="m-chip-bar">
        {Object.keys(labels).map(k => (
          <button key={k} className={pri === k ? 'on' : ''} onClick={()=>setPri(k)}>
            {labels[k]}<span className="cnt">{cnt[k]}</span>
          </button>
        ))}
      </div>
      <div style={{padding:'10px 16px', background:'var(--card)', borderBottom:'1px solid var(--border)'}}>
        <div className="m-seg">
          {['day','week','month'].map(r => (
            <button key={r} className={range === r ? 'on' : ''} onClick={()=>setRange(r)}>
              {{day:'일별', week:'주간', month:'월간'}[r]}
            </button>
          ))}
        </div>
      </div>
      <div className="m-scroll">
        <div style={{padding:'14px 16px 0'}}>
          {/* 빠른 등록 */}
          <div className="m-card" style={{padding:'12px 14px', marginBottom:12}}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <MIcon name="plus" size={18} color="var(--z-500)"/>
              <input placeholder="할 일을 입력하고 등록 — 예: 의료기기 점검 결재" style={{flex:1, fontSize:13, padding:'8px 0', color:'var(--z-700)'}}/>
              <MBtn size="sm" variant="primary">등록</MBtn>
            </div>
            <div style={{display:'flex', gap:5, marginTop:8, flexWrap:'wrap'}}>
              <MChip dot tone="accent">보통</MChip>
              <MChip><MIcon name="refresh" size={11} style={{marginRight:3}}/>반복 없음</MChip>
              <MChip><MIcon name="user" size={11} style={{marginRight:3}}/>내 작업</MChip>
              <MChip><MIcon name="calendar" size={11} style={{marginRight:3}}/>오늘</MChip>
            </div>
          </div>

          <div className="m-section-h" style={{padding:'0 0 8px'}}>
            <div className="lbl">{labels[pri]} 할 일 · {filtered.length}건</div>
            <span className="more">정렬</span>
          </div>
          <div className="m-card flush">
            {filtered.map((it, i, arr) => {
              const k = it.t;
              const isDone = !!done[k];
              return (
                <label key={i} style={{
                  display:'grid', gridTemplateColumns:'24px 1fr',
                  gap:12, padding:'14px 16px',
                  borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none',
                  alignItems:'flex-start',
                }}>
                  <button
                    onClick={(e)=>{e.preventDefault(); setDone(d => ({...d, [k]: !d[k]}));}}
                    style={{
                      width:22, height:22, borderRadius:6,
                      border: isDone ? 'none' : '1.5px solid var(--z-300)',
                      background: isDone ? 'var(--accent)' : 'transparent',
                      color:'#fff', display:'grid', placeItems:'center', marginTop:1, flexShrink:0,
                    }}>
                    {isDone && <MIcon name="check" size={14}/>}
                  </button>
                  <div style={{minWidth:0, opacity: isDone ? 0.45 : 1}}>
                    <div style={{display:'flex', alignItems:'center', gap:5, marginBottom:5}}>
                      <MChip tone={tones[it.p]}>{labels[it.p]}</MChip>
                      <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600, display:'inline-flex', alignItems:'center', gap:3, marginLeft:'auto'}}>
                        <MIcon name="calendar" size={11}/>{it.due}
                      </span>
                    </div>
                    <div style={{fontSize:14, fontWeight:700, letterSpacing:'-0.012em', textDecoration: isDone ? 'line-through' : 'none', color: isDone ? 'var(--z-500)' : 'var(--z-900)'}}>{it.t}</div>
                    <div style={{display:'flex', alignItems:'center', gap:8, marginTop:5, fontSize:11, color:'var(--z-500)', fontWeight:600}}>
                      <span style={{display:'inline-flex', alignItems:'center', gap:3}}><MIcon name="tag" size={11}/>{it.tag}</span>
                      <span style={{display:'inline-flex', alignItems:'center', gap:3}}><MIcon name="refresh" size={11}/>{it.rep}</span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// EX 2. 내정보 — 서류제출 (Docs)
// ═══════════════════════════════════════════════════════════════
const SDocs = ({ onBack }) => {
  const docs = [
    { l:'주민등록등본',         s:'submitted', d:'04/01' },
    { l:'신분증 사본',          s:'submitted', d:'04/12' },
    { l:'통장사본',             s:'submitted', d:'04/01' },
    { l:'잠복결핵 검진결과',     s:'submitted', d:'03/22' },
    { l:'가족관계증명서',        s:'pending' },
    { l:'주민등록초본',          s:'pending' },
    { l:'면허(자격)증 사본',     s:'pending' },
    { l:'보건증',               s:'pending' },
    { l:'일반 건강검진',         s:'pending' },
    { l:'개인정보 보호교육',     s:'pending' },
    { l:'성희롱 예방교육',       s:'pending' },
    { l:'산업안전 보건교육',     s:'pending' },
    { l:'직장내 괴롭힘 예방교육', s:'pending' },
    { l:'장애인 인식개선교육',   s:'pending' },
  ];
  const sub = docs.filter(d => d.s === 'submitted').length;
  const pend = docs.length - sub;
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="서류제출" sub={`완료 ${sub} · 미제출 ${pend}`}
        actions={<button><MIcon name="search" size={20}/></button>}/>
      <div className="m-scroll">
        {/* hero */}
        <div style={{padding:'14px 16px 0'}}>
          <div className="m-card" style={{padding:'16px 18px', display:'flex', alignItems:'center', gap:14}}>
            <div style={{width:60, height:60, position:'relative'}}>
              <svg viewBox="0 0 40 40" width="60" height="60">
                <circle cx="20" cy="20" r="17" fill="none" stroke="var(--z-100)" strokeWidth="5"/>
                <circle cx="20" cy="20" r="17" fill="none" stroke="var(--accent)" strokeWidth="5"
                  strokeDasharray={`${(sub/docs.length)*106.8} 200`} strokeDashoffset="0"
                  strokeLinecap="round" transform="rotate(-90 20 20)"/>
              </svg>
              <div className="m-tnum" style={{position:'absolute', inset:0, display:'grid', placeItems:'center', fontSize:13, fontWeight:800, color:'var(--accent)'}}>{Math.round(sub/docs.length*100)}%</div>
            </div>
            <div style={{flex:1}}>
              <div className="m-tnum" style={{fontSize:22, fontWeight:800, letterSpacing:'-0.025em'}}>{sub}<span style={{fontSize:13, color:'var(--z-500)', fontWeight:700, margin:'0 4px'}}>/</span>{docs.length}</div>
              <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginTop:2}}>제출 완료 · {pend}건 미제출</div>
            </div>
            <MBtn variant="primary" icon="plus" size="sm">제출</MBtn>
          </div>
        </div>

        <div className="m-section">
          <div className="m-section-h"><div className="lbl">미제출 {pend}</div></div>
          <div className="m-card flush">
            {docs.filter(d => d.s === 'pending').map((d,i,arr) => (
              <div key={i} className="m-list-row">
                <div className="ico-tile tone-warning"><MIcon name="fileText" size={18}/></div>
                <div>
                  <div className="lbl">{d.l}</div>
                  <div className="sub">미제출</div>
                </div>
                <MBtn size="sm" variant="primary">제출</MBtn>
              </div>
            ))}
          </div>
        </div>

        <div className="m-section">
          <div className="m-section-h"><div className="lbl">제출 완료 {sub}</div></div>
          <div className="m-card flush">
            {docs.filter(d => d.s === 'submitted').map((d,i,arr) => (
              <div key={i} className="m-list-row">
                <div className="ico-tile tone-success"><MIcon name="checkCircle" size={18}/></div>
                <div>
                  <div className="lbl">{d.l}</div>
                  <div className="sub">{d.d} 제출</div>
                </div>
                <MIcon name="download" size={18} color="var(--z-400)"/>
              </div>
            ))}
          </div>
        </div>
        <div style={{height:24}}/>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// EX 3. 결재 — 기안함 (Sent)
// ═══════════════════════════════════════════════════════════════
const SApprovalSent = ({ onBack }) => {
  const docs = [
    { id:1, t:'법인카드 사용 결의서 — 학회비',  ts:'5/11 13:01', step:'1/3 결재중', tone:'warning', amt:'320,000' },
    { id:2, t:'5월 비품 신청',                  ts:'5/10 16:22', step:'1/2 결재중', tone:'warning', amt:'175,000' },
    { id:3, t:'4월 영상장비 점검 보고',         ts:'5/7 09:14',  step:'승인',       tone:'success', amt:null },
    { id:4, t:'외부 강의 신청',                ts:'5/3 11:42',  step:'반려',       tone:'danger',  amt:null, m:'증빙 부족' },
    { id:5, t:'2026 상반기 연차 계획서',       ts:'4/28 14:30', step:'승인',       tone:'success', amt:null },
  ];
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="기안함" sub={`내가 올린 결재 · 총 ${docs.length}건`} actions={<>
        <button><MIcon name="search" size={20}/></button>
        <button><MIcon name="edit" size={20}/></button>
      </>}/>
      <div className="m-scroll">
        <div style={{padding:'14px 16px 16px', display:'flex', flexDirection:'column', gap:10}}>
          {docs.map(d => (
            <div key={d.id} className="m-card" style={{padding:'14px 16px'}}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
                <MChip tone={d.tone}>{d.step}</MChip>
                <div style={{flex:1}}/>
                <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>{d.ts}</span>
              </div>
              <div style={{fontSize:14, fontWeight:800, letterSpacing:'-0.012em'}}>{d.t}</div>
              {d.m && <div style={{fontSize:11, color:'var(--danger)', fontWeight:700, marginTop:6}}>사유: {d.m}</div>}
              {d.amt && <div className="m-tnum" style={{fontSize:13, fontWeight:800, marginTop:8, color:'var(--z-700)'}}>₩ {d.amt}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// EX 4. 결재 — 참조 문서함 (Ref)
// ═══════════════════════════════════════════════════════════════
const SApprovalRef = ({ onBack }) => {
  const docs = [
    { id:1, t:'5월 OP 일정 공유 및 인계',        who:'김지오', dept:'간호부', ts:'5/10', tone:'success', read:false },
    { id:2, t:'2026 상반기 연차 계획서 통합',    who:'백정민', dept:'경영지원', ts:'5/8', tone:'success', read:true },
    { id:3, t:'2층 외래 데스크탑 PC 수리 요청',  who:'홍자비', dept:'경영지원', ts:'5/8', tone:'warning', read:true },
    { id:4, t:'외래팀 의료기기 비품 신청',       who:'이나림', dept:'외래팀', ts:'5/10', tone:'warning', read:false },
  ];
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="참조 문서함" sub={`내가 참조 · ${docs.filter(d=>!d.read).length}건 미열람`}
        actions={<button><MIcon name="filter" size={20}/></button>}/>
      <div className="m-scroll">
        <div style={{padding:'14px 16px 0'}}>
          <div className="m-card flush">
            {docs.map((d,i,arr) => (
              <div key={d.id} className="m-list-row" style={{background: !d.read ? 'var(--accent-soft)' : 'transparent'}}>
                <div className={'ico-tile tone-'+(d.tone)}><MIcon name="fileText" size={18}/></div>
                <div>
                  <div className="lbl" style={{display:'flex', alignItems:'center', gap:6}}>
                    {d.t}
                    {!d.read && <span style={{width:6, height:6, borderRadius:999, background:'var(--accent)'}}/>}
                  </div>
                  <div className="sub">{d.who} · {d.dept} · {d.ts}</div>
                </div>
                <MIcon name="chevR" size={18} color="var(--z-400)"/>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// EX 5. 결재 — 작성하기 (Write) : 양식 선택 → 상세는 SApprovalDetail 재활용
// ═══════════════════════════════════════════════════════════════
const SApprovalWrite = ({ onBack }) => {
  const cats = [
    { g:'근태/휴가',   items:['연차 사용 신청서','반차 신청','야근수당 신청서','출결정정 신청'] },
    { g:'재무',        items:['법인카드 사용 결의서','비품구매 신청','외부 강의비 신청'] },
    { g:'복지',        items:['경조사 지원 신청'] },
    { g:'재고/장비',   items:['재고 발주 결의서','장비 점검 보고서','장비 폐기 신청'] },
    { g:'문서',        items:['외부 협력 계약서','업무 기안서'] },
  ];
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="결재 작성" sub="양식을 선택하세요"
        actions={<button><MIcon name="search" size={20}/></button>}/>
      <div className="m-scroll">
        {cats.map((c,gi) => (
          <div key={gi} className="m-section">
            <div className="m-section-h"><div className="lbl">{c.g}</div></div>
            <div className="m-card flush">
              {c.items.map((it,i,arr) => (
                <div key={i} className="m-list-row">
                  <div className="ico-tile tone-accent"><MIcon name="fileText" size={18}/></div>
                  <div>
                    <div className="lbl">{it}</div>
                    <div className="sub">v3.1 · 평균 처리 1.2일</div>
                  </div>
                  <MIcon name="chevR" size={18} color="var(--z-400)"/>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{height:24}}/>
      </div>
    </div>
  );
};

Object.assign(window, { STodo, SDocs, SApprovalSent, SApprovalRef, SApprovalWrite });
