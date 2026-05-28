// MSO 모바일 — Screens (Addon Details) : OP체크 · 퇴원심사 · MRI · 업무공유 · 업무가이드
// (근무표는 SHrAttend, 자산관리는 SStockItem, 감사센터는 SAdminAudit 가 처리)

// ═══════════════════════════════════════════════════════════════
// AD 1. OP체크 — 실시간 보드
// ═══════════════════════════════════════════════════════════════
const SOpCheck = ({ onBack, onOpen }) => {
  const [filter, setFilter] = React.useState('all');
  const items = [
    { id:1, room:'1번방', patient:'박○○', procedure:'관절경', doctor:'박철홍', start:'09:00', state:'진행중', tone:'success',  mins:32 },
    { id:2, room:'2번방', patient:'김○○', procedure:'신경차단술', doctor:'박철홍', start:'09:30', state:'진행중', tone:'success',  mins:18 },
    { id:3, room:'3번방', patient:'이○○', procedure:'주사 시술',  doctor:'박철홍', start:'10:30', state:'대기',   tone:'',         mins:0 },
    { id:4, room:'1번방', patient:'최○○', procedure:'관절경',     doctor:'박철홍', start:'11:00', state:'대기',   tone:'',         mins:0 },
    { id:5, room:'2번방', patient:'정○○', procedure:'PRP',       doctor:'박철홍', start:'14:00', state:'대기',   tone:'',         mins:0 },
    { id:6, room:'1번방', patient:'홍○○', procedure:'관절경',     doctor:'박철홍', start:'08:00', state:'완료',   tone:'accent',   mins:48 },
    { id:7, room:'3번방', patient:'서○○', procedure:'주사 시술',  doctor:'박철홍', start:'08:30', state:'보류',   tone:'warning',  mins:0, reason:'환자 도착 지연' },
  ];
  const CHIPS = [
    { id:'all',      label:'전체',   cnt: items.length },
    { id:'inprog',   label:'진행중', cnt: items.filter(i => i.state === '진행중').length },
    { id:'wait',     label:'대기',   cnt: items.filter(i => i.state === '대기').length },
    { id:'done',     label:'완료',   cnt: items.filter(i => i.state === '완료').length },
    { id:'hold',     label:'보류',   cnt: items.filter(i => i.state === '보류').length },
  ];
  const map = { all:items, inprog:items.filter(i=>i.state==='진행중'), wait:items.filter(i=>i.state==='대기'), done:items.filter(i=>i.state==='완료'), hold:items.filter(i=>i.state==='보류') };
  const filtered = map[filter] || items;
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="OP체크" sub="2026.05.11 (월) · 마지막 갱신 12초 전"
        actions={<>
          <button><MIcon name="refresh" size={20}/></button>
          <button><MIcon name="moreV" size={20}/></button>
        </>}/>
      <div className="m-chip-bar">
        {CHIPS.map(c => (
          <button key={c.id} className={filter === c.id ? 'on' : ''} onClick={()=>setFilter(c.id)}>
            {c.label}<span className="cnt">{c.cnt}</span>
          </button>
        ))}
      </div>
      <div className="m-scroll">
        <div style={{padding:'12px 16px 16px', display:'flex', flexDirection:'column', gap:10}}>
          {filtered.map(op => {
            const inProg = op.state === '진행중';
            return (
              <div key={op.id} onClick={()=>onOpen && onOpen(op.id)} className="m-card" style={{
                padding:'14px 16px', position:'relative', overflow:'hidden',
                borderColor: inProg ? 'var(--success)' : 'var(--border)',
              }}>
                {inProg && <div style={{position:'absolute', top:0, left:0, bottom:0, width:3, background:'var(--success)'}}/>}
                <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
                  <MChip tone={op.tone || ''}>{op.state}</MChip>
                  {inProg && <span className="m-tnum" style={{fontSize:11, fontWeight:800, color:'var(--success)'}}>+{op.mins}분</span>}
                  {op.reason && <span style={{fontSize:11, color:'var(--warning)', fontWeight:700}}>· {op.reason}</span>}
                  <div style={{flex:1}}/>
                  <span style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{op.room}</span>
                </div>
                <div style={{fontSize:15, fontWeight:800, letterSpacing:'-0.015em'}}>{op.patient}<span style={{fontSize:12, color:'var(--z-500)', fontWeight:600, marginLeft:6}}>· {op.procedure}</span></div>
                <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginTop:2}}>{op.doctor} · 예정 {op.start}</div>

                {/* 인라인 액션 (상태별) */}
                <div style={{display:'flex', gap:6, marginTop:12, flexWrap:'wrap'}}>
                  {op.state === '대기' && (
                    <button style={{flex:1, height:40, borderRadius:10, background:'var(--accent)', color:'#fff', fontSize:13, fontWeight:800}}>시작</button>
                  )}
                  {op.state === '진행중' && (
                    <>
                      <button style={{flex:1, height:40, borderRadius:10, background:'var(--card)', color:'var(--z-700)', border:'1px solid var(--border)', fontSize:13, fontWeight:700}}>중단</button>
                      <button style={{flex:2, height:40, borderRadius:10, background:'var(--success)', color:'#fff', fontSize:13, fontWeight:800}}>완료</button>
                    </>
                  )}
                  {op.state === '완료' && (
                    <button style={{flex:1, height:40, borderRadius:10, background:'var(--card)', color:'var(--z-700)', border:'1px solid var(--border)', fontSize:13, fontWeight:700}}>상세</button>
                  )}
                  {op.state === '보류' && (
                    <>
                      <button style={{flex:1, height:40, borderRadius:10, background:'var(--card)', color:'var(--z-700)', border:'1px solid var(--border)', fontSize:13, fontWeight:700}}>취소</button>
                      <button style={{flex:2, height:40, borderRadius:10, background:'var(--accent)', color:'#fff', fontSize:13, fontWeight:800}}>재개</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// AD 2. OP체크 — 시술 상세 (체크리스트 + 액션)
// ═══════════════════════════════════════════════════════════════
const SOpCheckDetail = ({ onBack }) => {
  const [done, setDone] = React.useState({ '1':true, '2':true, '3':true, '5':true });
  const PREP = [
    { id:'1', t:'환자 신원 확인' },
    { id:'2', t:'시술 동의서 확인' },
    { id:'3', t:'금속 제거 / 의류 환의' },
    { id:'4', t:'IV 라인 확보' },
    { id:'5', t:'마취 설정 확인' },
    { id:'6', t:'기구 멸균 상태 확인' },
  ];
  const SUP = [
    { id:'a', t:'1회용 주사기 5cc', q:6 },
    { id:'b', t:'카테터 18Ga',     q:2 },
    { id:'c', t:'멸균거즈 4x4',    q:4 },
    { id:'d', t:'국소마취제',       q:1 },
  ];
  const STEPS = ['준비중','준비완료','수술중','완료'];
  const curStep = 2;
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="OP 상세" sub="1번방 · 박○○ · 관절경"
        actions={<button><MIcon name="moreV" size={20}/></button>}/>
      <div className="m-scroll">
        {/* 진행 단계 */}
        <div style={{padding:'14px 16px 0'}}>
          <div className="m-card" style={{padding:'14px 14px'}}>
            <div style={{display:'flex', gap:6, alignItems:'center'}}>
              {STEPS.map((s,i,arr) => (
                <React.Fragment key={s}>
                  <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:5, flex:1}}>
                    <div style={{
                      width:28, height:28, borderRadius:'50%',
                      background: i <= curStep ? 'var(--accent)' : 'var(--z-200)',
                      color: i <= curStep ? '#fff' : 'var(--z-500)',
                      display:'grid', placeItems:'center', fontSize:12, fontWeight:800,
                    }}>{i < curStep ? '✓' : (i+1)}</div>
                    <span style={{fontSize:10, fontWeight:800, color: i === curStep ? 'var(--accent)' : 'var(--z-500)'}}>{s}</span>
                  </div>
                  {i < arr.length-1 && <div style={{flex:0.4, height:2, background: i < curStep ? 'var(--accent)' : 'var(--z-200)', marginBottom:14}}/>}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* 환자 카드 */}
        <div style={{padding:'14px 16px 0'}}>
          <div className="m-card" style={{padding:'14px 14px'}}>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
              {[
                { l:'환자',    v:'박○○ (M, 54)' },
                { l:'환자번호', v:'P-2024-1208' },
                { l:'시술명',  v:'우측 무릎 관절경' },
                { l:'주치의',  v:'박철홍' },
                { l:'마취',    v:'국소' },
                { l:'시작 예정', v:'09:00' },
              ].map((r,i) => (
                <div key={i}>
                  <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{r.l}</div>
                  <div style={{fontSize:13, fontWeight:700, marginTop:2}}>{r.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 체크리스트 (2칸 그리드) */}
        <div className="m-section">
          <div className="m-section-h"><div className="lbl">수술 전 준비 (4/6)</div></div>
          <div className="m-card flush">
            {PREP.map((p,i,arr) => (
              <label key={p.id} style={{display:'grid', gridTemplateColumns:'24px 1fr', gap:10, padding:'13px 16px', borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none', alignItems:'center'}}>
                <button onClick={(e)=>{e.preventDefault(); setDone(d => ({...d, [p.id]: !d[p.id]}));}}
                  style={{width:22, height:22, borderRadius:6,
                    border: done[p.id] ? 'none' : '1.5px solid var(--z-300)',
                    background: done[p.id] ? 'var(--success)' : 'transparent',
                    color:'#fff', display:'grid', placeItems:'center'}}>
                  {done[p.id] && <MIcon name="check" size={14}/>}
                </button>
                <span style={{fontSize:14, fontWeight:600, color: done[p.id] ? 'var(--z-500)' : 'var(--z-900)', textDecoration: done[p.id] ? 'line-through' : 'none'}}>{p.t}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 소모품 */}
        <div className="m-section">
          <div className="m-section-h"><div className="lbl">예상 소모품 4종</div><span className="more">자동 출고</span></div>
          <div className="m-card flush">
            {SUP.map((s,i,arr) => (
              <div key={s.id} className="m-list-row">
                <div className="ico-tile tone-accent"><MIcon name="box" size={18}/></div>
                <div>
                  <div className="lbl">{s.t}</div>
                  <div className="sub">출고 예약</div>
                </div>
                <div className="val m-tnum">×{s.q}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{height:24}}/>
      </div>
      <div className="m-sticky-foot">
        <MBtn block>메시지</MBtn>
        <MBtn block variant="primary" icon="check">준비 완료</MBtn>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// AD 3. 퇴원심사 — 목록
// ═══════════════════════════════════════════════════════════════
const SDischarge = ({ onBack, onOpen }) => {
  const [filter, setFilter] = React.useState('mine');
  const items = [
    { id:1, p:'박○○ (M, 54)', dept:'정형외과', d:'2026.05.10 입원',  stage:'2차 심사', stageTone:'accent',  comments:3, mine:true, urgent:false },
    { id:2, p:'김○○ (F, 47)', dept:'정형외과', d:'2026.05.09 입원',  stage:'보완요청',  stageTone:'warning', comments:5, mine:true, urgent:true },
    { id:3, p:'이○○ (M, 62)', dept:'정형외과', d:'2026.05.08 입원',  stage:'1차 심사', stageTone:'',        comments:1, mine:false, urgent:false },
    { id:4, p:'최○○ (F, 38)', dept:'정형외과', d:'2026.05.07 입원',  stage:'승인 완료', stageTone:'success', comments:0, mine:false, urgent:false },
    { id:5, p:'정○○ (M, 71)', dept:'정형외과', d:'2026.05.05 입원',  stage:'반려',     stageTone:'danger',  comments:8, mine:false, urgent:false },
    { id:6, p:'홍○○ (F, 29)', dept:'정형외과', d:'2026.05.11 입원',  stage:'대기',     stageTone:'',        comments:0, mine:true, urgent:false },
  ];
  const FILTERS = [
    { id:'mine',     label:'내 차례',   cnt: items.filter(i=>i.mine).length },
    { id:'request',  label:'보완요청', cnt: items.filter(i=>i.stage==='보완요청').length },
    { id:'all',      label:'전체',     cnt: items.length },
    { id:'done',     label:'완료',     cnt: items.filter(i=>i.stage==='승인 완료').length },
  ];
  const filtered = filter === 'all' ? items : filter === 'mine' ? items.filter(i => i.mine) : filter === 'request' ? items.filter(i => i.stage === '보완요청') : items.filter(i => i.stage === '승인 완료');
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="퇴원심사" sub={`내 차례 ${items.filter(i=>i.mine).length}건`}
        actions={<button><MIcon name="search" size={20}/></button>}/>
      <div className="m-chip-bar">
        {FILTERS.map(f => (
          <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={()=>setFilter(f.id)}>
            {f.label}<span className="cnt">{f.cnt}</span>
          </button>
        ))}
      </div>
      <div className="m-scroll">
        <div style={{padding:'12px 16px 16px', display:'flex', flexDirection:'column', gap:10}}>
          {filtered.map(it => (
            <div key={it.id} onClick={()=>onOpen && onOpen(it.id)} className="m-card" style={{padding:'14px 16px', position:'relative'}}>
              {it.urgent && <div style={{position:'absolute', top:0, left:0, bottom:0, width:3, background:'var(--warning)', borderRadius:'14px 0 0 14px'}}/>}
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
                <MChip tone={it.stageTone}>{it.stage}</MChip>
                {it.mine && <MChip tone="accent">내 차례</MChip>}
                <div style={{flex:1}}/>
                <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>{it.d}</span>
              </div>
              <div style={{fontSize:14, fontWeight:800, letterSpacing:'-0.012em'}}>{it.p}</div>
              <div style={{display:'flex', alignItems:'center', gap:8, marginTop:8, fontSize:11, color:'var(--z-500)', fontWeight:600}}>
                <span>{it.dept}</span>
                <div style={{flex:1}}/>
                <button style={{display:'inline-flex', alignItems:'center', gap:4, padding:'4px 8px', background:'var(--z-100)', borderRadius:6, fontSize:11, fontWeight:700, color:'var(--z-700)'}}>
                  <MIcon name="chat" size={11}/> {it.comments}
                </button>
                <button style={{display:'inline-flex', alignItems:'center', gap:4, padding:'4px 8px', background:'var(--z-100)', borderRadius:6, fontSize:11, fontWeight:700, color:'var(--z-700)'}}>
                  <MIcon name="file" size={11}/> 기록
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// AD 4. 퇴원심사 — 상세 (탭 3개 + sticky 액션)
// ═══════════════════════════════════════════════════════════════
const SDischargeDetail = ({ onBack }) => {
  const [tab, setTab] = React.useState('summary');
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="퇴원심사" sub="박○○ (M, 54) · 정형외과"/>
      <div style={{padding:'10px 16px 0', background:'var(--card)', borderBottom:'1px solid var(--border)'}}>
        <div className="m-seg">
          <button className={tab==='summary'?'on':''}  onClick={()=>setTab('summary')}>요약</button>
          <button className={tab==='record'?'on':''}   onClick={()=>setTab('record')}>진료기록</button>
          <button className={tab==='comment'?'on':''}  onClick={()=>setTab('comment')}>코멘트 3</button>
        </div>
      </div>
      <div className="m-scroll">
        {tab === 'summary' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card" style={{padding:'14px 14px'}}>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
                {[
                  { l:'환자번호', v:'P-2024-1208' },
                  { l:'입원일',  v:'2026.05.10' },
                  { l:'퇴원 예정', v:'2026.05.13' },
                  { l:'재원일수', v:'3일' },
                  { l:'주진단',  v:'M23.2 (Right Knee)' },
                  { l:'부진단',  v:'M17.1, M25.46' },
                  { l:'수술',    v:'관절경적 반월판 절제' },
                  { l:'수술일',  v:'2026.05.10' },
                ].map((r,i) => (
                  <div key={i}>
                    <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{r.l}</div>
                    <div style={{fontSize:13, fontWeight:700, marginTop:2}}>{r.v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="m-section-h" style={{padding:'18px 0 8px'}}><div className="lbl">코딩 검토</div></div>
            <div className="m-card flush">
              {[
                { l:'주진단 코드',     v:'M23.2', s:'정상', tone:'success' },
                { l:'수술 코드',       v:'N0303', s:'정상', tone:'success' },
                { l:'마취 코드',       v:'L1212', s:'정상', tone:'success' },
                { l:'재원기간 적정성', v:'3일',   s:'정상', tone:'success' },
                { l:'심사 청구 금액',  v:'₩ 1,840,000', s:'주의', tone:'warning' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <div className={'ico-tile tone-'+(r.tone)}><MIcon name={r.tone === 'success' ? 'checkCircle' : 'alertTri'} size={18}/></div>
                  <div>
                    <div className="lbl">{r.l}</div>
                    <div className="sub m-tnum">{r.v}</div>
                  </div>
                  <MChip tone={r.tone}>{r.s}</MChip>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'record' && (
          <div style={{padding:'14px 16px 0'}}>
            <DesktopHint>풀 진료기록(EMR)은 데스크톱에서 확인 — 모바일은 요약</DesktopHint>
            <div className="m-card flush" style={{marginTop:12}}>
              {[
                { t:'입원 기록',  d:'2026.05.10 14:22', ic:'fileText' },
                { t:'수술 기록',  d:'2026.05.10 16:30', ic:'fileText' },
                { t:'마취 기록',  d:'2026.05.10 16:25', ic:'fileText' },
                { t:'영상 검사 (MRI)',  d:'2026.05.09', ic:'pie' },
                { t:'검사 결과 (CBC, BUN)', d:'2026.05.09', ic:'fileText' },
                { t:'간호 기록 D1-D3', d:'2026.05.10-12', ic:'fileText' },
                { t:'처방전',     d:'2026.05.10', ic:'fileText' },
              ].map((r,i,arr) => (
                <MListRow key={i} icon={r.ic} iconTone="" label={r.t} sub={r.d}/>
              ))}
            </div>
          </div>
        )}
        {tab === 'comment' && (
          <div style={{padding:'14px 16px 0'}}>
            {[
              { who:'백정민', tone:'blue',  ts:'5/12 11:08', body:'마취 코드 L1212 적용 확인했습니다.' },
              { who:'이재훈', tone:'cyan',  ts:'5/12 14:22', body:'재원 3일은 적정 — 동일 시술 평균 2.8일.' },
              { who:'박철홍', tone:'violet',ts:'5/12 17:30', body:'심사 청구 금액 확인 후 최종 결재 진행 부탁드립니다.' },
            ].map((c, i) => (
              <div key={i} style={{display:'flex', gap:10, marginBottom:14}}>
                <MAvatar tone={c.tone} size="sm">{c.who.charAt(0)}</MAvatar>
                <div style={{flex:1}}>
                  <div style={{display:'flex', alignItems:'baseline', gap:6}}>
                    <b style={{fontSize:12, fontWeight:800}}>{c.who}</b>
                    <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>{c.ts}</span>
                  </div>
                  <div style={{fontSize:13, color:'var(--z-800)', marginTop:3, lineHeight:1.55}}>{c.body}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="m-sticky-foot">
        <MBtn block>보완요청</MBtn>
        <MBtn block variant="danger">반려</MBtn>
        <MBtn block variant="primary">승인</MBtn>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// AD 5. MRI 일정
// ═══════════════════════════════════════════════════════════════
const SMri = ({ onBack }) => {
  const [tab, setTab] = React.useState('today');
  const today = [
    { t:'08:00', p:'박○○ (M, 54)', kind:'무릎 MRI', dept:'정형', state:'완료',  tone:'success' },
    { t:'09:00', p:'김○○ (F, 47)', kind:'척추 MRI', dept:'정형', state:'촬영중', tone:'accent', live:true },
    { t:'10:00', p:'이○○ (M, 62)', kind:'어깨 MRI', dept:'정형', state:'대기',  tone:'' },
    { t:'10:30', p:'정○○ (F, 71)', kind:'무릎 MRI', dept:'정형', state:'대기',  tone:'' },
    { t:'11:00', p:'홍○○ (F, 29)', kind:'척추 MRI', dept:'정형', state:'대기',  tone:'' },
    { t:'13:00', p:'서○○ (M, 55)', kind:'무릎 MRI', dept:'정형', state:'대기',  tone:'' },
    { t:'14:00', p:'최○○ (F, 38)', kind:'어깨 MRI', dept:'정형', state:'판독 대기', tone:'warning' },
  ];
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="MRI 일정" sub="2026.05.11 (월) · 1.5T MRI" actions={<>
        <button><MIcon name="calendar" size={20}/></button>
        <button><MIcon name="plus" size={20}/></button>
      </>}/>
      <div style={{padding:'10px 16px 0', background:'var(--card)', borderBottom:'1px solid var(--border)'}}>
        <div className="m-seg">
          <button className={tab==='today'?'on':''}    onClick={()=>setTab('today')}>오늘 7</button>
          <button className={tab==='week'?'on':''}     onClick={()=>setTab('week')}>이번주</button>
          <button className={tab==='read'?'on':''}     onClick={()=>setTab('read')}>판독 대기 3</button>
        </div>
      </div>
      <div className="m-scroll">
        {tab === 'today' && (
          <div style={{padding:'14px 16px 0'}}>
            {/* hero */}
            <div className="m-card" style={{padding:'14px 14px', marginBottom:12, background:'var(--accent)', borderColor:'transparent', color:'#fff'}}>
              <div style={{fontSize:11, opacity:0.85, fontWeight:800, letterSpacing:'0.04em'}}>현재 촬영중</div>
              <div style={{fontSize:18, fontWeight:800, marginTop:4}}>김○○ (F, 47) · 척추 MRI</div>
              <div style={{display:'flex', alignItems:'center', gap:8, marginTop:8, fontSize:12, opacity:0.85, fontWeight:600}}>
                <span style={{width:6, height:6, borderRadius:999, background:'#fff', animation:'none'}}/>
                09:00 시작 · 진행 18분 / 25분 예상
              </div>
            </div>
            <div className="m-card flush">
              {today.map((m,i,arr) => (
                <div key={i} style={{padding:'14px 16px', borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none', display:'grid', gridTemplateColumns:'52px 1fr auto', gap:12, alignItems:'center'}}>
                  <div className="m-tnum" style={{fontSize:14, fontWeight:800, color: m.live ? 'var(--accent)' : 'var(--z-700)'}}>{m.t}</div>
                  <div>
                    <div style={{fontSize:14, fontWeight:800}}>{m.p}</div>
                    <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginTop:1}}>{m.kind} · {m.dept}</div>
                  </div>
                  <MChip tone={m.tone || ''}>{m.state}</MChip>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'week' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { d:'월 5/11', cnt:7, dot:'accent' },
                { d:'화 5/12', cnt:6, dot:'accent' },
                { d:'수 5/13', cnt:8, dot:'accent' },
                { d:'목 5/14', cnt:0, dot:'' },
                { d:'금 5/15', cnt:5, dot:'accent' },
                { d:'토 5/16', cnt:3, dot:'success' },
                { d:'일 5/17', cnt:0, dot:'' },
              ].map((r,i,arr) => (
                <MListRow key={i} icon="calendar" iconTone={r.dot || ''} label={r.d} sub={r.cnt > 0 ? `예약 ${r.cnt}건` : '예약 없음'} val={r.cnt > 0 ? r.cnt : '—'}/>
              ))}
            </div>
          </div>
        )}
        {tab === 'read' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { p:'최○○ (F, 38)', kind:'어깨 MRI', t:'5/11 09:30 완료', dr:'박철홍' },
                { p:'한○○ (M, 60)', kind:'척추 MRI', t:'5/10 14:22 완료', dr:'박철홍' },
                { p:'송○○ (F, 45)', kind:'무릎 MRI', t:'5/10 11:18 완료', dr:'박철홍' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <div className="ico-tile tone-warning"><MIcon name="pie" size={18}/></div>
                  <div>
                    <div className="lbl">{r.p}</div>
                    <div className="sub">{r.kind} · {r.t}</div>
                  </div>
                  <MBtn size="sm" variant="primary">판독</MBtn>
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
// AD 6. 업무공유 — 목록 (마스터)
// ═══════════════════════════════════════════════════════════════
const SShare = ({ onBack, onOpen }) => {
  const [tab, setTab] = React.useState('handoff');
  const items = [
    { id:1, t:'5/13(수) 오전 진료 인수인계',     who:'박유진', dept:'경영지원',   ts:'14:22', tag:'인수인계', tone:'accent', body:'박원장 학회 참석 — 외래 전담 안내 부탁드려요.', att:2, c:3, urgent:true },
    { id:2, t:'영상의학팀 5월 일정 공유',       who:'김상민', dept:'영상의학',   ts:'어제',  tag:'자료',     tone:'',       body:'MRI/CT 슬롯 정리해서 올렸습니다.',  att:1, c:1 },
    { id:3, t:'5월 학회 참석자 모집',          who:'이재훈', dept:'경영지원',   ts:'어제',  tag:'할일',     tone:'warning',body:'5/24 정형외과 학회 — 참석 가능자 신청 부탁',  att:0, c:8 },
    { id:4, t:'환자 동의서 양식 v2.1 업데이트', who:'홍자비', dept:'경영지원',   ts:'5/8',   tag:'자료',     tone:'',       body:'개정사항 정리하여 첨부합니다.', att:3, c:2 },
    { id:5, t:'간호부 야간 당직 매뉴얼',        who:'정해영', dept:'간호부',     ts:'5/7',   tag:'인수인계', tone:'accent', body:'당직 시 환자별 대응 절차 정리',         att:1, c:5 },
  ];
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="업무공유" sub="박철홍정형외과" actions={<>
        <button><MIcon name="search" size={20}/></button>
        <button><MIcon name="filter" size={20}/></button>
      </>}/>
      <div className="m-chip-bar">
        <button className={tab==='all'?'on':''}      onClick={()=>setTab('all')}>전체<span className="cnt">{items.length}</span></button>
        <button className={tab==='handoff'?'on':''}  onClick={()=>setTab('handoff')}>인수인계<span className="cnt">2</span></button>
        <button className={tab==='todo'?'on':''}     onClick={()=>setTab('todo')}>할일<span className="cnt">1</span></button>
        <button className={tab==='asset'?'on':''}    onClick={()=>setTab('asset')}>자료<span className="cnt">2</span></button>
      </div>
      <div className="m-scroll">
        <div style={{padding:'12px 16px 16px', display:'flex', flexDirection:'column', gap:10}}>
          {items.map(p => (
            <div key={p.id} onClick={()=>onOpen && onOpen(p.id)} className="m-card" style={{padding:'14px 16px'}}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
                <MChip tone={p.tone}>{p.tag}</MChip>
                {p.urgent && <MChip tone="danger">긴급</MChip>}
                <div style={{flex:1}}/>
                <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>{p.ts}</span>
              </div>
              <div style={{fontSize:14, fontWeight:800, letterSpacing:'-0.012em'}}>{p.t}</div>
              <div style={{fontSize:12, color:'var(--z-600)', marginTop:4, lineHeight:1.5,
                display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden'
              }}>{p.body}</div>
              <div style={{display:'flex', alignItems:'center', gap:8, marginTop:8, fontSize:11, color:'var(--z-500)', fontWeight:600}}>
                <MAvatar tone={['blue','pink','violet','cyan','green'][p.id%5]} size="sm" style={{width:22, height:22}}>
                  {p.who.charAt(0)}
                </MAvatar>
                <b style={{color:'var(--z-700)'}}>{p.who}</b>
                <span style={{color:'var(--z-400)'}}>·</span>
                <span>{p.dept}</span>
                <div style={{flex:1}}/>
                {p.att > 0 && <span style={{display:'inline-flex', alignItems:'center', gap:3}}><MIcon name="paperclip" size={11}/>{p.att}</span>}
                {p.c > 0 && <span style={{display:'inline-flex', alignItems:'center', gap:3, color: p.c > 5 ? 'var(--accent)' : 'var(--z-500)'}}><MIcon name="chat" size={11}/>{p.c}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* FAB */}
      <button style={{
        position:'absolute', right:16, bottom:88,
        width:56, height:56, borderRadius:'50%',
        background:'var(--accent)', color:'#fff',
        display:'grid', placeItems:'center', border:0,
        boxShadow:'0 8px 24px rgba(37,99,235,0.35), 0 0 0 1px rgba(37,99,235,0.5)',
      }}>
        <MIcon name="plus" size={26}/>
      </button>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// AD 7. 업무공유 — 상세
// ═══════════════════════════════════════════════════════════════
const SShareDetail = ({ onBack }) => (
  <div className="m-screen">
    <MHeader back={onBack} title="업무공유" sub="인수인계 · 박유진" actions={<>
      <button><MIcon name="bookmark" size={20}/></button>
      <button><MIcon name="share" size={20}/></button>
      <button><MIcon name="moreV" size={20}/></button>
    </>}/>
    <div className="m-scroll">
      <div style={{padding:'14px 16px 0'}}>
        <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:10}}>
          <MChip tone="accent">인수인계</MChip>
          <MChip tone="danger">긴급</MChip>
        </div>
        <h1 style={{fontSize:19, fontWeight:800, letterSpacing:'-0.025em', lineHeight:1.35}}>
          5/13(수) 오전 진료 인수인계
        </h1>
        <div style={{display:'flex', alignItems:'center', gap:8, marginTop:14, paddingBottom:14, borderBottom:'1px solid var(--border)'}}>
          <MAvatar tone="pink" size="sm">박</MAvatar>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:13, fontWeight:800}}>박유진</div>
            <div style={{fontSize:11, color:'var(--z-500)', marginTop:1}}>경영지원팀 대리 · 5/11 14:22</div>
          </div>
          <MChip tone="accent">2명 확인</MChip>
        </div>

        <div style={{padding:'16px 0', fontSize:14, color:'var(--z-700)', lineHeight:1.75, fontWeight:500}}>
          <p>박철홍 원장님 5/13 오전 학회 참석으로 외래 비우십니다. 다음 사항 인계드립니다.</p>
          <ul style={{marginTop:12, paddingLeft:18, display:'flex', flexDirection:'column', gap:6}}>
            <li>9:00~12:00 외래 — 김지오 PA가 1차 대응</li>
            <li>응급 처치 환자는 박원장님 폰으로 직접 컨택</li>
            <li>접수 카운트는 평소 대비 60%로 제한</li>
          </ul>
        </div>

        {/* 첨부 */}
        <div className="m-card flush" style={{marginBottom:16}}>
          {[
            { n:'5월_외래일정.xlsx',     s:'XLSX · 24KB',  ic:'fileText' },
            { n:'IMG_5/13_접수카운터.jpg', s:'JPG · 1.2MB',  ic:'image' },
          ].map((a,i,arr) => (
            <div key={i} style={{padding:'12px 14px', display:'flex', alignItems:'center', gap:10, borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none'}}>
              <div className="ico-tile tone-accent"><MIcon name={a.ic} size={18}/></div>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:13, fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{a.n}</div>
                <div style={{fontSize:11, color:'var(--z-500)', marginTop:1}}>{a.s}</div>
              </div>
              <MIcon name="download" size={18} color="var(--z-500)"/>
            </div>
          ))}
        </div>

        <div className="m-section-h" style={{marginBottom:10}}><div className="lbl">댓글 3</div></div>
        {[
          { who:'이현우', tone:'orange', ts:'5/11 14:32', body:'확인했습니다. 9시 정확히 카운터 셋업할게요.' },
          { who:'김지오', tone:'cyan',   ts:'5/11 14:48', body:'네 알겠습니다 👍 응급 키트 위치 다시 한번 알려주실 수 있을까요?' },
          { who:'박유진', tone:'pink',   ts:'5/11 15:01', body:'@김지오 외래 2번 진료실 캐비넷 두번째 칸에 있어요.' },
        ].map((c, i) => (
          <div key={i} style={{display:'flex', gap:10, marginBottom:14}}>
            <MAvatar tone={c.tone} size="sm">{c.who.charAt(0)}</MAvatar>
            <div style={{flex:1}}>
              <div style={{display:'flex', alignItems:'baseline', gap:6}}>
                <b style={{fontSize:12, fontWeight:800}}>{c.who}</b>
                <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>{c.ts}</span>
              </div>
              <div style={{fontSize:13, color:'var(--z-800)', marginTop:3, lineHeight:1.55}}>{c.body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
    <div className="m-sticky-foot">
      <div style={{flex:1, display:'flex', alignItems:'center', gap:6, background:'var(--bg)', borderRadius:22, padding:'4px 6px 4px 12px'}}>
        <input placeholder="댓글 입력 (@멘션 가능)" style={{flex:1, padding:'8px 0', fontSize:14, fontFamily:'inherit'}}/>
        <button style={{width:32, height:32, borderRadius:'50%', background:'var(--accent)', color:'#fff', display:'grid', placeItems:'center'}}><MIcon name="send" size={14}/></button>
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// AD 8. 업무가이드
// ═══════════════════════════════════════════════════════════════
const SGuide = ({ onBack }) => {
  const [cat, setCat] = React.useState('all');
  const cats = [
    { id:'all',      label:'전체',   cnt: 23 },
    { id:'op',       label:'수술',   cnt: 6 },
    { id:'reception',label:'접수',   cnt: 4 },
    { id:'nursing',  label:'간호',   cnt: 5 },
    { id:'admin',    label:'행정',   cnt: 5 },
    { id:'emergency',label:'응급',   cnt: 3 },
  ];
  const guides = [
    { t:'환자 응급 대응 매뉴얼',         cat:'emergency', ic:'alertTri', tone:'danger',  ts:'5/3 갱신',  v:248, hot:true },
    { t:'관절경 수술 전 준비 체크리스트', cat:'op',       ic:'checkCircle', tone:'success', ts:'4/22 갱신', v:182 },
    { t:'외래 접수 절차 (신환·재진)',     cat:'reception',ic:'users',    tone:'accent',  ts:'4/20 갱신', v:312 },
    { t:'마취 동의서 작성 가이드',       cat:'op',       ic:'fileText',  tone:'',        ts:'4/15 갱신', v:98 },
    { t:'야간 당직 인수인계 절차',       cat:'nursing',  ic:'clock',     tone:'',        ts:'4/12 갱신', v:140 },
    { t:'법인카드 사용 결의 작성법',     cat:'admin',    ic:'won',       tone:'',        ts:'3/30 갱신', v:78 },
    { t:'환자 동의서 v2.1 변경사항',     cat:'op',       ic:'fileText',  tone:'',        ts:'5/8 갱신',  v:62 },
    { t:'심정지(CPR) 대응 절차',         cat:'emergency',ic:'alertTri',  tone:'danger',  ts:'1/15 갱신', v:412, hot:true },
  ];
  const filtered = cat === 'all' ? guides : guides.filter(g => g.cat === cat);
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="업무가이드" sub="박철홍정형외과 · 23개 문서" actions={<>
        <button><MIcon name="search" size={20}/></button>
        <button><MIcon name="bookmark" size={20}/></button>
      </>}/>
      <div className="m-chip-bar">
        {cats.map(c => (
          <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={()=>setCat(c.id)}>
            {c.label}<span className="cnt">{c.cnt}</span>
          </button>
        ))}
      </div>
      <div className="m-scroll">
        {cat === 'all' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-section-h"><div className="lbl">자주 찾는</div></div>
            <div className="m-card" style={{padding:'14px 14px', background:'linear-gradient(135deg, var(--accent), #1D4ED8)', borderColor:'transparent', color:'#fff'}}>
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                <MIcon name="alertTri" size={20}/>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:13, fontWeight:800, lineHeight:1.4}}>환자 응급 대응 매뉴얼</div>
                  <div style={{fontSize:11, opacity:0.85, fontWeight:600, marginTop:2}}>248 조회 · 5/3 갱신</div>
                </div>
                <MIcon name="chevR" size={20}/>
              </div>
            </div>
          </div>
        )}
        <div className="m-section">
          <div className="m-section-h"><div className="lbl">{cat === 'all' ? '전체 문서' : cats.find(c=>c.id===cat)?.label} {filtered.length}</div></div>
          <div className="m-card flush">
            {filtered.map((g,i,arr) => (
              <div key={i} className="m-list-row">
                <div className={'ico-tile tone-' + (g.tone || '')}><MIcon name={g.ic} size={18}/></div>
                <div>
                  <div className="lbl" style={{display:'flex', alignItems:'center', gap:6}}>
                    {g.t}
                    {g.hot && <MChip tone="danger">HOT</MChip>}
                  </div>
                  <div className="sub">{g.ts} · 조회 {g.v}</div>
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
};

Object.assign(window, { SOpCheck, SOpCheckDetail, SDischarge, SDischargeDetail, SMri, SShare, SShareDetail, SGuide });
