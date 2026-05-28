// MSO 모바일 — Screens (Addon Extras) : 조직도·부서별재고·근무현황·인계노트·직원평가·수술상담·입금조회·마감보고·외부시스템

// ═══════════════════════════════════════════════════════════════
// AE 1. 조직도 (Org) — 병원 → 부서 → 팀 → 직원 트리 (collapsible)
// ═══════════════════════════════════════════════════════════════
const SOrg = ({ onBack }) => {
  const [open, setOpen] = React.useState({ '박철홍정형외과':true, '간호부':true, '병동팀':true });
  const toggle = (k) => setOpen(o => ({...o, [k]: !o[k]}));
  const hospitals = [
    { name:'박철홍정형외과', stat:'재직 37 · 근무중 5', depts:[
      { name:'간호부', cnt:23, tone:'blue', teams:[
        { name:'병동팀', cnt:10, tone:'cyan',  members:[
          { n:'이가연', r:'사원' },{ n:'김수지', r:'수간호사', on:true },{ n:'조현준', r:'사원', on:true },
          { n:'최민정', r:'사원' },{ n:'정지웅', r:'사원' },{ n:'이승현', r:'사원', on:true },
          { n:'이지현', r:'사원' },{ n:'박지연', r:'사원' },{ n:'김민정', r:'사원' },{ n:'반민정', r:'사원', on:true },
        ]},
        { name:'수술팀', cnt:4, tone:'gray',  members:[{ n:'정가영', r:'사원' },{ n:'박소연', r:'사원' },{ n:'이대성', r:'사원' },{ n:'김규빈', r:'사원' }]},
        { name:'외래팀', cnt:6, tone:'green', members:[{ n:'박지영', r:'사원' },{ n:'이은혜', r:'사원', on:true },{ n:'박하연', r:'사원' },{ n:'송소현', r:'사원' },{ n:'진보경', r:'사원' },{ n:'김정수', r:'사원' }]},
      ]},
      { name:'총무부', cnt:8, tone:'orange', teams:[
        { name:'원무팀', cnt:2, tone:'pink',   members:[{ n:'한지혜', r:'사원' },{ n:'박민지', r:'사원' }]},
        { name:'영양팀', cnt:4, tone:'orange', members:[{ n:'조숙현', r:'팀장' },{ n:'방영란', r:'사원', on:true },{ n:'박유진', r:'대리' },{ n:'박은안', r:'사원' }]},
      ]},
      { name:'경영지원팀', cnt:5, tone:'violet', teams:[
        { name:'기본', cnt:5, tone:'violet', members:[{ n:'백정민', r:'이사', on:true },{ n:'이재훈', r:'이사' },{ n:'이현우', r:'PM', on:true },{ n:'홍자비', r:'사원' },{ n:'박유진', r:'대리' }]},
      ]},
    ]},
    { name:'수연의원', stat:'재직 4 · 근무중 0', depts:[
      { name:'간호부', cnt:3, tone:'blue', teams:[
        { name:'외래팀', cnt:2, tone:'green', members:[{ n:'이주리', r:'사원' },{ n:'박세진', r:'사원' }]},
        { name:'병동팀', cnt:1, tone:'cyan',  members:[{ n:'조혜영', r:'사원' }]},
      ]},
    ]},
  ];
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="조직도" sub="박철홍정형외과 · 수연의원 (다중 병원)" actions={<>
        <button><MIcon name="search" size={20}/></button>
        <button><MIcon name="filter" size={20}/></button>
      </>}/>
      <div className="m-scroll">
        {hospitals.map(h => (
          <div key={h.name} style={{padding:'14px 16px 0'}}>
            <button onClick={()=>toggle(h.name)} className="m-card" style={{width:'100%', textAlign:'left', padding:'14px 16px', display:'flex', alignItems:'center', gap:10}}>
              <MIcon name={open[h.name] ? 'chevD' : 'chevR'} size={18} color="var(--z-500)"/>
              <div style={{flex:1}}>
                <div style={{fontSize:15, fontWeight:800, letterSpacing:'-0.02em'}}>{h.name}</div>
                <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginTop:1}}>{h.stat}</div>
              </div>
            </button>
            {open[h.name] && h.depts.map(d => (
              <div key={d.name} style={{padding:'8px 8px 0 20px'}}>
                <button onClick={()=>toggle(d.name)} style={{width:'100%', textAlign:'left', padding:'10px 12px', display:'flex', alignItems:'center', gap:8, borderRadius:10, background:'var(--card)', border:'1px solid var(--border)'}}>
                  <MIcon name={open[d.name] ? 'chevD' : 'chevR'} size={16} color="var(--z-500)"/>
                  <div className={'ico-tile tone-' + (d.tone === 'blue' ? 'accent' : d.tone === 'orange' ? 'warning' : '')} style={{width:24, height:24, borderRadius:6}}>
                    <MIcon name="users" size={13}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13, fontWeight:800}}>{d.name}</div>
                    <div style={{fontSize:10, color:'var(--z-500)', fontWeight:600, marginTop:1}}>{d.cnt}명 · {d.teams.length}팀</div>
                  </div>
                </button>
                {open[d.name] && d.teams.map(t => (
                  <div key={t.name} style={{padding:'4px 0 0 20px'}}>
                    <button onClick={()=>toggle(t.name)} style={{width:'100%', textAlign:'left', padding:'8px 10px', display:'flex', alignItems:'center', gap:6, borderRadius:8, background:'var(--bg)'}}>
                      <MIcon name={open[t.name] ? 'chevD' : 'chevR'} size={14} color="var(--z-500)"/>
                      <span style={{fontSize:12, fontWeight:700, flex:1}}>{t.name}</span>
                      <MChip>{t.cnt}명</MChip>
                    </button>
                    {open[t.name] && (
                      <div className="m-card flush" style={{margin:'4px 0 8px 26px'}}>
                        {t.members.map((m,i,arr) => (
                          <div key={i} className="m-list-row" style={{padding:'10px 14px', minHeight:48}}>
                            <MAvatar tone={['blue','pink','violet','green','cyan','orange'][i%6]} size="sm">{m.n.charAt(0)}</MAvatar>
                            <div>
                              <div className="lbl">{m.n}</div>
                              <div className="sub">{t.name} · {m.r}</div>
                            </div>
                            {m.on ? <MChip tone="success" dot>근무중</MChip> : <MIcon name="chevR" size={16} color="var(--z-400)"/>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
        <div style={{height:24}}/>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// AE 2. 부서별 재고 (DeptInventory)
// ═══════════════════════════════════════════════════════════════
const SDeptInventory = ({ onBack }) => {
  const [dept, setDept] = React.useState('외래팀');
  const depts = [
    { id:'경영지원팀', cnt:1247, low:8,  tone:'' },
    { id:'외래팀',    cnt:842,  low:3,  tone:'accent' },
    { id:'OP실',     cnt:521,  low:2,  tone:'' },
    { id:'영상의학팀', cnt:312,  low:1,  tone:'' },
    { id:'간호부',    cnt:184,  low:0,  tone:'' },
    { id:'행정팀',    cnt:96,   low:0,  tone:'' },
  ];
  const items = [
    { n:'1회용 주사기 5cc', cat:'주사·바늘',   s:43,  min:80,  u:'개', tone:'danger' },
    { n:'멸균거즈 4x4',     cat:'드레싱',      s:128, min:150, u:'팩', tone:'warning' },
    { n:'주사용 식염수',    cat:'수액',        s:62,  min:50,  u:'병', tone:'success' },
    { n:'알코올스왑',       cat:'소독',        s:340, min:200, u:'개', tone:'success' },
    { n:'국소마취제 2%',    cat:'약품',        s:18,  min:25,  u:'바이알', tone:'warning' },
    { n:'카테터 18Ga',     cat:'수액',        s:24,  min:30,  u:'개', tone:'warning' },
  ];
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="부서별 재고" sub={`${dept} · ${items.length}품목`} actions={<button><MIcon name="search" size={20}/></button>}/>
      <div className="m-chip-bar">
        {depts.map(d => (
          <button key={d.id} className={dept === d.id ? 'on' : ''} onClick={()=>setDept(d.id)}>
            {d.id}{d.low > 0 && <span className="cnt">!{d.low}</span>}
          </button>
        ))}
      </div>
      <div className="m-scroll">
        <div style={{padding:'14px 16px 0', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8}}>
          {[
            { l:'총 품목', v:842, t:'' },
            { l:'부족',   v:1,   t:'danger' },
            { l:'주의',   v:3,   t:'warning' },
          ].map((k,i) => (
            <div key={i} className="m-card" style={{padding:'12px 12px'}}>
              <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{k.l}</div>
              <div className="m-tnum" style={{fontSize:20, fontWeight:800, marginTop:4, color: k.t === 'danger' ? 'var(--danger)' : k.t === 'warning' ? 'var(--warning)' : 'var(--z-900)'}}>{k.v}</div>
            </div>
          ))}
        </div>
        <div className="m-section">
          <div className="m-section-h"><div className="lbl">조치 필요</div><span className="more">일괄 발주</span></div>
          <div className="m-card flush">
            {items.map((it,i,arr) => {
              const pct = Math.min((it.s/it.min)*100, 100);
              return (
                <div key={i} style={{padding:'12px 16px', borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none'}}>
                  <div style={{display:'flex', alignItems:'center', gap:8}}>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:14, fontWeight:700}}>{it.n}</div>
                      <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginTop:2}}>{it.cat} · 안전 {it.min}{it.u}</div>
                    </div>
                    <div className="m-tnum" style={{fontSize:16, fontWeight:800}}>{it.s}<span style={{fontSize:10, color:'var(--z-500)', marginLeft:2}}>{it.u}</span></div>
                  </div>
                  <div style={{marginTop:6, height:4, background:'var(--z-100)', borderRadius:999, overflow:'hidden'}}>
                    <div style={{width:pct+'%', height:'100%', background: it.tone === 'danger' ? 'var(--danger)' : it.tone === 'warning' ? 'var(--warning)' : 'var(--success)'}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{height:24}}/>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// AE 3. 실시간 근무현황 (WorkNow)
// ═══════════════════════════════════════════════════════════════
const SWorkNow = ({ onBack }) => {
  const team = [
    { n:'박철홍', r:'병원장',   t:'진료팀',     s:'근무중', last:'09:02 출근',           tone:'success' },
    { n:'김지오', r:'간호과장', t:'외래팀',     s:'근무중', last:'08:48 출근',           tone:'success' },
    { n:'지민수', r:'실장',     t:'외래팀',     s:'외근',   last:'10:30 ~ 12:00 의뢰',  tone:'accent' },
    { n:'이가연', r:'사원',     t:'병동팀',     s:'휴게',   last:'10:15부터 15분',       tone:'warning' },
    { n:'김수지', r:'수간호사', t:'병동팀',     s:'근무중', last:'07:45 출근',           tone:'success' },
    { n:'박지영', r:'사원',     t:'외래팀',     s:'점심',   last:'12:00 ~ 13:00',        tone:'warning' },
    { n:'이은혜', r:'사원',     t:'외래팀',     s:'근무중', last:'08:50 출근',           tone:'success' },
    { n:'최찬',   r:'사원',     t:'검사팀',     s:'근무중', last:'09:00 출근',           tone:'success' },
    { n:'백정민', r:'이사',     t:'경영지원팀', s:'근무중', last:'08:30 출근',           tone:'success' },
    { n:'조현준', r:'사원',     t:'병동팀',     s:'결근',   last:'5/11 — 무단',          tone:'danger' },
    { n:'조숙현', r:'팀장',     t:'영양팀',     s:'퇴근',   last:'06:30 ~ 14:30',        tone:'' },
    { n:'방영란', r:'사원',     t:'영양팀',     s:'근무중', last:'06:45 출근',           tone:'success' },
  ];
  const counts = team.reduce((a,t) => { a[t.s] = (a[t.s]||0)+1; return a; }, {});
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="근무현황" sub={`27명 중 ${counts['근무중']||0}명 근무중 · 1분 전 갱신`} actions={<>
        <button><MIcon name="refresh" size={20}/></button>
        <button><MIcon name="filter" size={20}/></button>
      </>}/>
      <div className="m-scroll">
        {/* 6 상태 카운트 */}
        <div style={{padding:'14px 16px 0', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8}}>
          {[
            { l:'근무중', v: counts['근무중']||0, t:'success' },
            { l:'외근',   v: counts['외근']||0,   t:'accent' },
            { l:'휴게',   v: counts['휴게']||0,   t:'warning' },
            { l:'점심',   v: counts['점심']||0,   t:'warning' },
            { l:'퇴근',   v: counts['퇴근']||0,   t:'' },
            { l:'결근',   v: counts['결근']||0,   t:'danger' },
          ].map((s,i) => (
            <div key={i} className="m-card" style={{padding:'10px 12px', display:'flex', alignItems:'center', gap:8}}>
              <span style={{width:8, height:8, borderRadius:999, background: s.t === 'success' ? 'var(--success)' : s.t === 'accent' ? 'var(--accent)' : s.t === 'warning' ? 'var(--warning)' : s.t === 'danger' ? 'var(--danger)' : 'var(--z-400)'}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:10, color:'var(--z-500)', fontWeight:700}}>{s.l}</div>
                <div className="m-tnum" style={{fontSize:18, fontWeight:800, letterSpacing:'-0.025em'}}>{s.v}<span style={{fontSize:9, color:'var(--z-500)', marginLeft:2}}>명</span></div>
              </div>
            </div>
          ))}
        </div>
        {/* 직원 카드 */}
        <div className="m-section">
          <div className="m-section-h"><div className="lbl">전체 직원</div><span className="more">정렬</span></div>
          <div className="m-card flush">
            {team.map((t,i,arr) => (
              <div key={i} className="m-list-row" style={{position:'relative', paddingLeft: 18}}>
                <span style={{position:'absolute', left:0, top:8, bottom:8, width:3, borderRadius:'0 2px 2px 0',
                  background: t.tone === 'success' ? 'var(--success)' : t.tone === 'accent' ? 'var(--accent)' : t.tone === 'warning' ? 'var(--warning)' : t.tone === 'danger' ? 'var(--danger)' : 'var(--z-300)'
                }}/>
                <MAvatar tone={['blue','pink','violet','green','cyan','orange'][i%6]} size="sm">{t.n.charAt(0)}</MAvatar>
                <div>
                  <div className="lbl">{t.n} <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginLeft:4}}>{t.r}</span></div>
                  <div className="sub">{t.t} · {t.last}</div>
                </div>
                <MChip tone={t.tone || ''}>{t.s}</MChip>
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
// AE 4. 인계노트 (Handoff) — 캘린더 + 날짜별 인계
// ═══════════════════════════════════════════════════════════════
const SHandoff = ({ onBack }) => {
  const [day, setDay] = React.useState(11);
  const [view, setView] = React.useState('common');
  const items = [
    { tag:'Day · 일반', team:'병동팀1', at:'07:47', body:'야간 인계 — 임영화 환자 OR 일정 변경, 9시→10시로 조정. 진통제 PRN 추가.' },
    { tag:'Eve · 주의', team:'병동팀2', at:'15:21', body:'박지영 환자(202호) 발열 38.2°C — 의료진 호출, 항생제 투여 중. 다음 인계 시 재측정 필요.', tone:'warning' },
    { tag:'Day · 일반', team:'병동팀1', at:'어제 19:00', body:'야간 응급실 환자 입원 처리 완료. 5층 5503호.' },
    { tag:'Eve · 환자별', team:'병동팀2', at:'18:30', body:'송봉운 환자 — 보호자 면담 일정 5/13 11:00 변경됨.' },
  ];
  const items2 = [
    { tag:'환자별', team:'202호 박지영', at:'15:21', body:'발열 38.2°C → 항생제 투여 중. 6시간 후 재측정.' },
    { tag:'환자별', team:'5503호 임영화', at:'07:47', body:'OR 일정 5/12 09:00 → 10:00 조정. 보호자 통보 완료.' },
  ];
  const cur = view === 'common' ? items : items2;
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="인계노트" sub={`5월 ${day}일 · 공통 4 · 환자별 2`} actions={<>
        <button><MIcon name="search" size={20}/></button>
        <button><MIcon name="settings" size={20}/></button>
      </>}/>
      {/* 미니 캘린더 */}
      <div style={{padding:'12px 16px', background:'var(--card)', borderBottom:'1px solid var(--border)'}}>
        <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:8}}>
          <span style={{fontSize:13, fontWeight:800}}>2026년 5월</span>
          <div style={{flex:1}}/>
          <button style={{color:'var(--z-500)'}}><MIcon name="chevL" size={16}/></button>
          <button style={{color:'var(--z-500)'}}><MIcon name="chevR" size={16}/></button>
        </div>
        <div style={{display:'flex', gap:4, overflowX:'auto', paddingBottom:4}}>
          {Array.from({length:14}, (_,i) => i + 5).map(d => (
            <button key={d} onClick={()=>setDay(d)} style={{
              flex:'0 0 44px', height:54, borderRadius:10,
              background: day === d ? 'var(--accent)' : 'var(--bg)',
              color: day === d ? '#fff' : 'var(--z-700)',
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              fontSize:11, fontWeight:700,
            }}>
              <span style={{fontSize:9, opacity:0.85}}>{['일','월','화','수','목','금','토'][(d-1)%7]}</span>
              <span style={{fontSize:16, fontWeight:800}}>{d}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{padding:'10px 16px 0', background:'var(--card)', borderBottom:'1px solid var(--border)'}}>
        <div className="m-seg">
          <button className={view==='common'?'on':''}  onClick={()=>setView('common')}>공통 인계 4</button>
          <button className={view==='patient'?'on':''} onClick={()=>setView('patient')}>환자별 2</button>
        </div>
      </div>
      <div className="m-scroll">
        <div style={{padding:'14px 16px 16px', display:'flex', flexDirection:'column', gap:10}}>
          {cur.map((it,i) => (
            <div key={i} className="m-card" style={{padding:'14px 16px', borderColor: it.tone === 'warning' ? 'var(--warning)' : 'var(--border)'}}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
                <MChip tone={it.tone || 'accent'}>{it.tag}</MChip>
                <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>{it.team}</span>
                <div style={{flex:1}}/>
                <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>{it.at}</span>
              </div>
              <div style={{fontSize:13, color:'var(--z-800)', lineHeight:1.6, fontWeight:500}}>{it.body}</div>
            </div>
          ))}
        </div>
      </div>
      <button style={{
        position:'absolute', right:16, bottom:24,
        width:56, height:56, borderRadius:'50%',
        background:'var(--accent)', color:'#fff',
        display:'grid', placeItems:'center', border:0,
        boxShadow:'0 8px 24px rgba(37,99,235,0.35)',
      }}><MIcon name="plus" size={26}/></button>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// AE 5. 직원평가 (Eval)
// ═══════════════════════════════════════════════════════════════
const SEval = ({ onBack }) => {
  const [selIdx, setSelIdx] = React.useState(null);
  const employees = [
    { n:'박철홍', t:'진료팀 · 병원장', last:'5/8 성과' },
    { n:'이가연', t:'병동팀 · 사원',   last:'5/1 주의' },
    { n:'김수지', t:'병동팀 · 수간호사', last:'4/22 칭찬' },
    { n:'박지영', t:'외래팀 · 사원',   last:'4/15 성과' },
    { n:'이은혜', t:'외래팀 · 사원',   last:'-' },
    { n:'최찬',   t:'검사팀 · 사원',   last:'4/22 칭찬' },
    { n:'백정민', t:'경영지원팀 · 이사', last:'-' },
    { n:'조현준', t:'병동팀 · 사원',   last:'5/1 주의' },
    { n:'조숙현', t:'영양팀 · 팀장',   last:'-' },
    { n:'방영란', t:'영양팀 · 사원',   last:'-' },
    { n:'박하연', t:'외래팀 · 사원',   last:'-' },
  ];
  if (selIdx !== null) {
    const e = employees[selIdx];
    const [type, setType] = [null, () => {}]; // dummy
    return (
      <div className="m-screen">
        <MHeader back={()=>setSelIdx(null)} title={e.n + ' 평가'} sub={e.t}/>
        <div className="m-scroll">
          <div style={{padding:'18px 16px', background:'var(--card)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:14}}>
            <MAvatar tone={['blue','pink','violet','green','cyan','orange'][selIdx%6]} size="lg">{e.n.charAt(0)}</MAvatar>
            <div style={{flex:1}}>
              <div style={{fontSize:17, fontWeight:800, letterSpacing:'-0.02em'}}>{e.n}</div>
              <div style={{fontSize:12, color:'var(--z-500)', fontWeight:600, marginTop:1}}>{e.t}</div>
            </div>
          </div>
          {/* 평가 입력 */}
          <div className="m-section">
            <div className="m-section-h"><div className="lbl">새 평가 등록</div></div>
            <div className="m-card" style={{padding:'14px 16px'}}>
              <div style={{fontSize:11, color:'var(--z-500)', fontWeight:800, marginBottom:6}}>유형</div>
              <div style={{display:'flex', gap:5, flexWrap:'wrap'}}>
                {[
                  { id:'성과', tone:'accent' },
                  { id:'칭찬', tone:'success' },
                  { id:'주의', tone:'warning' },
                  { id:'문제', tone:'danger' },
                ].map(t => (
                  <button key={t.id} style={{padding:'8px 14px', borderRadius:999, fontSize:12, fontWeight:800,
                    background: t.id === '성과' ? 'var(--accent)' : 'var(--bg)',
                    color: t.id === '성과' ? '#fff' : 'var(--z-700)',
                  }}>{t.id}</button>
                ))}
              </div>
              <div style={{fontSize:11, color:'var(--z-500)', fontWeight:800, marginTop:14, marginBottom:6}}>점수</div>
              <div style={{display:'flex', gap:6}}>
                {[1,2,3,4,5].map(n => (
                  <button key={n} style={{
                    flex:1, height:40, borderRadius:10, fontSize:15, fontWeight:800,
                    background: n <= 4 ? 'var(--warning-soft)' : 'var(--bg)',
                    color: n <= 4 ? 'var(--warning)' : 'var(--z-500)',
                  }}>{'★'.repeat(n)}</button>
                ))}
              </div>
              <textarea placeholder="평가 내용 입력..." rows={4} style={{width:'100%', marginTop:12, padding:'10px 12px', fontSize:14, fontFamily:'inherit', borderRadius:10, background:'var(--bg)', resize:'none'}}/>
              <div style={{display:'flex', gap:8, marginTop:10}}>
                <MBtn block>취소</MBtn>
                <MBtn block variant="primary" icon="check">등록</MBtn>
              </div>
            </div>
          </div>
          {/* 평가 이력 */}
          <div className="m-section">
            <div className="m-section-h"><div className="lbl">평가 이력 3건</div></div>
            <div className="m-card flush">
              {[
                { type:'성과', tone:'accent',  score:4, body:'5월 진료 일정 조율 적극적, 환자 클레임 0건', at:'2026.05.08' },
                { type:'주의', tone:'warning', score:2, body:'근태 — 지각 3회 발생, 면담 예정', at:'2026.05.01' },
                { type:'칭찬', tone:'success', score:5, body:'OP체크 템플릿 정리에 큰 기여', at:'2026.04.22' },
              ].map((h,i,arr) => (
                <div key={i} style={{padding:'14px 16px', borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none'}}>
                  <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
                    <MChip tone={h.tone}>{h.type}</MChip>
                    <span style={{fontSize:11, color:'var(--warning)', fontWeight:800}}>{'★'.repeat(h.score)}</span>
                    <div style={{flex:1}}/>
                    <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>{h.at}</span>
                  </div>
                  <div style={{fontSize:13, color:'var(--z-800)', lineHeight:1.55}}>{h.body}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{height:24}}/>
        </div>
      </div>
    );
  }
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="직원평가" sub={`평가 대상 ${employees.length}명`} actions={<button><MIcon name="search" size={20}/></button>}/>
      <div className="m-scroll">
        <div style={{padding:'12px 16px 0'}}>
          <div className="m-card flush">
            {employees.map((e,i,arr) => (
              <div key={i} onClick={()=>setSelIdx(i)} className="m-list-row">
                <MAvatar tone={['blue','pink','violet','green','cyan','orange'][i%6]}>{e.n.charAt(0)}</MAvatar>
                <div>
                  <div className="lbl">{e.n}</div>
                  <div className="sub">{e.t} · 최근 {e.last}</div>
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
// AE 6. 수술상담 (Consult)
// ═══════════════════════════════════════════════════════════════
const SConsult = ({ onBack }) => {
  const items = [
    { n:'송봉운', dob:'1948-06-12', op:'TKR (양측 무릎)',         doc:'박철홍', at:'05/12 10:30', state:'예정',   tone:'accent', consent:'대기' },
    { n:'박근식', dob:'1962-03-22', op:'AS 척추유합술 L4-L5',     doc:'박철홍', at:'05/12 14:00', state:'예정',   tone:'accent', consent:'대기' },
    { n:'곽유진', dob:'1955-09-08', op:'mako TKR (좌)',           doc:'박철홍', at:'05/13 09:00', state:'동의완료', tone:'success', consent:'완료' },
    { n:'허경진', dob:'1970-12-30', op:'pen ORIF (비골)',         doc:'김지오', at:'05/14 11:00', state:'예정',   tone:'accent', consent:'보류' },
    { n:'박성민', dob:'1949-04-17', op:'uni 단측 인공관절',        doc:'박철홍', at:'05/15 13:30', state:'재상담', tone:'warning',  consent:'대기' },
    { n:'탁순자', dob:'1958-11-05', op:'TKR 우측',                doc:'박철홍', at:'05/09 10:00', state:'완료',   tone:'', consent:'완료' },
  ];
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="수술상담" sub="오늘 5건 · 음성분석 ON" actions={<>
        <button><MIcon name="search" size={20}/></button>
        <button><MIcon name="plus" size={20}/></button>
      </>}/>
      <div className="m-scroll">
        {/* 진행중 hero */}
        <div style={{padding:'14px 16px 0'}}>
          <div className="m-card" style={{padding:'14px 16px', background:'linear-gradient(135deg, #8B5CF6, #6D28D9)', borderColor:'transparent', color:'#fff'}}>
            <div style={{display:'flex', alignItems:'center', gap:6}}>
              <span style={{width:8, height:8, borderRadius:999, background:'#fff'}}/>
              <span style={{fontSize:11, fontWeight:800, opacity:0.85, letterSpacing:'0.04em'}}>현재 상담중 · 음성 녹음</span>
              <div style={{flex:1}}/>
              <span className="m-tnum" style={{fontSize:11, fontWeight:700, opacity:0.85}}>12:42</span>
            </div>
            <div style={{fontSize:16, fontWeight:800, marginTop:6}}>송봉운 · TKR 양측 무릎</div>
            <div style={{display:'flex', alignItems:'center', gap:8, marginTop:8}}>
              <div style={{flex:1, height:24, display:'flex', alignItems:'center', gap:2}}>
                {Array.from({length:40}, (_,i) => (
                  <div key={i} style={{
                    flex:1, height: 4 + Math.abs(Math.sin(i * 0.7)) * 20,
                    background:'rgba(255,255,255,0.6)', borderRadius:2,
                  }}/>
                ))}
              </div>
              <button style={{width:36, height:36, borderRadius:'50%', background:'rgba(0,0,0,0.3)', color:'#fff', display:'grid', placeItems:'center'}}><MIcon name="x" size={16}/></button>
            </div>
          </div>
        </div>

        {/* 체크리스트 진행 */}
        <div className="m-section">
          <div className="m-section-h"><div className="lbl">동의서 체크 3/6</div><span className="more">상세</span></div>
          <div className="m-card flush">
            {[
              { l:'수술 명·범위 설명',  done:true  },
              { l:'합병증·부작용 설명',  done:true  },
              { l:'대체 치료법 안내',    done:true  },
              { l:'예상 회복 기간',     done:false },
              { l:'예상 비용 안내',     done:false },
              { l:'보호자 입회 확인',   done:false },
            ].map((c,i,arr) => (
              <div key={i} className="m-list-row" style={{gridTemplateColumns:'24px 1fr'}}>
                <div style={{width:22, height:22, borderRadius:'50%',
                  background: c.done ? 'var(--success)' : 'transparent',
                  border: c.done ? 'none' : '1.5px solid var(--z-300)',
                  color:'#fff', display:'grid', placeItems:'center'}}>
                  {c.done && <MIcon name="check" size={14}/>}
                </div>
                <div className="lbl" style={{color: c.done ? 'var(--z-500)' : 'var(--z-900)', textDecoration: c.done ? 'line-through' : 'none'}}>{c.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 환자 리스트 */}
        <div className="m-section">
          <div className="m-section-h"><div className="lbl">상담 대기 {items.length}건</div></div>
          <div className="m-card flush">
            {items.map((it,i,arr) => (
              <div key={i} className="m-list-row">
                <MAvatar tone={['blue','pink','violet','green','cyan','orange'][i%6]} size="sm">{it.n.charAt(0)}</MAvatar>
                <div>
                  <div className="lbl">{it.n} <span style={{fontSize:10, color:'var(--z-400)', fontWeight:600, marginLeft:3}}>({it.dob.slice(0,4)})</span></div>
                  <div className="sub">{it.op} · {it.doc} · {it.at}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <MChip tone={it.tone || ''}>{it.state}</MChip>
                  <div style={{fontSize:10, color: it.consent === '완료' ? 'var(--success)' : it.consent === '보류' ? 'var(--warning)' : 'var(--z-500)', fontWeight:700, marginTop:3}}>동의 {it.consent}</div>
                </div>
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
// AE 7. 입금 실시간조회 (Deposit)
// ═══════════════════════════════════════════════════════════════
const SDeposit = ({ onBack }) => {
  const tx = [
    { time:'14:23:47', n:'송봉운', amt:152000,  m:'카드',     item:'외래 진료비',    s:'완료', tone:'success' },
    { time:'14:18:12', n:'박근식', amt:88500,   m:'현금',     item:'영상 검사료',    s:'완료', tone:'success' },
    { time:'14:11:33', n:'곽유진', amt:1200000, m:'카드',     item:'입원 보증금',    s:'완료', tone:'success' },
    { time:'14:02:08', n:'허경진', amt:245000,  m:'계좌이체', item:'수술 선납금',   s:'대기', tone:'warning' },
    { time:'13:48:54', n:'박성민', amt:14200,   m:'카드',     item:'재진 진료비',  s:'완료', tone:'success' },
    { time:'13:42:11', n:'탁순자', amt:380500,  m:'카드',     item:'외래 검사료',    s:'완료', tone:'success' },
    { time:'13:38:25', n:'이관식', amt:56000,   m:'현금',     item:'외래 진료비',    s:'완료', tone:'success' },
    { time:'13:30:02', n:'정만수', amt:198000,  m:'카드',     item:'영상 검사료',    s:'환불', tone:'danger' },
  ];
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="입금 실시간조회" sub="2026.05.11 · 142건 · 9,407,830원" actions={<>
        <button><MIcon name="refresh" size={20}/></button>
        <button><MIcon name="download" size={20}/></button>
      </>}/>
      <div className="m-scroll">
        {/* Chart 이관 안내 */}
        <div style={{padding:'14px 16px 0'}}>
          <div className="m-card" style={{padding:'12px 14px', background:'var(--warning-soft)', borderColor:'transparent', display:'flex', alignItems:'center', gap:10}}>
            <MIcon name="alertCircle" size={18} color="var(--warning)"/>
            <div style={{flex:1}}>
              <div style={{fontSize:12, fontWeight:800, color:'var(--warning)'}}>Chart 프로그램으로 이관 예정</div>
              <div style={{fontSize:11, color:'var(--z-600)', fontWeight:600, marginTop:1}}>2026년 하반기 통합 관리</div>
            </div>
          </div>
        </div>

        {/* KPI */}
        <div style={{padding:'12px 16px 0', display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
          {[
            { l:'오늘 총 입금', v:'9,407,830', u:'원', tone:'' },
            { l:'완료',        v:'138',       u:'건', tone:'success' },
            { l:'처리 대기',    v:'3',         u:'건', tone:'warning' },
            { l:'환불·취소',    v:'1',         u:'건', tone:'danger' },
          ].map((k,i) => (
            <div key={i} className="m-card" style={{padding:'12px 14px'}}>
              <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{k.l}</div>
              <div className="m-tnum" style={{fontSize: i === 0 ? 18 : 22, fontWeight:800, letterSpacing:'-0.025em', marginTop:4, color: k.tone === 'danger' ? 'var(--danger)' : k.tone === 'warning' ? 'var(--warning)' : k.tone === 'success' ? 'var(--success)' : 'var(--z-900)'}}>
                {k.v}<span style={{fontSize:11, color:'var(--z-500)', fontWeight:700, marginLeft:3}}>{k.u}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 거래 리스트 */}
        <div className="m-section">
          <div className="m-section-h"><div className="lbl">실시간 거래</div><span className="more">필터</span></div>
          <div className="m-card flush">
            {tx.map((t,i,arr) => (
              <div key={i} className="m-list-row" style={{gridTemplateColumns:'52px 1fr auto'}}>
                <div className="m-tnum" style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{t.time}</div>
                <div>
                  <div className="lbl">{t.n}<span style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginLeft:6}}>· {t.item}</span></div>
                  <div className="sub">{t.m}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div className="m-tnum" style={{fontSize:14, fontWeight:800, color: t.tone === 'danger' ? 'var(--danger)' : 'var(--z-900)'}}>{t.tone === 'danger' ? '−' : ''}{t.amt.toLocaleString()}</div>
                  <MChip tone={t.tone}>{t.s}</MChip>
                </div>
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
// AE 8. 마감보고 (Closing)
// ═══════════════════════════════════════════════════════════════
const SClosing = ({ onBack }) => {
  const [mode, setMode] = React.useState('list');
  const reports = [
    { d:'2026-05-11', total:9407830,  w:'한지혜', s:'미제출', tone:'warning' },
    { d:'2026-05-10', total:8125440,  w:'한지혜', s:'마감완료', tone:'success' },
    { d:'2026-05-09', total:11280530, w:'한지혜', s:'마감완료', tone:'success' },
    { d:'2026-05-08', total:7935210,  w:'한지혜', s:'마감완료', tone:'success' },
    { d:'2026-04-22', total:9407830,  w:'한지혜', s:'마감완료', tone:'success' },
    { d:'2026-04-21', total:10641120, w:'한지혜', s:'마감완료', tone:'success' },
    { d:'2026-04-20', total:7615860,  w:'한지혜', s:'마감완료', tone:'success' },
    { d:'2026-04-18', total:1835000,  w:'한지혜', s:'마감완료', tone:'success' },
  ];
  if (mode === 'new') {
    return (
      <div className="m-screen">
        <MHeader back={()=>setMode('list')} title="새 마감 작성" sub="2026.05.11"/>
        <div className="m-scroll">
          <div className="m-card flush" style={{borderRadius:0, border:'none'}}>
            {[
              { l:'마감 일자', v:'2026.05.11', req:true },
              { l:'기초 시재 (전일 이월)', v:'0', req:true, unit:'원' },
              { l:'기말 시재 (마감 시재)', v:'0', req:true, unit:'원' },
              { l:'카드 매출',  v:'7,820,000', unit:'원' },
              { l:'현금 매출',  v:'1,240,000', unit:'원' },
              { l:'계좌이체',   v:'245,000',  unit:'원' },
              { l:'환불·취소',  v:'−198,000', unit:'원' },
              { l:'총 수납액',  v:'9,407,830', unit:'원', big:true },
            ].map((r,i,arr) => (
              <div key={i} style={{padding:'13px 16px', borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none'}}>
                <div style={{fontSize:11, color:'var(--z-500)', fontWeight:800, letterSpacing:'0.02em', marginBottom:6}}>
                  {r.l} {r.req && <span style={{color:'var(--danger)'}}>*</span>}
                </div>
                <div style={{display:'flex', alignItems:'center', gap:6}}>
                  <input defaultValue={r.v} style={{flex:1, fontSize: r.big ? 18 : 15, fontWeight: r.big ? 800 : 600, padding:'4px 0', fontFamily:'inherit'}} className="m-tnum"/>
                  {r.unit && <span style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{r.unit}</span>}
                </div>
              </div>
            ))}
          </div>
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card" style={{padding:'12px 14px', background:'var(--accent-soft)', borderColor:'transparent', display:'flex', alignItems:'center', gap:10}}>
              <MIcon name="alertCircle" size={18} color="var(--accent)"/>
              <div style={{fontSize:12, fontWeight:700, color:'var(--accent)'}}>입금 실시간조회와 자동 대조 — 차이 0원</div>
            </div>
          </div>
          <div style={{height:24}}/>
        </div>
        <div className="m-sticky-foot">
          <MBtn block onClick={()=>setMode('list')}>임시저장</MBtn>
          <MBtn block variant="primary" icon="check">마감 완료</MBtn>
        </div>
      </div>
    );
  }
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="마감보고" sub={`미제출 1건 · 총 ${reports.length}건`} actions={<button onClick={()=>setMode('new')}><MIcon name="plus" size={20}/></button>}/>
      <div className="m-scroll">
        <div style={{padding:'14px 16px 0'}}>
          <div className="m-card" style={{padding:'12px 14px', marginBottom:12, background:'var(--warning-soft)', borderColor:'transparent', display:'flex', alignItems:'center', gap:10}}>
            <MIcon name="alertTri" size={18} color="var(--warning)"/>
            <div style={{flex:1}}>
              <div style={{fontSize:13, fontWeight:800, color:'var(--warning)'}}>5/11 마감 미제출 · D+0</div>
              <div style={{fontSize:11, color:'var(--z-600)', fontWeight:600, marginTop:1}}>입금 9,407,830원 자동 집계됨</div>
            </div>
            <MBtn size="sm" variant="primary" onClick={()=>setMode('new')}>작성</MBtn>
          </div>
        </div>
        <div style={{padding:'0 16px 16px'}}>
          <div className="m-card flush">
            {reports.map((r,i,arr) => (
              <div key={i} className="m-list-row" style={{gridTemplateColumns:'88px 1fr auto'}}>
                <div className="m-tnum" style={{fontSize:13, fontWeight:800, color:'var(--z-700)'}}>{r.d.slice(5)}</div>
                <div>
                  <div className="m-tnum" style={{fontSize:15, fontWeight:800}}>₩ {r.total.toLocaleString()}</div>
                  <div className="sub">작성자 {r.w}</div>
                </div>
                <MChip tone={r.tone}>{r.s}</MChip>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// AE 9. 외부 시스템 (Parking / Webfax)
// ═══════════════════════════════════════════════════════════════
const SExternal = ({ onBack, kind = 'parking' }) => {
  const cfg = {
    parking: { name:'주차관제',  ic:'box',  desc:'박철홍정형외과 외부 주차관제 시스템',  vendor:'PMS Korea',  link:'pms-park.example.kr' },
    webfax:  { name:'웹팩스',    ic:'send', desc:'전자팩스 송수신 외부 시스템',          vendor:'WebFax',     link:'webfax.example.kr' },
  }[kind];
  return (
    <div className="m-screen">
      <MHeader back={onBack} title={cfg.name} sub="외부 연동 시스템"/>
      <div className="m-scroll" style={{display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 24px'}}>
        <div style={{textAlign:'center', maxWidth: 320}}>
          <div style={{width:80, height:80, borderRadius:24, background:'var(--accent-soft)', color:'var(--accent)', display:'grid', placeItems:'center', margin:'0 auto 18px'}}>
            <MIcon name={cfg.ic} size={42} strokeWidth={1.6}/>
          </div>
          <div style={{fontSize:18, fontWeight:800, letterSpacing:'-0.025em'}}>{cfg.name}</div>
          <p style={{fontSize:13, color:'var(--z-500)', fontWeight:600, marginTop:8, lineHeight:1.6}}>{cfg.desc}</p>
          <p style={{fontSize:11, color:'var(--z-400)', fontWeight:700, marginTop:18, fontFamily:'monospace'}}>{cfg.link}</p>
          <div style={{marginTop:24, padding:'12px 14px', background:'var(--accent-soft)', borderRadius:12, fontSize:12, color:'var(--accent)', fontWeight:700, textAlign:'left', display:'flex', alignItems:'center', gap:10}}>
            <MIcon name="alertCircle" size={18}/>
            <div>이 시스템은 외부 페이지로 연결됩니다 — MSO 로그인이 자동 전달됩니다.</div>
          </div>
          <div style={{marginTop:20, display:'flex', flexDirection:'column', gap:8}}>
            <MBtn block variant="primary" icon="share" size="lg">외부 시스템 열기</MBtn>
            <MBtn block icon="settings">연동 설정</MBtn>
          </div>
        </div>
      </div>
    </div>
  );
};
const SParking = (props) => <SExternal {...props} kind="parking"/>;
const SWebfax  = (props) => <SExternal {...props} kind="webfax"/>;

Object.assign(window, {
  SOrg, SDeptInventory, SWorkNow, SHandoff, SEval, SConsult, SDeposit, SClosing, SExternal, SParking, SWebfax,
});
