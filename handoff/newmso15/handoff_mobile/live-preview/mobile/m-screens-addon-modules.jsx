// MSO 모바일 — Screens (Addon Modules 8개) : 조직도·부서재고·근무현황·인계노트·직원평가·수술상담·입금조회·마감보고·외부연동

// ═══════════════════════════════════════════════════════════════
// 1. 조직도 (org)
// ═══════════════════════════════════════════════════════════════
const SAddonOrg = ({ onBack }) => {
  const [view, setView] = React.useState('tree');
  const depts = [
    { d:'경영지원팀', cnt:5, online:4, lead:'백정민', tone:'blue', members:[
      { n:'백정민', role:'이사',  status:'근무중' },
      { n:'이재훈', role:'이사',  status:'근무중' },
      { n:'박유진', role:'대리',  status:'근무중' },
      { n:'홍자비', role:'사원',  status:'외근' },
      { n:'이현우', role:'PM',    status:'근무중' },
    ]},
    { d:'영상의학팀', cnt:4, online:3, lead:'김상민', tone:'green', members:[
      { n:'김상민', role:'팀장',  status:'근무중' },
      { n:'최영빈', role:'기사',  status:'휴가' },
      { n:'정수아', role:'기사',  status:'근무중' },
      { n:'한지원', role:'PA',    status:'근무중' },
    ]},
    { d:'간호부',     cnt:8, online:7, lead:'정해영', tone:'orange', members:[] },
    { d:'외래팀',     cnt:6, online:5, lead:'김지오', tone:'cyan',   members:[] },
    { d:'OP실',       cnt:4, online:4, lead:'박철홍', tone:'violet', members:[] },
    { d:'행정팀',     cnt:3, online:3, lead:'이수정', tone:'pink',   members:[] },
  ];
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="조직도" sub="6개 부서 · 30명" actions={<>
        <button><MIcon name="search" size={20}/></button>
        <button><MIcon name="share" size={20}/></button>
      </>}/>
      <div style={{padding:'10px 16px 0', background:'var(--card)', borderBottom:'1px solid var(--border)'}}>
        <div className="m-seg">
          <button className={view==='tree'?'on':''}    onClick={()=>setView('tree')}>부서</button>
          <button className={view==='card'?'on':''}    onClick={()=>setView('card')}>카드</button>
          <button className={view==='org'?'on':''}     onClick={()=>setView('org')}>조직도</button>
        </div>
      </div>
      {/* 대표 */}
      <div style={{padding:'14px 16px 0'}}>
        <div className="m-card" style={{padding:'14px 16px', background:'linear-gradient(135deg, var(--accent), #1D4ED8)', borderColor:'transparent', color:'#fff'}}>
          <div style={{fontSize:11, opacity:0.85, fontWeight:800, letterSpacing:'0.04em'}}>대표 · 원장</div>
          <div style={{display:'flex', alignItems:'center', gap:12, marginTop:8}}>
            <div style={{width:48, height:48, borderRadius:14, background:'rgba(255,255,255,0.18)', display:'grid', placeItems:'center', fontSize:18, fontWeight:800}}>박</div>
            <div style={{flex:1}}>
              <div style={{fontSize:16, fontWeight:800}}>박철홍</div>
              <div style={{fontSize:11, opacity:0.85, fontWeight:600, marginTop:1}}>원장 · 정형외과 전문의</div>
            </div>
            <button style={{padding:'6px 10px', background:'rgba(255,255,255,0.2)', borderRadius:8, fontSize:12, fontWeight:700, color:'#fff'}}>연락</button>
          </div>
        </div>
      </div>

      {view === 'tree' && (
        <div className="m-scroll">
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {depts.map((d,i,arr) => (
                <div key={i} className="m-list-row">
                  <MAvatar tone={d.tone}>{d.d.charAt(0)}</MAvatar>
                  <div>
                    <div className="lbl">{d.d} <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>· {d.lead} 팀장</span></div>
                    <div className="sub">{d.online}/{d.cnt} 온라인</div>
                  </div>
                  <MChip tone={d.online === d.cnt ? 'success' : 'accent'}>{d.cnt}명</MChip>
                </div>
              ))}
            </div>
            <div style={{height:24}}/>
          </div>
        </div>
      )}
      {view === 'card' && (
        <div className="m-scroll">
          <div style={{padding:'14px 16px 0'}}>
            {depts.slice(0,2).map((d, gi) => (
              <div key={gi}>
                <div style={{padding:'6px 0', display:'flex', alignItems:'center', gap:6}}>
                  <span style={{fontSize:11, fontWeight:800, color:'var(--z-500)', letterSpacing:'0.04em', textTransform:'uppercase'}}>{d.d}</span>
                  <span style={{fontSize:11, color:'var(--z-400)', fontWeight:700}}>{d.cnt}명</span>
                </div>
                <div style={{display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginBottom:14}}>
                  {d.members.map((m,j) => (
                    <div key={j} className="m-card" style={{padding:'12px 12px'}}>
                      <div style={{display:'flex', alignItems:'center', gap:8}}>
                        <MAvatar tone={d.tone} size="sm">{m.n.charAt(0)}</MAvatar>
                        <span style={{width:6, height:6, borderRadius:999, background: m.status === '근무중' ? 'var(--success)' : m.status === '휴가' ? 'var(--warning)' : 'var(--z-400)'}}/>
                      </div>
                      <div style={{fontSize:13, fontWeight:800, marginTop:8}}>{m.n}</div>
                      <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginTop:1}}>{m.role}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {view === 'org' && (
        <div className="m-scroll">
          <div style={{padding:'16px 16px'}}>
            {/* tree 시각화 */}
            <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:14}}>
              {/* 대표 */}
              <div style={{padding:'8px 14px', background:'var(--accent)', color:'#fff', borderRadius:10, fontSize:13, fontWeight:800}}>박철홍 · 원장</div>
              <div style={{width:1, height:14, background:'var(--z-300)'}}/>
              <div style={{display:'flex', gap:6, flexWrap:'wrap', justifyContent:'center'}}>
                {depts.map((d,i) => (
                  <div key={i} style={{padding:'6px 10px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:8, fontSize:11, fontWeight:700, color:'var(--z-700)', textAlign:'center'}}>
                    {d.d}<br/><span style={{fontSize:10, color:'var(--z-500)', fontWeight:600}}>{d.cnt}명</span>
                  </div>
                ))}
              </div>
            </div>
            <DesktopHint>풀 조직도(드래그·재구성)는 데스크톱에서</DesktopHint>
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 2. 부서별 재고 (dept-inventory)
// ═══════════════════════════════════════════════════════════════
const SAddonDeptInv = ({ onBack }) => {
  const [dept, setDept] = React.useState('mg');
  const DEPTS = [
    { id:'mso', name:'MSO 본사 (자재)', isMSO:true,  count:8421 },
    { id:'ou',  name:'외래팀',          isMSO:false, count:312 },
    { id:'wd',  name:'병동팀',          isMSO:false, count:489 },
    { id:'mg',  name:'경영지원팀',       isMSO:false, count:68 },
    { id:'la',  name:'검사팀',          isMSO:false, count:124 },
  ];
  const cur = DEPTS.find(d => d.id === dept);
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="부서별 재고" sub={cur.name + ' · ' + cur.count + '종'} actions={<>
        <button><MIcon name="search" size={20}/></button>
        <button><MIcon name="qr" size={20}/></button>
      </>}/>
      <div className="m-chip-bar">
        {DEPTS.map(d => (
          <button key={d.id} className={dept === d.id ? 'on' : ''} onClick={()=>setDept(d.id)}>
            {d.name.split(' ')[0]}<span className="cnt">{d.count}</span>
          </button>
        ))}
      </div>
      {/* 컨텍스트 안내 */}
      <div style={{padding:'12px 16px 0'}}>
        <div className="m-card" style={{padding:'12px 14px', background: cur.isMSO ? 'var(--accent-soft)' : 'var(--warning-soft)', borderColor:'transparent', display:'flex', alignItems:'center', gap:10}}>
          <MIcon name="alertCircle" size={18} color={cur.isMSO ? 'var(--accent)' : 'var(--warning)'}/>
          <div style={{flex:1, fontSize:12, fontWeight:700, color: cur.isMSO ? 'var(--accent)' : 'var(--warning)'}}>
            {cur.isMSO
              ? 'MSO 본사 — 자동 발주가 외부 거래처에 PO 발송됩니다'
              : '일반 부서 — 자동 발주는 MSO 본사로 내부 요청됩니다'}
          </div>
        </div>
      </div>

      <div className="m-scroll">
        <div style={{padding:'12px 16px 16px'}}>
          <div className="m-card flush">
            {[
              { n:'1회용 주사기 5cc',  stock:12,  unit:'개',  status:'부족', tone:'danger',  loc:'경영지원팀 보관함 A' },
              { n:'멸균거즈 4x4',       stock:42,  unit:'팩',  status:'주의', tone:'warning', loc:'경영지원팀 보관함 A' },
              { n:'알코올스왑',         stock:280, unit:'개',  status:'정상', tone:'success', loc:'경영지원팀 보관함 B' },
              { n:'프린터 토너 CL-1',  stock:3,   unit:'EA',  status:'정상', tone:'',        loc:'경영지원팀 사무용품' },
            ].map((it,i,arr) => (
              <div key={i} className="m-list-row">
                <div className={'ico-tile tone-'+(it.tone || '')}><MIcon name="box" size={18}/></div>
                <div>
                  <div className="lbl">{it.n}</div>
                  <div className="sub">{it.loc}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div className="m-tnum" style={{fontSize:15, fontWeight:800}}>{it.stock}<span style={{fontSize:10, color:'var(--z-500)', fontWeight:700, marginLeft:2}}>{it.unit}</span></div>
                  <MChip tone={it.tone}>{it.status}</MChip>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="m-sticky-foot">
        <MBtn block icon="arrowUp">출고 요청</MBtn>
        <MBtn block icon="paperclip" variant="primary">{cur.isMSO ? '발주 PO' : '본사 요청'}</MBtn>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 3. 근무현황 (worknow) — 실시간 상태판
// ═══════════════════════════════════════════════════════════════
const SAddonWorknow = ({ onBack }) => {
  const [filter, setFilter] = React.useState('all');
  const KPI = [
    { l:'근무중', v:18, tone:'success' },
    { l:'휴게',   v:3,  tone:'warning' },
    { l:'외근',   v:2,  tone:'accent' },
    { l:'휴가',   v:2,  tone:'' },
  ];
  const people = [
    { n:'박철홍', dept:'OP실',       state:'시술중', loc:'1번방', since:'09:00',  tone:'success', dot:true },
    { n:'백정민', dept:'경영지원팀',   state:'근무중', loc:'본사 데스크', since:'09:14', tone:'success', dot:true },
    { n:'박유진', dept:'경영지원팀',   state:'근무중', loc:'외래 카운터', since:'09:08', tone:'success', dot:true },
    { n:'김상민', dept:'영상의학팀',   state:'판독중', loc:'영상의학실 B', since:'10:24', tone:'success', dot:true },
    { n:'홍자비', dept:'경영지원팀',   state:'외근',  loc:'동인의료',     since:'10:32', tone:'accent' },
    { n:'정수아', dept:'영상의학팀',   state:'휴게',  loc:'직원휴게실',   since:'12:18', tone:'warning' },
    { n:'최영빈', dept:'영상의학팀',   state:'휴가',  loc:'-',           since:'-',     tone:'' },
    { n:'이재훈', dept:'경영지원팀',   state:'외출',  loc:'은행',         since:'11:42', tone:'accent' },
  ];
  const FILTERS = [
    { id:'all',    label:'전체', cnt:people.length },
    { id:'work',   label:'근무중', cnt:people.filter(p=>['근무중','시술중','판독중'].includes(p.state)).length },
    { id:'break',  label:'휴게/외근', cnt:people.filter(p=>['휴게','외근','외출'].includes(p.state)).length },
    { id:'off',    label:'휴가', cnt:people.filter(p=>p.state==='휴가').length },
  ];
  const filtered = filter === 'work' ? people.filter(p=>['근무중','시술중','판독중'].includes(p.state)) :
                   filter === 'break' ? people.filter(p=>['휴게','외근','외출'].includes(p.state)) :
                   filter === 'off' ? people.filter(p=>p.state==='휴가') : people;
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="근무현황" sub="실시간 · 마지막 갱신 8초 전" actions={<button><MIcon name="refresh" size={20}/></button>}/>
      <div style={{padding:'14px 16px 0', display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8}}>
        {KPI.map((k,i) => (
          <div key={i} className="m-card" style={{padding:'10px 8px', textAlign:'center'}}>
            <div className="m-tnum" style={{fontSize:22, fontWeight:800, color: k.tone === 'success' ? 'var(--success)' : k.tone === 'warning' ? 'var(--warning)' : k.tone === 'accent' ? 'var(--accent)' : 'var(--z-700)'}}>{k.v}</div>
            <div style={{fontSize:10, color:'var(--z-500)', fontWeight:700, marginTop:2}}>{k.l}</div>
          </div>
        ))}
      </div>
      <div className="m-chip-bar" style={{marginTop:4}}>
        {FILTERS.map(f => (
          <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={()=>setFilter(f.id)}>
            {f.label}<span className="cnt">{f.cnt}</span>
          </button>
        ))}
      </div>
      <div className="m-scroll">
        <div style={{padding:'12px 16px 16px'}}>
          <div className="m-card flush">
            {filtered.map((p,i,arr) => (
              <div key={i} className="m-list-row">
                <div style={{position:'relative'}}>
                  <MAvatar tone={['blue','pink','violet','cyan','green','orange'][i%6]} size="sm">{p.n.charAt(0)}</MAvatar>
                  {p.dot && <span style={{position:'absolute', bottom:-2, right:-2, width:11, height:11, borderRadius:999, background:'var(--success)', border:'2px solid var(--card)'}}/>}
                </div>
                <div>
                  <div className="lbl">{p.n} <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>· {p.dept}</span></div>
                  <div className="sub">{p.loc} {p.since !== '-' ? '· ' + p.since + ' 시작' : ''}</div>
                </div>
                <MChip tone={p.tone}>{p.state}</MChip>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 4. 인계노트 (handoff) — 캘린더형
// ═══════════════════════════════════════════════════════════════
const SAddonHandoff = ({ onBack }) => {
  const [view, setView] = React.useState('day');
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="인계노트" sub="2026.05.27 (월) · 오늘 공통 4건" actions={<>
        <button><MIcon name="calendar" size={20}/></button>
        <button><MIcon name="plus" size={20}/></button>
      </>}/>
      <div style={{padding:'10px 16px 0', background:'var(--card)', borderBottom:'1px solid var(--border)'}}>
        <div className="m-seg">
          <button className={view==='day'?'on':''}   onClick={()=>setView('day')}>오늘</button>
          <button className={view==='week'?'on':''}  onClick={()=>setView('week')}>이번 주</button>
          <button className={view==='all'?'on':''}   onClick={()=>setView('all')}>전체</button>
        </div>
      </div>

      <div className="m-scroll">
        {view === 'day' && (
          <>
            {/* 공통 인계 */}
            <div className="m-section">
              <div className="m-section-h"><div className="lbl">공통 인계 4건</div><span className="more">전체</span></div>
              {[
                { kind:'OP실 → 외래', t:'박○○ 환자 회복실 이동', who:'박철홍', ts:'14:22', tone:'accent', urgent:false },
                { kind:'전사',        t:'화재훈련 — 5/28 09:30',  who:'시스템', ts:'09:00', tone:'warning', urgent:true },
                { kind:'영상의학팀 → 외래', t:'MRI 판독 5건 완료', who:'김상민', ts:'11:18', tone:'',        urgent:false },
                { kind:'경영지원 → 전사', t:'급여명세서 5월 발송',   who:'박유진', ts:'10:24', tone:'',        urgent:false },
              ].map((n,i,arr) => (
                <div key={i} className="m-card" style={{margin:'8px 16px', padding:'14px 16px'}}>
                  <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
                    <MChip tone={n.tone}>{n.kind}</MChip>
                    {n.urgent && <MChip tone="danger">긴급</MChip>}
                    <div style={{flex:1}}/>
                    <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>{n.ts}</span>
                  </div>
                  <div style={{fontSize:14, fontWeight:800, letterSpacing:'-0.012em'}}>{n.t}</div>
                  <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginTop:6}}>{n.who} · 확인 8/30</div>
                </div>
              ))}
            </div>
            {/* 부서별 */}
            <div className="m-section">
              <div className="m-section-h"><div className="lbl">부서별 인계 보기</div></div>
              <div className="m-card flush" style={{margin:'0 16px'}}>
                {[
                  { d:'경영지원팀', cnt:3, tone:'blue' },
                  { d:'영상의학팀', cnt:2, tone:'green' },
                  { d:'OP실',       cnt:1, tone:'violet' },
                  { d:'간호부',     cnt:4, tone:'orange' },
                ].map((r,i,arr) => (
                  <MListRow key={i} icon="users" iconTone="" label={r.d} sub={r.cnt + '건 인계'} val={r.cnt}/>
                ))}
              </div>
            </div>
            <div style={{height:24}}/>
          </>
        )}
        {view === 'week' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { d:'월 5/27', cnt:8 },
                { d:'화 5/28', cnt:5, hot:true },
                { d:'수 5/29', cnt:6 },
                { d:'목 5/30', cnt:3 },
                { d:'금 5/31', cnt:7 },
              ].map((r,i,arr) => (
                <MListRow key={i} icon="calendar" iconTone={r.hot ? 'warning' : ''} label={r.d + (r.hot ? ' · 화재훈련' : '')} sub={r.cnt + '건 인계'} val={r.cnt}/>
              ))}
            </div>
          </div>
        )}
        {view === 'all' && (
          <div style={{padding:'14px 16px 0'}}>
            <DesktopHint>전체 인계노트 검색·필터는 데스크톱에서</DesktopHint>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 5. 직원평가 (eval)
// ═══════════════════════════════════════════════════════════════
const SAddonEval = ({ onBack }) => {
  const [tab, setTab] = React.useState('mine');
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="직원평가" sub="2026 상반기 · 평가기간 5/15-31"/>
      <div style={{padding:'10px 16px 0', background:'var(--card)', borderBottom:'1px solid var(--border)'}}>
        <div className="m-seg">
          <button className={tab==='mine'?'on':''}    onClick={()=>setTab('mine')}>내 평가</button>
          <button className={tab==='target'?'on':''}  onClick={()=>setTab('target')}>평가 대상 11</button>
          <button className={tab==='result'?'on':''}  onClick={()=>setTab('result')}>결과</button>
        </div>
      </div>
      <div className="m-scroll">
        {tab === 'mine' && (
          <>
            {/* hero */}
            <div style={{padding:'18px 16px', background:'var(--card)', borderBottom:'1px solid var(--border)', textAlign:'center'}}>
              <div style={{fontSize:11, color:'var(--z-500)', fontWeight:800, letterSpacing:'0.04em'}}>나의 평가 점수</div>
              <div className="m-tnum" style={{fontSize:42, fontWeight:800, color:'var(--accent)', letterSpacing:'-0.035em', marginTop:4}}>4.6<span style={{fontSize:16, color:'var(--z-500)', fontWeight:700, marginLeft:3}}>/5.0</span></div>
              <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginTop:4}}>상위 12% · 부서 평균 4.2</div>
            </div>

            {/* 항목별 */}
            <div className="m-section">
              <div className="m-section-h"><div className="lbl">항목별 점수</div></div>
              <div className="m-card" style={{padding:'14px 14px'}}>
                {[
                  { l:'업무 성과',  v:4.7, tone:'success' },
                  { l:'협업·소통', v:4.8, tone:'success' },
                  { l:'책임감',     v:4.5, tone:'success' },
                  { l:'전문성',     v:4.6, tone:'success' },
                  { l:'리더십',     v:4.4, tone:'accent' },
                ].map((r,i,arr) => (
                  <div key={i} style={{marginTop: i ? 12 : 0}}>
                    <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:5}}>
                      <span style={{fontSize:12, fontWeight:700, flex:1}}>{r.l}</span>
                      <span className="m-tnum" style={{fontSize:13, fontWeight:800, color: r.tone === 'success' ? 'var(--success)' : 'var(--accent)'}}>{r.v.toFixed(1)}</span>
                    </div>
                    <div style={{height:5, background:'var(--z-100)', borderRadius:999, overflow:'hidden'}}>
                      <div style={{width: (r.v/5)*100 + '%', height:'100%', background: r.tone === 'success' ? 'var(--success)' : 'var(--accent)'}}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="m-section">
              <div className="m-section-h"><div className="lbl">평가 코멘트 3</div></div>
              <div style={{padding:'0 16px'}}>
                {[
                  { who:'박철홍', tone:'violet', body:'경영지원팀 운영에 큰 기여. 분기별 리포트가 정확하고 매우 신뢰감 있습니다.' },
                  { who:'박유진', tone:'pink',   body:'복잡한 결재 흐름을 명확히 정리해서 팀 전체가 빨라졌어요.' },
                  { who:'이재훈', tone:'cyan',   body:'외부 거래처 소통이 매우 깔끔. 차기 리더십 트레이닝 적극 추천.' },
                ].map((c,i) => (
                  <div key={i} style={{display:'flex', gap:10, marginBottom:14}}>
                    <MAvatar tone={c.tone} size="sm">{c.who.charAt(0)}</MAvatar>
                    <div style={{flex:1}}>
                      <b style={{fontSize:12, fontWeight:800}}>{c.who}</b>
                      <div style={{fontSize:13, color:'var(--z-800)', marginTop:3, lineHeight:1.55}}>{c.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {tab === 'target' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { n:'박유진', d:'경영지원팀', s:'완료', tone:'success' },
                { n:'홍자비', d:'경영지원팀', s:'진행중 3/5', tone:'warning' },
                { n:'이현우', d:'경영지원팀', s:'진행중 1/5', tone:'warning' },
                { n:'김상민', d:'영상의학팀', s:'미시작', tone:'danger' },
                { n:'최영빈', d:'영상의학팀', s:'완료', tone:'success' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <MAvatar tone={['pink','violet','orange','green','cyan'][i]} size="sm">{r.n.charAt(0)}</MAvatar>
                  <div>
                    <div className="lbl">{r.n}</div>
                    <div className="sub">{r.d}</div>
                  </div>
                  <MChip tone={r.tone}>{r.s}</MChip>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'result' && (
          <div style={{padding:'14px 16px 0'}}>
            <DesktopHint>상세 분석·HR DB 반영은 데스크톱에서</DesktopHint>
          </div>
        )}
      </div>
      {tab === 'target' && (
        <div className="m-sticky-foot">
          <MBtn block variant="primary" icon="edit">평가 작성하기</MBtn>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 6. 수술상담 (consult) — 음성분석
// ═══════════════════════════════════════════════════════════════
const SAddonConsult = ({ onBack }) => {
  const [filter, setFilter] = React.useState('today');
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="수술상담" sub="음성분석 5건 · 박철홍정형외과" actions={<button><MIcon name="moreV" size={20}/></button>}/>
      <div className="m-chip-bar">
        <button className={filter==='today'?'on':''}    onClick={()=>setFilter('today')}>오늘<span className="cnt">5</span></button>
        <button className={filter==='week'?'on':''}     onClick={()=>setFilter('week')}>이번주<span className="cnt">23</span></button>
        <button className={filter==='followup'?'on':''} onClick={()=>setFilter('followup')}>팔로업<span className="cnt">8</span></button>
        <button className={filter==='convert'?'on':''}  onClick={()=>setFilter('convert')}>전환<span className="cnt">14</span></button>
      </div>

      {/* hero */}
      <div style={{padding:'12px 16px 0'}}>
        <div className="m-card" style={{padding:'14px 16px', background:'linear-gradient(135deg, var(--accent), #7C3AED)', borderColor:'transparent', color:'#fff'}}>
          <div style={{fontSize:11, opacity:0.85, fontWeight:800, letterSpacing:'0.04em'}}>오늘 상담 전환율</div>
          <div className="m-tnum" style={{fontSize:32, fontWeight:800, marginTop:4, letterSpacing:'-0.03em'}}>72%<span style={{fontSize:13, fontWeight:700, opacity:0.85, marginLeft:6}}>+8%p</span></div>
          <div style={{fontSize:11, opacity:0.85, fontWeight:600, marginTop:2}}>5건 상담 · 4건 수술 전환 · 1건 검토중</div>
        </div>
      </div>

      <div className="m-scroll">
        <div style={{padding:'14px 16px 0', display:'flex', flexDirection:'column', gap:10}}>
          {[
            { p:'박○○ (M, 54)', kind:'무릎 관절경', dur:'18:24', sent:'긍정', tone:'success', state:'전환',   keywords:['통증','일상복귀','보험'],   ts:'09:30' },
            { p:'김○○ (F, 47)', kind:'척추 신경차단', dur:'12:08', sent:'중립', tone:'',        state:'검토',   keywords:['가격','휴식','회복기간'],   ts:'10:24' },
            { p:'이○○ (M, 62)', kind:'어깨 관절경', dur:'22:42', sent:'긍정', tone:'success', state:'전환',   keywords:['통증','MRI','일상복귀'],    ts:'11:18' },
            { p:'정○○ (F, 71)', kind:'무릎 인공관절', dur:'14:35', sent:'부정', tone:'danger',  state:'팔로업', keywords:['수술 부담','비용','재활'],  ts:'13:42' },
            { p:'홍○○ (F, 29)', kind:'발목 관절경', dur:'09:52', sent:'긍정', tone:'success', state:'전환',   keywords:['일상복귀','보험'],          ts:'14:50' },
          ].map((c,i) => (
            <div key={i} className="m-card" style={{padding:'14px 16px'}}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
                <MChip tone={c.tone}>{c.sent}</MChip>
                <MChip tone={c.state === '전환' ? 'accent' : c.state === '팔로업' ? 'warning' : ''}>{c.state}</MChip>
                <div style={{flex:1}}/>
                <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>{c.ts}</span>
              </div>
              <div style={{fontSize:14, fontWeight:800}}>{c.p}<span style={{fontSize:12, color:'var(--z-500)', fontWeight:600, marginLeft:6}}>· {c.kind}</span></div>
              <div style={{display:'flex', alignItems:'center', gap:8, marginTop:8}}>
                <button style={{display:'inline-flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:999, background:'var(--accent-soft)', color:'var(--accent)', fontSize:11, fontWeight:800}}>
                  <MIcon name="send" size={11}/> 음성 {c.dur}
                </button>
                <div style={{flex:1, display:'flex', gap:4, flexWrap:'wrap'}}>
                  {c.keywords.map((k,j) => (
                    <span key={j} style={{padding:'2px 8px', borderRadius:999, background:'var(--z-100)', fontSize:10, fontWeight:700, color:'var(--z-600)'}}>#{k}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{height:24}}/>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 7. 입금 실시간조회 (deposit) — Chart 이관 예정
// ═══════════════════════════════════════════════════════════════
const SAddonDeposit = ({ onBack }) => (
  <div className="m-screen">
    <MHeader back={onBack} title="입금 실시간조회" sub="2026.05.27 (월) · 박철홍정형외과"
      actions={<button><MIcon name="refresh" size={20}/></button>}/>
    {/* 안내 */}
    <div style={{padding:'12px 16px 0'}}>
      <div className="m-card" style={{padding:'12px 14px', background:'var(--warning-soft)', borderColor:'transparent', display:'flex', alignItems:'center', gap:10}}>
        <MIcon name="alertTri" size={18} color="var(--warning)"/>
        <div style={{flex:1, fontSize:12, fontWeight:700, color:'var(--warning)'}}>Chart 시스템으로 이관 예정 — 2026 Q4</div>
      </div>
    </div>

    <div className="m-scroll">
      {/* hero */}
      <div style={{padding:'14px 16px 0', textAlign:'center'}}>
        <div style={{fontSize:11, color:'var(--z-500)', fontWeight:800, letterSpacing:'0.04em'}}>오늘 입금 합계</div>
        <div className="m-tnum" style={{fontSize:38, fontWeight:800, color:'var(--accent)', letterSpacing:'-0.035em', marginTop:4}}>₩ 9,407,830</div>
        <div style={{fontSize:12, color:'var(--success)', fontWeight:800, marginTop:4}}>142건 · +12.4% vs 어제</div>
      </div>

      {/* 시간대별 차트 */}
      <div className="m-section">
        <div className="m-section-h"><div className="lbl">시간대별 입금</div></div>
        <div className="m-card" style={{padding:'14px 14px'}}>
          <div style={{display:'flex', alignItems:'flex-end', gap:4, height:90}}>
            {[2,4,8,18,32,28,22,18,14,10,8,5].map((v,i,arr) => (
              <div key={i} style={{flex:1, height: (v/32)*100 + '%', background: i === 4 ? 'var(--accent)' : 'var(--accent-soft)', borderRadius:'4px 4px 2px 2px'}}/>
            ))}
          </div>
          <div style={{display:'flex', marginTop:6, fontSize:10, color:'var(--z-500)', fontWeight:600}}>
            {['09','10','11','12','13','14','15','16','17','18','19','20'].map((m,i,arr) => (
              <div key={i} style={{flex:1, textAlign:'center', color: i === 4 ? 'var(--accent)' : 'var(--z-500)', fontWeight: i === 4 ? 800 : 600}}>{m}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-h"><div className="lbl">최근 입금 6건</div><span className="more">전체 142</span></div>
        <div className="m-card flush">
          {[
            { t:'15:22', p:'박○○ (M, 54)', amt:'68,000',  kind:'카드 (현장)' },
            { t:'15:14', p:'김○○ (F, 47)', amt:'42,000',  kind:'카드 (현장)' },
            { t:'15:08', p:'이○○ (M, 62)', amt:'180,000', kind:'계좌이체' },
            { t:'15:02', p:'정○○ (F, 71)', amt:'68,000',  kind:'카드 (현장)' },
            { t:'14:58', p:'홍○○ (F, 29)', amt:'120,000', kind:'카드 (현장)' },
            { t:'14:50', p:'서○○ (M, 55)', amt:'68,000',  kind:'현금' },
          ].map((r,i,arr) => (
            <div key={i} className="m-list-row">
              <div className="m-tnum" style={{width:40, fontSize:11, fontWeight:800, color:'var(--z-500)'}}>{r.t}</div>
              <div>
                <div className="lbl">{r.p}</div>
                <div className="sub">{r.kind}</div>
              </div>
              <div className="val m-tnum">{r.amt}<span className="u">원</span></div>
            </div>
          ))}
        </div>
      </div>
      <div style={{height:24}}/>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// 8. 마감보고 (closing)
// ═══════════════════════════════════════════════════════════════
const SAddonClosing = ({ onBack }) => {
  const [tab, setTab] = React.useState('today');
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="마감보고" sub="박철홍정형외과 · 일/주/월"/>
      <div style={{padding:'10px 16px 0', background:'var(--card)', borderBottom:'1px solid var(--border)'}}>
        <div className="m-seg">
          <button className={tab==='today'?'on':''} onClick={()=>setTab('today')}>일 마감</button>
          <button className={tab==='week'?'on':''}  onClick={()=>setTab('week')}>주 마감</button>
          <button className={tab==='month'?'on':''} onClick={()=>setTab('month')}>월 마감</button>
        </div>
      </div>
      {/* 안내 */}
      <div style={{padding:'12px 16px 0'}}>
        <div className="m-card" style={{padding:'12px 14px', background:'var(--warning-soft)', borderColor:'transparent', display:'flex', alignItems:'center', gap:10}}>
          <MIcon name="alertTri" size={18} color="var(--warning)"/>
          <div style={{flex:1, fontSize:12, fontWeight:700, color:'var(--warning)'}}>Chart 시스템으로 이관 예정 — 2026 Q4 · 미제출 1일 누적</div>
        </div>
      </div>

      <div className="m-scroll">
        {tab === 'today' && (
          <>
            <div style={{padding:'14px 16px 0'}}>
              <div className="m-card" style={{padding:'14px 14px'}}>
                <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>5/27 (월) 일 마감</div>
                <div className="m-tnum" style={{fontSize:24, fontWeight:800, letterSpacing:'-0.025em', marginTop:4}}>₩ 9,407,830</div>
                <div style={{display:'flex', gap:8, marginTop:10}}>
                  <MChip tone="success" dot>현금 합계 일치</MChip>
                  <MChip tone="success" dot>카드 합계 일치</MChip>
                </div>
              </div>
            </div>
            <div className="m-section">
              <div className="m-section-h"><div className="lbl">제출 체크리스트 6항목</div></div>
              <div className="m-card flush">
                {[
                  { t:'환자수·매출 집계',          s:'완료', tone:'success' },
                  { t:'현금 시재 확인',           s:'완료', tone:'success' },
                  { t:'카드 단말기 마감',         s:'완료', tone:'success' },
                  { t:'미수금·환불 정리',         s:'완료', tone:'success' },
                  { t:'영상의학팀 판독 현황 보고', s:'완료', tone:'success' },
                  { t:'대표 결재 제출',           s:'대기', tone:'warning' },
                ].map((r,i,arr) => (
                  <div key={i} className="m-list-row">
                    <div className={'ico-tile tone-' + (r.tone)}><MIcon name={r.s === '완료' ? 'check' : 'clock'} size={18}/></div>
                    <div className="lbl">{r.t}</div>
                    <MChip tone={r.tone}>{r.s}</MChip>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {tab === 'week' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { d:'월 5/27', s:'대기',   tone:'warning' },
                { d:'화 5/28', s:'예정',   tone:'' },
                { d:'수 5/29', s:'예정',   tone:'' },
                { d:'목 5/30', s:'예정',   tone:'' },
                { d:'금 5/31', s:'예정',   tone:'' },
              ].map((r,i,arr) => (
                <MListRow key={i} icon="calendar" iconTone={r.tone || ''} label={r.d + ' 마감'} sub={r.s} val={r.s}/>
              ))}
            </div>
          </div>
        )}
        {tab === 'month' && (
          <div style={{padding:'14px 16px 0'}}>
            <DesktopHint>월 마감 보고서·차트는 데스크톱에서 PDF 발행</DesktopHint>
          </div>
        )}
      </div>
      <div className="m-sticky-foot">
        <MBtn block icon="download">초안 보기</MBtn>
        <MBtn block variant="primary" icon="send">대표 결재 제출</MBtn>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 9. 외부연동 (주차관제·웹팩스) — 안내 화면
// ═══════════════════════════════════════════════════════════════
const SAddonExternal = ({ onBack, kind = 'parking' }) => (
  <div className="m-screen">
    <MHeader back={onBack} title={kind === 'parking' ? '주차관제' : '웹팩스'} sub="외부 시스템 연동"/>
    <div className="m-scroll">
      <div style={{padding:'40px 24px', textAlign:'center'}}>
        <div style={{width:80, height:80, borderRadius:24, background:'var(--accent-soft)', color:'var(--accent)', display:'grid', placeItems:'center', margin:'0 auto 18px'}}>
          <MIcon name={kind === 'parking' ? 'box' : 'send'} size={36} strokeWidth={1.4}/>
        </div>
        <div style={{fontSize:20, fontWeight:800, letterSpacing:'-0.025em'}}>{kind === 'parking' ? '주차관제' : '웹팩스'}</div>
        <div style={{fontSize:13, color:'var(--z-500)', fontWeight:600, marginTop:6, lineHeight:1.55, padding:'0 12px'}}>
          {kind === 'parking'
            ? '주차장 입출차·차량 인식 시스템은 외부 시스템 (Hi-Park)에서 운영됩니다. 데스크톱에서 통합 대시보드를 사용하세요.'
            : '발수신 팩스 관리는 외부 시스템 (WebFax+)에서 처리됩니다. 모바일에서는 알림만 받을 수 있습니다.'
          }
        </div>
        <div style={{marginTop:18, padding:'0 12px', display:'flex', flexDirection:'column', gap:8}}>
          <MBtn variant="primary" icon="send" block>외부 시스템 열기</MBtn>
          <MBtn icon="alertCircle" block>모바일 알림만 받기</MBtn>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-h"><div className="lbl">최근 활동</div></div>
        <div className="m-card flush">
          {kind === 'parking' ? [
            { t:'15:22', s:'입차',  who:'직원 박○○ 차량 (12가1234)' },
            { t:'14:50', s:'출차',  who:'환자 김○○ 차량 (34나5678)' },
            { t:'14:18', s:'입차',  who:'외부 거래처 (56다9012)' },
          ].map((r,i,arr) => (
            <div key={i} className="m-list-row">
              <div className="m-tnum" style={{width:40, fontSize:11, fontWeight:800, color:'var(--z-500)'}}>{r.t}</div>
              <div>
                <div className="lbl">{r.s}</div>
                <div className="sub">{r.who}</div>
              </div>
              <MIcon name="chevR" size={18} color="var(--z-400)"/>
            </div>
          )) : [
            { t:'14:32', s:'수신', who:'한솔메디칼 — 견적서' },
            { t:'13:08', s:'발신', who:'JK의료 — 발주서 #1240' },
            { t:'11:24', s:'수신', who:'세무사사무소 — 5월 부가세' },
          ].map((r,i,arr) => (
            <div key={i} className="m-list-row">
              <div className="m-tnum" style={{width:40, fontSize:11, fontWeight:800, color:'var(--z-500)'}}>{r.t}</div>
              <div>
                <div className="lbl">{r.s} · {r.who}</div>
                <div className="sub">2026.05.27</div>
              </div>
              <MIcon name="chevR" size={18} color="var(--z-400)"/>
            </div>
          ))}
        </div>
      </div>
      <div style={{height:24}}/>
    </div>
  </div>
);

Object.assign(window, {
  SAddonOrg, SAddonDeptInv, SAddonWorknow, SAddonHandoff,
  SAddonEval, SAddonConsult, SAddonDeposit, SAddonClosing, SAddonExternal,
});
