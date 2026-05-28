// MSO 모바일 — Screens (HR) : 구성원 · 근태 · 연차 · 근태이상 · 복지 · 계약문서
// (급여명세서는 m-screens-2.jsx 의 SPayroll 사용)

// 데스크톱 안내 배너 (재사용)
const DesktopHint = ({ children, tone = 'accent' }) => (
  <div className="m-card" style={{
    margin:'12px 16px 0', padding:'12px 14px',
    background: tone === 'warning' ? 'var(--warning-soft)' : 'var(--accent-soft)',
    borderColor:'transparent',
    display:'flex', alignItems:'center', gap:10,
  }}>
    <MIcon name="alertCircle" size={18} color={tone === 'warning' ? 'var(--warning)' : 'var(--accent)'}/>
    <div style={{flex:1, fontSize:12, fontWeight:700, color: tone === 'warning' ? 'var(--warning)' : 'var(--accent)'}}>{children}</div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// HR 1. 구성원 (member) — 명단 / 인사발령 / 교육·자격
// ═══════════════════════════════════════════════════════════════
const SHrMember = ({ onBack, onOpen }) => {
  const [tab, setTab] = React.useState('list');
  const depts = [
    { d:'경영지원팀', cnt: 5, members:[
      { n:'백정민', role:'이사',   tone:'blue',   status:'근무중' },
      { n:'이재훈', role:'이사',   tone:'cyan',   status:'근무중' },
      { n:'박유진', role:'대리',   tone:'pink',   status:'근무중' },
      { n:'홍자비', role:'사원',   tone:'violet', status:'외근' },
      { n:'이현우', role:'PM',     tone:'orange', status:'근무중' },
    ]},
    { d:'영상의학팀', cnt: 4, members:[
      { n:'김상민', role:'팀장',   tone:'green',  status:'근무중' },
      { n:'최영빈', role:'기사',   tone:'pink',   status:'휴가' },
      { n:'정수아', role:'기사',   tone:'blue',   status:'근무중' },
    ]},
  ];
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="구성원" sub="총 32명 · 박철홍정형외과" actions={<>
        <button><MIcon name="search" size={20}/></button>
        <button onClick={()=>onOpen && onOpen('form-member')}><MIcon name="plus" size={20}/></button>
      </>}/>
      <div style={{padding:'10px 16px 0', background:'var(--card)', borderBottom:'1px solid var(--border)'}}>
        <div className="m-seg">
          <button className={tab==='list'?'on':''}     onClick={()=>setTab('list')}>명단 32</button>
          <button className={tab==='transfer'?'on':''} onClick={()=>setTab('transfer')}>인사발령</button>
          <button className={tab==='edu'?'on':''}      onClick={()=>setTab('edu')}>교육·자격</button>
        </div>
      </div>
      <div className="m-scroll">
        {tab === 'list' && (
          <div>
            {depts.map((g,i) => (
              <div key={i}>
                <div style={{padding:'14px 16px 6px', display:'flex', alignItems:'center', gap:6}}>
                  <span style={{fontSize:11, fontWeight:800, color:'var(--z-500)', letterSpacing:'0.04em', textTransform:'uppercase'}}>{g.d}</span>
                  <span style={{fontSize:11, color:'var(--z-400)', fontWeight:700}}>{g.cnt}명</span>
                </div>
                <div className="m-card flush" style={{margin:'0 16px'}}>
                  {g.members.map((m,j,arr) => (
                    <div key={j} className="m-list-row">
                      <MAvatar tone={m.tone}>{m.n.charAt(0)}</MAvatar>
                      <div>
                        <div className="lbl">{m.n}</div>
                        <div className="sub">{g.d} · {m.role}</div>
                      </div>
                      <div style={{display:'flex', alignItems:'center', gap:6}}>
                        <MChip tone={m.status === '근무중' ? 'success' : m.status === '휴가' ? 'accent' : ''}>{m.status}</MChip>
                        <MIcon name="chevR" size={18} color="var(--z-400)"/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div style={{height:24}}/>
          </div>
        )}
        {tab === 'transfer' && (
          <div style={{padding:'12px 16px 0'}}>
            {[
              { d:'2026.05.01', t:'영상의학팀 → 경영지원팀', who:'정수아', from:'영상의학팀 기사', to:'경영지원팀 PM' },
              { d:'2026.04.01', t:'승진',                  who:'김상민', from:'기사 → 팀장', to:'영상의학팀 팀장' },
              { d:'2026.03.15', t:'신규 입사',             who:'홍자비', from:'-',            to:'경영지원팀 사원' },
            ].map((r,i) => (
              <div key={i} className="m-card" style={{marginBottom:8, padding:'14px 16px'}}>
                <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:4}}>
                  <MChip tone="accent">{r.t}</MChip>
                  <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginLeft:'auto'}}>{r.d}</span>
                </div>
                <div style={{fontSize:14, fontWeight:800, marginTop:6}}>{r.who}</div>
                <div style={{fontSize:12, color:'var(--z-500)', fontWeight:600, marginTop:2}}>{r.from} → <b style={{color:'var(--z-700)'}}>{r.to}</b></div>
              </div>
            ))}
          </div>
        )}
        {tab === 'edu' && (
          <div style={{padding:'12px 16px 0'}}>
            <div className="m-card flush">
              {[
                { t:'의료기기 안전관리 교육', who:'전 직원',     ts:'5/15 14:00', tone:'warning', s:'예정' },
                { t:'개인정보보호 교육',     who:'행정직 8명', ts:'5/8 완료',    tone:'success', s:'완료' },
                { t:'X-Ray 안전관리 면허',  who:'영상의학팀',  ts:'6/2 만료',   tone:'danger',  s:'만료 임박' },
                { t:'심폐소생술 교육',      who:'간호직',     ts:'4/22 완료',   tone:'success', s:'완료' },
              ].map((e,i) => (
                <div key={i} className="m-list-row">
                  <div className={'ico-tile tone-'+(e.tone === 'success' ? 'success' : e.tone === 'danger' ? 'danger' : 'warning')}>
                    <MIcon name={e.tone === 'danger' ? 'alertTri' : e.tone === 'success' ? 'check' : 'calendar'} size={18}/>
                  </div>
                  <div>
                    <div className="lbl">{e.t}</div>
                    <div className="sub">{e.who} · {e.ts}</div>
                  </div>
                  <MChip tone={e.tone}>{e.s}</MChip>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// HR 2. 근태 (attend) — 관리자 대시보드 / 근무표 / 달력
// ═══════════════════════════════════════════════════════════════
const SHrAttend = ({ onBack }) => {
  const [tab, setTab] = React.useState('dash');
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="근태 관리" sub="박철홍정형외과 · 2026.05" actions={<button><MIcon name="calendar" size={20}/></button>}/>
      <div style={{padding:'10px 16px 0', background:'var(--card)', borderBottom:'1px solid var(--border)'}}>
        <div className="m-seg">
          <button className={tab==='dash'?'on':''}     onClick={()=>setTab('dash')}>대시보드</button>
          <button className={tab==='schedule'?'on':''} onClick={()=>setTab('schedule')}>근무표</button>
          <button className={tab==='cal'?'on':''}      onClick={()=>setTab('cal')}>달력</button>
        </div>
      </div>
      <div className="m-scroll">
        {tab === 'dash' && (
          <>
            {/* KPI */}
            <div style={{padding:'14px 16px 0', display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
              {[
                { l:'출근',  v:'14/16', d:'정상', tone:'success' },
                { l:'지각',  v:'2',     d:'+1 vs 어제', tone:'warning' },
                { l:'결근',  v:'0',     d:'-',  tone:'' },
                { l:'휴가',  v:'1',     d:'박○○ 연차', tone:'accent' },
              ].map((k,i) => (
                <div key={i} className="m-card" style={{padding:'12px 14px'}}>
                  <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{k.l}</div>
                  <div className="m-tnum" style={{fontSize:22, fontWeight:800, letterSpacing:'-0.025em', marginTop:4, color: k.tone === 'success' ? 'var(--success)' : k.tone === 'warning' ? 'var(--warning)' : k.tone === 'accent' ? 'var(--accent)' : 'var(--z-900)'}}>{k.v}</div>
                  <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginTop:2}}>{k.d}</div>
                </div>
              ))}
            </div>

            {/* 부서별 */}
            <div className="m-section">
              <div className="m-section-h"><div className="lbl">부서별 근태</div></div>
              <div className="m-card flush">
                {[
                  { d:'경영지원팀', total:5, present:5, late:0, tone:'success' },
                  { d:'영상의학팀', total:4, present:3, late:1, tone:'warning' },
                  { d:'간호팀',     total:8, present:7, late:1, tone:'warning' },
                  { d:'행정팀',     total:3, present:2, late:0, tone:'' },
                ].map((d,i) => (
                  <div key={i} className="m-list-row">
                    <div className={'ico-tile tone-'+(d.tone || '')}><MIcon name="users" size={18}/></div>
                    <div>
                      <div className="lbl">{d.d}</div>
                      <div className="sub">{d.present}/{d.total} 출근{d.late > 0 ? ` · 지각 ${d.late}` : ''}</div>
                    </div>
                    <MChip tone={d.tone}>{Math.round(d.present/d.total*100)}%</MChip>
                  </div>
                ))}
              </div>
            </div>

            {/* 이상 알림 */}
            <div className="m-section">
              <div className="m-section-h"><div className="lbl">조치 필요</div></div>
              <div className="m-card" style={{padding:0}}>
                {[
                  { n:'최영빈', d:'영상의학팀 기사', s:'지각 09:21 (사유 미입력)', tone:'warning', act:'사유 요청' },
                  { n:'김민서', d:'간호팀',         s:'미체크 — 어제 퇴근',       tone:'danger',  act:'확인' },
                ].map((r,i,arr) => (
                  <div key={i} className="m-list-row" style={{borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none'}}>
                    <MAvatar tone={['pink','blue'][i]}>{r.n.charAt(0)}</MAvatar>
                    <div>
                      <div className="lbl">{r.n} <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>· {r.d}</span></div>
                      <div className="sub" style={{color: r.tone === 'danger' ? 'var(--danger)' : 'var(--warning)'}}>{r.s}</div>
                    </div>
                    <MBtn size="sm">{r.act}</MBtn>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {tab === 'schedule' && (
          <>
            <DesktopHint>근무표 편성은 데스크톱에서 — 모바일은 조회·교환신청만</DesktopHint>
            <div style={{padding:'14px 16px 0'}}>
              {/* AI 자동생성 + 3교대 마법사 (PC 도구 모바일 진입점) */}
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12}}>
                {[
                  { ic:'refresh',  t:'AI 자동생성', d:'근무표를 ML 기반 추천', tone:'accent' },
                  { ic:'settings', t:'3교대 마법사', d:'주간/야간/휴무 사이클', tone:'' },
                ].map((c,i) => (
                  <button key={i} style={{
                    textAlign:'left', background:'var(--card)', border:'1px solid var(--border)',
                    borderRadius:14, padding:'14px 14px', display:'flex', flexDirection:'column', gap:6,
                  }}>
                    <div className={'ico-tile tone-' + (c.tone || '')} style={{
                      width:32, height:32, borderRadius:8,
                      background: c.tone === 'accent' ? 'var(--accent-soft)' : 'var(--z-100)',
                      color: c.tone === 'accent' ? 'var(--accent)' : 'var(--z-700)',
                      display:'grid', placeItems:'center',
                    }}>
                      <MIcon name={c.ic} size={16}/>
                    </div>
                    <div style={{fontSize:13, fontWeight:800, letterSpacing:'-0.012em'}}>{c.t}</div>
                    <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>{c.d}</div>
                  </button>
                ))}
              </div>

              <div className="m-card flush">
                <div style={{padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:6}}>
                  <button style={{color:'var(--z-500)'}}><MIcon name="chevL" size={16}/></button>
                  <span style={{flex:1, textAlign:'center', fontSize:13, fontWeight:800}}>2026.05 둘째 주</span>
                  <button style={{color:'var(--z-500)'}}><MIcon name="chevR" size={16}/></button>
                </div>
                {[
                  { d:'월 11', s:'D', t:'09:00 – 18:00', tone:'accent' },
                  { d:'화 12', s:'D', t:'09:00 – 18:00', tone:'accent' },
                  { d:'수 13', s:'D', t:'09:00 – 18:00', tone:'accent' },
                  { d:'목 14', s:'OFF', t:'휴무',         tone:'' },
                  { d:'금 15', s:'D', t:'09:00 – 18:00', tone:'accent' },
                  { d:'토 16', s:'N', t:'야간 당직 18-09', tone:'warning' },
                  { d:'일 17', s:'OFF', t:'휴무',         tone:'' },
                ].map((r,i,arr) => (
                  <div key={i} className="m-list-row" style={{borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none', gridTemplateColumns:'40px 1fr auto'}}>
                    <div style={{fontSize:11, fontWeight:700, color:'var(--z-500)'}}>{r.d}</div>
                    <div>
                      <div className="lbl">{r.t}</div>
                      <div className="sub">근무지: 1F 데스크</div>
                    </div>
                    <MChip tone={r.tone || ''}>{r.s}</MChip>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {tab === 'cal' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card">
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:10}}>
                <button style={{color:'var(--z-500)'}}><MIcon name="chevL" size={18}/></button>
                <span style={{flex:1, textAlign:'center', fontSize:15, fontWeight:800}}>2026년 5월</span>
                <button style={{color:'var(--z-500)'}}><MIcon name="chevR" size={18}/></button>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:4, fontSize:11, fontWeight:700, color:'var(--z-500)', marginBottom:6}}>
                {['일','월','화','수','목','금','토'].map((d,i) => (
                  <div key={i} style={{textAlign:'center', color: i === 0 ? 'var(--danger)' : i === 6 ? 'var(--accent)' : 'var(--z-500)'}}>{d}</div>
                ))}
              </div>
              <div style={{display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:4}}>
                {Array.from({length:35}).map((_,i) => {
                  const day = i - 3;
                  if (day < 1 || day > 31) return <div key={i} style={{aspectRatio:1}}/>;
                  const isToday = day === 11;
                  const isOff = (i % 7 === 0) || day === 14 || day === 17;
                  const isLate = day === 6;
                  return (
                    <div key={i} style={{
                      aspectRatio:1, position:'relative',
                      background: isToday ? 'var(--accent)' : 'transparent',
                      color: isToday ? '#fff' : isOff ? 'var(--danger)' : 'var(--z-700)',
                      borderRadius: 8, display:'grid', placeItems:'center',
                      fontSize:13, fontWeight: isToday ? 800 : 600,
                    }}>
                      {day}
                      {(isLate || isOff) && !isToday && (
                        <span style={{position:'absolute', bottom:3, width:4, height:4, borderRadius:999, background: isLate ? 'var(--warning)' : 'var(--accent)'}}/>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// HR 3. 연차·휴가 (leave)
// ═══════════════════════════════════════════════════════════════
const SHrLeave = ({ onBack, onOpen }) => (
  <div className="m-screen">
    <MHeader back={onBack} title="연차·휴가" sub="2026년 잔여" actions={<button><MIcon name="calendar" size={20}/></button>}/>
    <div className="m-scroll">
      {/* hero */}
      <div style={{padding:'24px 20px 8px', textAlign:'center', background:'var(--card)', borderBottom:'1px solid var(--border)'}}>
        <div style={{fontSize:11, color:'var(--z-500)', fontWeight:800, letterSpacing:'0.04em'}}>잔여 연차</div>
        <div className="m-tnum" style={{fontSize:48, fontWeight:800, letterSpacing:'-0.04em', color:'var(--accent)', marginTop:4}}>
          11<span style={{fontSize:20, color:'var(--z-500)', fontWeight:700, marginLeft:4}}>일</span>
        </div>
        <div style={{fontSize:12, color:'var(--z-500)', fontWeight:600, marginTop:4}}>총 15일 중 사용 4일 · 소멸 예정 0일</div>
        {/* progress */}
        <div style={{marginTop:14, height:8, background:'var(--z-100)', borderRadius:999, overflow:'hidden', display:'flex'}}>
          <div style={{flex: 11, background:'var(--accent)', borderRadius:'999px 0 0 999px'}}/>
          <div style={{flex: 4,  background:'var(--z-300)'}}/>
        </div>
        <div style={{display:'flex', justifyContent:'space-between', marginTop:6, fontSize:10, color:'var(--z-500)', fontWeight:700}}>
          <span>잔여 11일</span><span>사용 4일</span>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-h"><div className="lbl">소멸 알림</div></div>
        <div className="m-card" style={{padding:'14px 16px', background:'var(--warning-soft)', borderColor:'transparent', display:'flex', alignItems:'center', gap:12}}>
          <div style={{width:36, height:36, borderRadius:10, background:'var(--warning)', color:'#fff', display:'grid', placeItems:'center'}}>
            <MIcon name="alertTri" size={18}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:13, fontWeight:800, color:'var(--warning)'}}>12월 31일 소멸 예정 0일</div>
            <div style={{fontSize:11, color:'var(--z-600)', fontWeight:600, marginTop:1}}>현재 시점 잔여 11일 — 6월까지 8일 추가 사용 권장</div>
          </div>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-h"><div className="lbl">월별 사용</div></div>
        <div className="m-card" style={{padding:'14px 14px'}}>
          <div style={{display:'flex', alignItems:'flex-end', gap:6, height:80}}>
            {[0,1,1,2,0,0,0,0,0,0,0,0].map((v,i) => (
              <div key={i} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4}}>
                <div style={{height: v > 0 ? (v/2)*60 + 12 : 4, width:'100%', background: i === 4 ? 'var(--accent)' : v > 0 ? 'var(--accent-soft)' : 'var(--z-100)', borderRadius:'4px 4px 2px 2px'}}/>
              </div>
            ))}
          </div>
          <div style={{display:'flex', gap:6, marginTop:8, fontSize:10, color:'var(--z-500)', fontWeight:600}}>
            {['1','2','3','4','5','6','7','8','9','10','11','12'].map((m,i) => (
              <div key={i} style={{flex:1, textAlign:'center', color: i === 4 ? 'var(--accent)' : 'var(--z-500)', fontWeight: i === 4 ? 800 : 600}}>{m}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-h"><div className="lbl">신청 내역</div><span className="more">전체</span></div>
        <div className="m-card flush">
          {[
            { d:'2026.05.15-17 (3일)', kind:'연차',   tone:'warning', s:'결재중 1/2' },
            { d:'2026.04.30 (반차)',   kind:'반차',   tone:'success', s:'승인' },
            { d:'2026.04.07-08 (2일)', kind:'연차',   tone:'success', s:'승인' },
            { d:'2026.03.12 (1일)',    kind:'경조사', tone:'success', s:'승인' },
          ].map((r,i,arr) => (
            <div key={i} className="m-list-row">
              <div className={'ico-tile tone-'+(r.tone || 'accent')}><MIcon name="calendar" size={18}/></div>
              <div>
                <div className="lbl">{r.d}</div>
                <div className="sub">{r.kind}</div>
              </div>
              <MChip tone={r.tone}>{r.s}</MChip>
            </div>
          ))}
        </div>
      </div>

      <div style={{height:24}}/>
    </div>
    <div className="m-sticky-foot">
      <MBtn block>휴가계획서</MBtn>
      <MBtn block variant="primary" icon="plus" onClick={()=>onOpen && onOpen('form-leave')}>연차 신청</MBtn>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// HR 4. 근태 이상 감지 (abnormal)
// ═══════════════════════════════════════════════════════════════
const SHrAbnormal = ({ onBack }) => {
  const [tab, setTab] = React.useState('mine');
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="근태이상 감지" sub="이번 달 본인 4건 · 팀 12건"/>
      <div style={{padding:'10px 16px 0', background:'var(--card)', borderBottom:'1px solid var(--border)'}}>
        <div className="m-seg">
          <button className={tab==='mine'?'on':''} onClick={()=>setTab('mine')}>내 근태 4</button>
          <button className={tab==='team'?'on':''} onClick={()=>setTab('team')}>팀 12</button>
        </div>
      </div>
      <div className="m-scroll">
        {tab === 'mine' && (
          <>
            <div style={{padding:'14px 16px 0', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8}}>
              {[
                { l:'지각',     v:3, tone:'warning' },
                { l:'조퇴',     v:1, tone:'warning' },
                { l:'미체크',   v:0, tone:'' },
              ].map((k,i) => (
                <div key={i} className="m-card" style={{padding:'12px 12px'}}>
                  <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{k.l}</div>
                  <div className="m-tnum" style={{fontSize:22, fontWeight:800, letterSpacing:'-0.025em', marginTop:4, color: k.tone === 'warning' ? 'var(--warning)' : 'var(--z-900)'}}>{k.v}<span style={{fontSize:11, color:'var(--z-500)', fontWeight:700, marginLeft:3}}>회</span></div>
                </div>
              ))}
            </div>
            <div style={{padding:'14px 16px 0'}}>
              <div className="m-card flush">
                {[
                  { d:'5/11 (월) 09:21', t:'지각',   m:'21분 늦음', tone:'warning', need:true },
                  { d:'5/8 (금) 17:33',  t:'조퇴',   m:'27분 일찍 퇴근', tone:'warning', need:true },
                  { d:'5/6 (수) 09:14',  t:'지각',   m:'14분 늦음', tone:'warning', need:false, reason:'교통체증 사유 입력됨' },
                  { d:'5/3 (일) 09:25',  t:'지각',   m:'25분 늦음', tone:'warning', need:false, reason:'개인사유 입력됨' },
                ].map((r,i,arr) => (
                  <div key={i} style={{padding:'14px 16px', borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none'}}>
                    <div style={{display:'flex', alignItems:'center', gap:6}}>
                      <MChip tone={r.tone}>{r.t}</MChip>
                      <span style={{fontSize:12, color:'var(--z-700)', fontWeight:700}}>{r.m}</span>
                      <div style={{flex:1}}/>
                      <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>{r.d}</span>
                    </div>
                    {r.need ? (
                      <button style={{marginTop:10, width:'100%', height:36, border:'1px dashed var(--warning)', color:'var(--warning)', borderRadius:8, fontSize:12, fontWeight:800, background:'var(--warning-soft)'}}>
                        + 사유 입력 (필요)
                      </button>
                    ) : (
                      <div style={{marginTop:6, fontSize:12, color:'var(--z-500)', fontWeight:600, paddingLeft:4}}>{r.reason}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {tab === 'team' && (
          <div style={{padding:'14px 16px 0'}}>
            <DesktopHint>팀 근태 분석은 데스크톱에서 상세히</DesktopHint>
            <div className="m-card flush" style={{marginTop:12}}>
              {[
                { n:'최영빈', d:'영상의학팀', t:'지각', v:5, tone:'warning' },
                { n:'김민서', d:'간호팀',     t:'미체크', v:3, tone:'danger' },
                { n:'이재희', d:'간호팀',     t:'조퇴', v:2, tone:'warning' },
                { n:'박원장', d:'영상의학팀', t:'지각', v:2, tone:'warning' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <MAvatar tone={['pink','blue','violet','green'][i]}>{r.n.charAt(0)}</MAvatar>
                  <div>
                    <div className="lbl">{r.n} <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>· {r.d}</span></div>
                    <div className="sub">이번 달 {r.t} {r.v}회</div>
                  </div>
                  <MChip tone={r.tone}>{r.t} {r.v}</MChip>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// HR 5. 복지 (welfare) — 경조사 / 건강검진 / 면허·자격 / 의료기기
// ═══════════════════════════════════════════════════════════════
const SHrWelfare = ({ onBack }) => {
  const [tab, setTab] = React.useState('family');
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="복지" sub="박철홍정형외과"/>
      <div className="m-chip-bar">
        <button className={tab==='family'?'on':''} onClick={()=>setTab('family')}>경조사</button>
        <button className={tab==='health'?'on':''} onClick={()=>setTab('health')}>건강검진</button>
        <button className={tab==='cert'?'on':''}   onClick={()=>setTab('cert')}>면허·자격</button>
        <button className={tab==='dev'?'on':''}    onClick={()=>setTab('dev')}>의료기기 점검</button>
      </div>
      <div className="m-scroll">
        {tab === 'family' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card" style={{padding:'14px 16px', marginBottom:12, background:'var(--accent-soft)', borderColor:'transparent'}}>
              <div style={{fontSize:11, fontWeight:800, color:'var(--accent)', letterSpacing:'0.04em'}}>이번 달 경조사 지원</div>
              <div className="m-tnum" style={{fontSize:26, fontWeight:800, letterSpacing:'-0.025em', color:'var(--accent)', marginTop:4}}>
                ₩ 1,200,000<span style={{fontSize:12, fontWeight:700, marginLeft:6, color:'var(--z-600)'}}>· 3건</span>
              </div>
            </div>
            <div className="m-card flush">
              {[
                { who:'홍자비', kind:'결혼',    ts:'5/24 예정', amt:'500,000', tone:'accent', side:'본인' },
                { who:'박유진', kind:'조부상',  ts:'5/2 완료',  amt:'300,000', tone:'',       side:'직계가족' },
                { who:'이현우', kind:'출산',    ts:'4/15 완료', amt:'400,000', tone:'',       side:'배우자' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <MAvatar tone={['pink','blue','green'][i]}>{r.who.charAt(0)}</MAvatar>
                  <div>
                    <div className="lbl">{r.who} <MChip tone={r.tone || ''}>{r.kind}</MChip></div>
                    <div className="sub">{r.side} · {r.ts}</div>
                  </div>
                  <div className="val m-tnum">{r.amt}<span className="u">원</span></div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'health' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card" style={{padding:'16px 18px'}}>
              <div style={{fontSize:12, color:'var(--z-500)', fontWeight:700}}>다음 건강검진</div>
              <div style={{fontSize:18, fontWeight:800, marginTop:4, letterSpacing:'-0.02em'}}>2026.06.18 (목)</div>
              <div style={{fontSize:12, color:'var(--z-500)', fontWeight:600, marginTop:2}}>김안과 검진센터 · 종합검진</div>
              <div style={{marginTop:12, height:6, background:'var(--z-100)', borderRadius:999, overflow:'hidden'}}>
                <div style={{width:'72%', height:'100%', background:'var(--accent)'}}/>
              </div>
              <div style={{display:'flex', justifyContent:'space-between', marginTop:6, fontSize:11, color:'var(--z-500)', fontWeight:700}}>
                <span>예약 23 / 32명</span>
                <span>D-38</span>
              </div>
            </div>
            <div className="m-section-h" style={{padding:'18px 0 8px'}}><div className="lbl">미예약 직원 9명</div></div>
            <div className="m-card flush">
              {[
                { n:'최영빈', d:'영상의학팀' },
                { n:'김민서', d:'간호팀' },
                { n:'이재희', d:'간호팀' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <MAvatar tone={['pink','blue','violet'][i]}>{r.n.charAt(0)}</MAvatar>
                  <div>
                    <div className="lbl">{r.n}</div>
                    <div className="sub">{r.d}</div>
                  </div>
                  <MBtn size="sm">독려</MBtn>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'cert' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { who:'박철홍', n:'전문의 (정형외과)', exp:'2028.03', tone:'success', d:'정상' },
                { who:'김상민', n:'방사선사 면허',     exp:'2026.06.02', tone:'danger',  d:'만료 임박' },
                { who:'박유진', n:'간호조무사',       exp:'2027.11', tone:'success', d:'정상' },
                { who:'홍자비', n:'PHP 운영자격',     exp:'2026.08.15', tone:'warning', d:'3개월 내 만료' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <div className={'ico-tile tone-'+(r.tone === 'danger' ? 'danger' : r.tone === 'warning' ? 'warning' : 'success')}>
                    <MIcon name="badge" size={18}/>
                  </div>
                  <div>
                    <div className="lbl">{r.who} <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>· {r.n}</span></div>
                    <div className="sub">만료일 {r.exp}</div>
                  </div>
                  <MChip tone={r.tone}>{r.d}</MChip>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'dev' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { n:'1.5T MRI · GE Signa',    next:'2026.05.20', cycle:'분기', tone:'warning', d:'9일 후' },
                { n:'X-Ray Room 1 · Siemens', next:'2026.06.15', cycle:'반기', tone:'',        d:'35일 후' },
                { n:'C-Arm · GE OEC',         next:'2026.05.30', cycle:'월간', tone:'success', d:'19일 후' },
                { n:'초음파 GE Logiq',        next:'2026.04.28', cycle:'월간', tone:'danger',  d:'13일 지연' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <div className={'ico-tile tone-'+(r.tone === 'danger' ? 'danger' : r.tone === 'warning' ? 'warning' : r.tone === 'success' ? 'success' : '')}>
                    <MIcon name="settings" size={18}/>
                  </div>
                  <div>
                    <div className="lbl">{r.n}</div>
                    <div className="sub">{r.cycle} 점검 · {r.next}</div>
                  </div>
                  <MChip tone={r.tone}>{r.d}</MChip>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// HR 6. 계약·문서 (docs)
// ═══════════════════════════════════════════════════════════════
const SHrDocs = ({ onBack }) => {
  const [tab, setTab] = React.useState('mine');
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="계약·문서" sub="내 문서함" actions={<button><MIcon name="search" size={20}/></button>}/>
      <div className="m-chip-bar">
        <button className={tab==='mine'?'on':''}  onClick={()=>setTab('mine')}>내 문서 5</button>
        <button className={tab==='cert'?'on':''}  onClick={()=>setTab('cert')}>증명서</button>
        <button className={tab==='ctr'?'on':''}   onClick={()=>setTab('ctr')}>계약</button>
        <button className={tab==='submit'?'on':''} onClick={()=>setTab('submit')}>서류제출</button>
      </div>
      <div className="m-scroll">
        {tab === 'mine' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { t:'근로계약서 (2023.08)', s:'PDF · 312KB', ic:'fileText', tone:'accent' },
                { t:'개인정보처리 동의서', s:'PDF · 89KB',  ic:'fileText', tone:'' },
                { t:'비밀유지서약서',     s:'PDF · 124KB', ic:'fileText', tone:'' },
                { t:'인사기록카드',       s:'PDF · 218KB', ic:'fileText', tone:'' },
                { t:'2025년 연말정산 영수증', s:'PDF · 56KB',  ic:'fileText', tone:'' },
              ].map((d,i,arr) => (
                <div key={i} className="m-list-row">
                  <div className={'ico-tile ' + (d.tone ? 'tone-'+d.tone : '')}><MIcon name={d.ic} size={18}/></div>
                  <div>
                    <div className="lbl">{d.t}</div>
                    <div className="sub">{d.s}</div>
                  </div>
                  <MIcon name="download" size={18} color="var(--z-500)"/>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'cert' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-section-h"><div className="lbl">발급 가능한 증명서</div></div>
            <div className="m-card flush">
              {[
                { t:'재직증명서',       d:'본인용·국문',  ic:'fileText' },
                { t:'경력증명서',       d:'2023.08 ~ 현재', ic:'fileText' },
                { t:'근로소득원천징수영수증', d:'2025년',     ic:'won' },
                { t:'4대보험 가입증명서',   d:'국문',         ic:'shield' },
              ].map((c,i,arr) => (
                <MListRow key={i} icon={c.ic} label={c.t} sub={c.d} right={<MBtn size="sm">발급</MBtn>}/>
              ))}
            </div>
            <div className="m-section-h" style={{padding:'18px 0 8px'}}><div className="lbl">발급 이력</div></div>
            <div className="m-card flush">
              <MListRow icon="check" iconTone="success" label="재직증명서" sub="5/8 14:22 발급 · 본인 보관"/>
              <MListRow icon="check" iconTone="success" label="경력증명서" sub="4/15 11:08 발급 · 우리은행 제출"/>
            </div>
          </div>
        )}
        {tab === 'ctr' && (
          <div style={{padding:'14px 16px 0'}}>
            <DesktopHint>계약서 자동생성·서명은 데스크톱에서</DesktopHint>
            <div style={{marginTop:12}}>
              <div className="m-card flush">
                <MListRow icon="fileText" iconTone="accent" label="근로계약서 v3.1"  sub="현재 적용 · 2023.08.01 ~"/>
                <MListRow icon="fileText"                   label="연봉계약서 2026"  sub="2026.01.01 ~"/>
                <MListRow icon="fileText"                   label="비밀유지서약서"  sub="2023.08.01"/>
              </div>
            </div>
          </div>
        )}
        {tab === 'submit' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card" style={{padding:'14px 16px', background:'var(--warning-soft)', borderColor:'transparent'}}>
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <MIcon name="alertTri" size={18} color="var(--warning)"/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13, fontWeight:800, color:'var(--warning)'}}>제출 필요 서류 2건</div>
                  <div style={{fontSize:11, color:'var(--z-600)', fontWeight:600, marginTop:1}}>주민등록등본 · 통장사본</div>
                </div>
              </div>
            </div>
            <div className="m-card flush" style={{marginTop:12}}>
              {[
                { t:'주민등록등본',   d:'미제출 · D-3', tone:'danger',  s:'미제출' },
                { t:'통장사본',     d:'미제출 · D-5', tone:'warning', s:'미제출' },
                { t:'경력증명서 (이전 직장)', d:'5/3 제출', tone:'success', s:'확인됨' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <div className={'ico-tile tone-'+(r.tone || '')}><MIcon name="fileText" size={18}/></div>
                  <div>
                    <div className="lbl">{r.t}</div>
                    <div className="sub">{r.d}</div>
                  </div>
                  {r.s === '확인됨' ? <MChip tone="success">완료</MChip> : <MBtn size="sm" variant="primary">제출</MBtn>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { SHrMember, SHrAttend, SHrLeave, SHrAbnormal, SHrWelfare, SHrDocs, DesktopHint });
