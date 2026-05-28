// MSO 모바일 — Screens (2) : 결재(목록/상세), 급여명세서, 재고현황, 경영대시보드, 추가기능 허브, More

const SApproval = ({ onOpen, onNav }) => {
  const [tab, setTab] = React.useState('inbox');
  const items = [
    { id:1, kind:'inbox',     urgent:true,  tone:'warning', t:'야간근무 신청',          who:'박유진', dept:'경영지원팀', ts:'14:22', amt:null,        days:1, status:'대기' },
    { id:2, kind:'inbox',     urgent:false, tone:'',        t:'법인카드 사용 결의서',      who:'홍자비', dept:'경영지원팀', ts:'13:01', amt:'320,000', days:0, status:'대기' },
    { id:3, kind:'inbox',     urgent:true,  tone:'danger',  t:'연차 사용 신청 (5/15-17)', who:'김상민', dept:'영상의학팀', ts:'어제',   amt:null,       days:3, status:'24h 초과' },
    { id:4, kind:'inbox',     urgent:false, tone:'',        t:'4월 야근수당 신청',         who:'이현우', dept:'경영지원팀', ts:'5/9',   amt:'412,000', days:0, status:'대기' },
    { id:5, kind:'progress',  urgent:false, tone:'accent',  t:'5월 비품 신청',            who:'나',    dept:'경영지원팀', ts:'5/10',  amt:'175,000', days:0, status:'1/2 결재중' },
    { id:6, kind:'done',      urgent:false, tone:'success', t:'4월 영상장비 점검 보고',     who:'나',    dept:'경영지원팀', ts:'5/7',   amt:null,       days:0, status:'승인' },
    { id:7, kind:'done',      urgent:false, tone:'danger',  t:'외부 강의 신청',           who:'나',    dept:'경영지원팀', ts:'5/3',   amt:null,       days:0, status:'반려' },
  ];
  const filtered = items.filter(i => i.kind === tab);
  return (
    <div className="m-screen">
      <MHeader title="전자결재" sub="내 결재 대기 4건" actions={<>
        <button><MIcon name="search" size={20}/></button>
        <button onClick={()=>onNav && onNav('approval-write')}><MIcon name="edit" size={20}/></button>
      </>}/>
      {/* 5개 뷰 (PC 동일): 결재함·기안함·참조·작성·양식 */}
      <div className="m-chip-bar">
        <button className={tab==='inbox'?'on':''} onClick={()=>setTab('inbox')}>결재함<span className="cnt">4</span></button>
        <button onClick={()=>onNav && onNav('approval-sent')}>기안함<span className="cnt">5</span></button>
        <button onClick={()=>onNav && onNav('approval-ref')}>참조 문서함<span className="cnt">2</span></button>
        <button onClick={()=>onNav && onNav('approval-write')}>작성하기</button>
        <button onClick={()=>onNav && onNav('admin-forms')}>양식 관리 14</button>
      </div>
      <div style={{padding:'10px 16px 6px', background:'var(--card)', borderBottom:'1px solid var(--border)'}}>
        <div className="m-seg">
          <button className={tab==='inbox'?'on':''} onClick={()=>setTab('inbox')}>받은 결재 4</button>
          <button className={tab==='progress'?'on':''} onClick={()=>setTab('progress')}>진행 1</button>
          <button className={tab==='done'?'on':''} onClick={()=>setTab('done')}>완료 2</button>
        </div>
      </div>
      <div className="m-scroll">
        {tab === 'inbox' && (
          <div style={{padding:'12px 16px 0'}}>
            <div style={{
              display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12,
            }}>
              {[
                { l:'대기',     v:4, t:'accent' },
                { l:'24h 초과', v:1, t:'danger' },
              ].map((k,i) => (
                <div key={i} className="m-card" style={{padding:'12px 14px'}}>
                  <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{k.l}</div>
                  <div style={{fontSize:24, fontWeight:800, letterSpacing:'-0.025em', marginTop:4, color: k.t === 'danger' ? 'var(--danger)' : 'var(--accent)'}} className="m-tnum">{k.v}<span style={{fontSize:11, color:'var(--z-500)', fontWeight:700, marginLeft:3}}>건</span></div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{padding:'0 16px 16px', display:'flex', flexDirection:'column', gap:10}}>
          {filtered.map(p => (
            <div key={p.id} onClick={()=>onOpen(p.id)} className="m-card" style={{padding:'14px 16px', position:'relative'}}>
              {p.urgent && <div style={{position:'absolute', top:0, left:0, bottom:0, width:3, borderRadius:'14px 0 0 14px', background: p.tone === 'danger' ? 'var(--danger)' : 'var(--warning)'}}/>}
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
                <MChip tone={p.tone === 'success' ? 'success' : p.tone === 'danger' ? 'danger' : p.tone === 'accent' ? 'accent' : p.tone === 'warning' ? 'warning' : ''}>{p.status}</MChip>
                {p.days > 0 && p.kind === 'inbox' && <MChip tone={p.days >= 2 ? 'danger' : 'warning'}>+{p.days}일</MChip>}
                <div style={{flex:1}}/>
                <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>{p.ts}</span>
              </div>
              <div style={{fontSize:14, fontWeight:800, letterSpacing:'-0.015em', lineHeight:1.4}}>{p.t}</div>
              <div style={{display:'flex', alignItems:'center', gap:8, marginTop:10}}>
                <MAvatar tone={['blue','pink','violet','orange','cyan'][p.id%5]} size="sm">{p.who.charAt(0)}</MAvatar>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:12, fontWeight:700}}>{p.who}</div>
                  <div style={{fontSize:11, color:'var(--z-500)'}}>{p.dept}</div>
                </div>
                {p.amt && (
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:10, color:'var(--z-500)', fontWeight:700}}>금액</div>
                    <div style={{fontSize:14, fontWeight:800, color:'var(--z-900)'}} className="m-tnum">₩ {p.amt}</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 8. 전자결재 — 상세 (탭 3개 + sticky 결재 액션)
// ═══════════════════════════════════════════════════════════════
const SApprovalDetail = ({ onBack }) => {
  const [tab, setTab] = React.useState('form');
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="결재 상세" sub="법인카드 사용 결의서"
        actions={<button><MIcon name="moreV" size={20}/></button>}/>
      <div style={{padding:'10px 16px 0', background:'var(--card)', borderBottom:'1px solid var(--border)'}}>
        <div className="m-seg">
          <button className={tab==='form'?'on':''}    onClick={()=>setTab('form')}>양식</button>
          <button className={tab==='line'?'on':''}    onClick={()=>setTab('line')}>결재선</button>
          <button className={tab==='comment'?'on':''} onClick={()=>setTab('comment')}>코멘트 2</button>
        </div>
      </div>

      <div className="m-scroll">
        {tab === 'form' && (
          <div style={{padding:'14px 16px 0'}}>
            {/* 양식 카드 */}
            <div className="m-card" style={{padding:'16px 18px'}}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:10}}>
                <MChip tone="accent">법인카드</MChip>
                <MChip>일반</MChip>
                <div style={{flex:1}}/>
                <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>문서번호 2026-05-0042</span>
              </div>
              <h1 style={{fontSize:18, fontWeight:800, letterSpacing:'-0.022em', lineHeight:1.35}}>법인카드 사용 결의서</h1>
              <div style={{marginTop:14, display:'flex', flexDirection:'column', gap:0}}>
                {[
                  { l:'사용일',       v:'2026.05.11 (월) 12:30' },
                  { l:'사용처',       v:'한솔 정형 학회 세미나' },
                  { l:'카드',         v:'법인 BC카드 ****-9821' },
                  { l:'금액',         v:'₩ 320,000', big:true },
                  { l:'사용목적',     v:'5월 정형외과학회 신경차단술 세션 참가비' },
                  { l:'영수증',       v:<span style={{display:'inline-flex', alignItems:'center', gap:5, color:'var(--accent)', fontWeight:700}}><MIcon name="paperclip" size={13}/>seminar_320k.jpg</span> },
                ].map((r,i) => (
                  <div key={i} style={{display:'grid', gridTemplateColumns:'88px 1fr', gap:12, padding:'10px 0', borderBottom: i < 5 ? '1px solid var(--border)' : 'none'}}>
                    <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{r.l}</div>
                    <div style={{fontSize: r.big ? 16 : 13, fontWeight: r.big ? 800 : 600, color:'var(--z-900)', letterSpacing: r.big ? '-0.02em' : 0}} className={r.big ? 'm-tnum' : ''}>{r.v}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="m-card" style={{marginTop:12, padding:'12px 14px', display:'flex', gap:10, alignItems:'center', background:'var(--warning-soft)', border:'1px solid transparent'}}>
              <MIcon name="alertTri" size={18} color="var(--warning)"/>
              <div style={{fontSize:12, fontWeight:600, color:'var(--warning)'}}>
                예산 잔액 ₩ 1,240,000 / 사용 후 ₩ 920,000 (학회비 예산)
              </div>
            </div>
          </div>
        )}

        {tab === 'line' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card" style={{padding:0}}>
              {[
                { who:'홍자비', dept:'경영지원팀 / 사원', step:'기안',   tone:'accent',  state:'완료', ts:'5/11 13:01' },
                { who:'백정민', dept:'경영지원팀 / 이사', step:'1차 검토', tone:'accent',  state:'대기 (나)', ts:'-' },
                { who:'박철홍', dept:'원장',             step:'최종 결재', tone:'',        state:'대기',     ts:'-' },
              ].map((l, i, arr) => (
                <div key={i} style={{display:'grid', gridTemplateColumns:'48px 1fr auto', gap:12, padding:'14px 16px', borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none', position:'relative'}}>
                  <div style={{position:'relative'}}>
                    <MAvatar tone={['blue','pink','violet'][i]} size="sm">{l.who.charAt(0)}</MAvatar>
                    {i < arr.length-1 && <div style={{position:'absolute', left:'50%', top:32, bottom:-14, width:1, background:'var(--border)', transform:'translateX(-50%)'}}/>}
                  </div>
                  <div>
                    <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{l.step}</div>
                    <div style={{fontSize:14, fontWeight:800, marginTop:1}}>{l.who}</div>
                    <div style={{fontSize:11, color:'var(--z-500)', marginTop:1}}>{l.dept}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <MChip tone={l.tone === 'accent' ? 'accent' : (l.state.includes('나') ? 'warning' : '')}>{l.state}</MChip>
                    <div style={{fontSize:10, color:'var(--z-500)', fontWeight:600, marginTop:4}}>{l.ts}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'comment' && (
          <div style={{padding:'14px 16px 0'}}>
            {[
              { who:'홍자비', tone:'violet', ts:'5/11 13:01', body:'세미나 참가비 영수증 첨부했습니다. 검토 부탁드립니다.' },
              { who:'백정민', tone:'blue',   ts:'5/11 13:42', body:'@홍자비 세미나 참가 사진도 같이 올려주세요.' },
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

      {/* sticky action */}
      <div className="m-sticky-foot">
        <MBtn block>보완요청</MBtn>
        <MBtn block variant="danger">반려</MBtn>
        <MBtn block variant="primary">승인</MBtn>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 9. 인사관리 — 급여명세서 (모바일은 이것만 노출)
// ═══════════════════════════════════════════════════════════════
const SPayroll = ({ onBack }) => (
  <div className="m-screen">
    <MHeader back={onBack} title="급여명세서" sub="박철홍정형외과 · 2026.05"
      actions={<button><MIcon name="download" size={20}/></button>}/>
    <div className="m-scroll">
      {/* 월 선택 */}
      <div style={{padding:'12px 16px 0'}}>
        <div className="m-card" style={{padding:'10px 14px', display:'flex', alignItems:'center', gap:6}}>
          <button style={{width:32, height:32, display:'grid', placeItems:'center', color:'var(--z-600)'}}><MIcon name="chevL" size={18}/></button>
          <div style={{flex:1, textAlign:'center'}}>
            <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>지급일 2026.05.25</div>
            <div style={{fontSize:15, fontWeight:800, letterSpacing:'-0.02em', marginTop:1}} className="m-tnum">2026년 5월</div>
          </div>
          <button style={{width:32, height:32, display:'grid', placeItems:'center', color:'var(--z-600)'}}><MIcon name="chevR" size={18}/></button>
        </div>
      </div>

      {/* hero - 실수령액 */}
      <div style={{padding:'16px 16px 0', textAlign:'center'}}>
        <div style={{fontSize:11, color:'var(--z-500)', fontWeight:800, letterSpacing:'0.04em'}}>실수령액 (예상)</div>
        <div style={{fontSize:38, fontWeight:800, letterSpacing:'-0.035em', color:'var(--accent)', marginTop:4}} className="m-tnum">
          ₩ 3,245,180
        </div>
        <div style={{fontSize:12, color:'var(--z-500)', fontWeight:600, marginTop:4}}>
          지급 ₩ 3,920,000 − 공제 ₩ 674,820
        </div>
      </div>

      {/* 지급 항목 */}
      <div className="m-section">
        <div className="m-section-h"><div className="lbl">지급 항목</div></div>
        <div className="m-card flush">
          {[
            { l:'기본급',     v:'3,500,000' },
            { l:'직책수당',   v:'150,000' },
            { l:'식대',       v:'200,000', meta:'비과세' },
            { l:'야근수당',   v:'70,000',  meta:'4월 야근 2회' },
          ].map((r,i,arr) => (
            <div key={i} className="m-list-row" style={{gridTemplateColumns:'1fr auto', padding:'13px 16px'}}>
              <div>
                <div className="lbl">{r.l}</div>
                {r.meta && <div className="sub">{r.meta}</div>}
              </div>
              <div className="val m-tnum">{r.v}<span className="u">원</span></div>
            </div>
          ))}
        </div>
        <div style={{display:'flex', justifyContent:'flex-end', padding:'10px 16px 0', fontSize:13, fontWeight:800, color:'var(--z-700)'}}>
          소계 <span className="m-tnum" style={{marginLeft:6, color:'var(--z-900)'}}>3,920,000원</span>
        </div>
      </div>

      {/* 공제 항목 */}
      <div className="m-section">
        <div className="m-section-h"><div className="lbl">공제 항목</div></div>
        <div className="m-card flush">
          {[
            { l:'국민연금',     v:'176,400' },
            { l:'건강보험',     v:'138,910', meta:'장기요양 포함' },
            { l:'고용보험',     v:'35,280' },
            { l:'소득세',       v:'292,310', meta:'간이세액 100%' },
            { l:'주민세',       v:'29,230' },
            { l:'식대공제',     v:'2,690',  meta:'식수 8회' },
          ].map((r,i,arr) => (
            <div key={i} className="m-list-row" style={{gridTemplateColumns:'1fr auto', padding:'13px 16px'}}>
              <div>
                <div className="lbl">{r.l}</div>
                {r.meta && <div className="sub">{r.meta}</div>}
              </div>
              <div className="val m-tnum" style={{color:'var(--danger)'}}>−{r.v}<span className="u">원</span></div>
            </div>
          ))}
        </div>
        <div style={{display:'flex', justifyContent:'flex-end', padding:'10px 16px 0', fontSize:13, fontWeight:800, color:'var(--z-700)'}}>
          공제 합계 <span className="m-tnum" style={{marginLeft:6, color:'var(--danger)'}}>674,820원</span>
        </div>
      </div>

      <div style={{height:24}}/>
    </div>
    <div className="m-sticky-foot">
      <MBtn block icon="download">PDF 다운로드</MBtn>
      <MBtn block icon="share" variant="primary">공유</MBtn>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// 10. 재고관리 — 재고 현황
// ═══════════════════════════════════════════════════════════════
const SStock = ({ onBack, onOpen }) => {
  const [cat, setCat] = React.useState('all');
  const items = [
    { id:1, n:'1회용 주사기 5cc', cat:'medical', tone:'danger',  stock:23,  min:100, unit:'개', status:'부족', ts:'2시간 전 입고' },
    { id:2, n:'카테터 18Ga',     cat:'medical', tone:'warning', stock:48,  min:50,  unit:'개', status:'주의', ts:'어제 출고 4' },
    { id:3, n:'멸균거즈 4x4',     cat:'medical', tone:'',        stock:212, min:150, unit:'팩', status:'정상', ts:'5/8 입고 100' },
    { id:4, n:'알코올스왑',       cat:'medical', tone:'',        stock:480, min:300, unit:'개', status:'정상', ts:'5/3 입고 500' },
    { id:5, n:'영상필름 A4',     cat:'office',  tone:'warning', stock:18,  min:30,  unit:'장', status:'주의', ts:'-' },
    { id:6, n:'프린터 토너 CL-1', cat:'office',  tone:'',        stock:7,   min:3,   unit:'EA', status:'정상', ts:'5/2 입고 5' },
  ];
  const CATS = [
    { id:'all',     label:'전체',     cnt: 6 },
    { id:'shortage',label:'부족',     cnt: 1 },
    { id:'warn',    label:'주의',     cnt: 2 },
    { id:'medical', label:'의료소모품', cnt: 4 },
    { id:'office',  label:'사무',     cnt: 2 },
  ];
  let filtered = items;
  if (cat === 'shortage') filtered = items.filter(i => i.tone === 'danger');
  else if (cat === 'warn') filtered = items.filter(i => i.tone === 'warning');
  else if (cat === 'medical' || cat === 'office') filtered = items.filter(i => i.cat === cat);
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="재고현황" sub="박철홍정형외과 · 192개 품목" actions={<>
        <button><MIcon name="search" size={20}/></button>
        <button><MIcon name="qr" size={20}/></button>
      </>}/>
      <div className="m-chip-bar">
        {CATS.map(c => (
          <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={()=>setCat(c.id)}>
            {c.label}<span className="cnt">{c.cnt}</span>
          </button>
        ))}
      </div>

      {/* 알람 카드 */}
      <div style={{padding:'12px 16px 0'}}>
        <div className="m-card" style={{padding:'14px 16px', borderColor:'transparent', background:'var(--danger-soft)'}}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <div style={{width:36, height:36, borderRadius:10, background:'var(--danger)', color:'#fff', display:'grid', placeItems:'center'}}>
              <MIcon name="alertTri" size={18}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:13, fontWeight:800, color:'var(--danger)'}}>부족 품목 1개 · 자동 발주 권장</div>
              <div style={{fontSize:11, color:'var(--z-600)', fontWeight:600, marginTop:1}}>1회용 주사기 5cc — 안전재고 미달</div>
            </div>
            <MIcon name="chevR" size={18} color="var(--danger)"/>
          </div>
        </div>
      </div>

      <div className="m-scroll">
        <div style={{padding:'12px 16px 16px'}}>
          <div className="m-card flush">
            {filtered.map((it, i, arr) => {
              const pct = Math.min((it.stock / Math.max(it.min, 1)) * 100, 200);
              return (
                <div key={it.id} style={{padding:'14px 16px', borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none'}}>
                  <div style={{display:'flex', alignItems:'center', gap:8}}>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{display:'flex', alignItems:'center', gap:5}}>
                        <span style={{fontSize:14, fontWeight:800, letterSpacing:'-0.012em', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:200}}>{it.n}</span>
                        <MChip tone={it.tone === 'danger' ? 'danger' : it.tone === 'warning' ? 'warning' : 'success'}>{it.status}</MChip>
                      </div>
                      <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginTop:2}}>안전재고 {it.min}{it.unit} · {it.ts}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:18, fontWeight:800, color:'var(--z-900)', letterSpacing:'-0.02em'}} className="m-tnum">{it.stock}</div>
                      <div style={{fontSize:10, color:'var(--z-500)', fontWeight:700}}>{it.unit} 현재고</div>
                    </div>
                  </div>
                  {/* progress bar */}
                  <div style={{marginTop:8, height:5, background:'var(--z-100)', borderRadius:999, overflow:'hidden', position:'relative'}}>
                    <div style={{width: Math.min(pct, 100) + '%', height:'100%', background: it.tone === 'danger' ? 'var(--danger)' : it.tone === 'warning' ? 'var(--warning)' : 'var(--success)', transition:'width .3s'}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="m-sticky-foot">
        <MBtn block icon="arrowDown">입고</MBtn>
        <MBtn block icon="arrowUp">출고</MBtn>
        <MBtn block icon="paperclip" variant="primary" onClick={()=>onOpen && onOpen('form-order')}>발주</MBtn>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 11. 관리자 — 경영 대시보드 (모바일 요약)
// ═══════════════════════════════════════════════════════════════
const SExec = ({ onBack }) => {
  const kpis = [
    { l:'5월 매출',     v:'248,920', u:'천원', d:'+8.4%',  tone:'success', spark:[20,22,25,21,28,30,32,35,33,38] },
    { l:'인건비',       v:'42,180',  u:'천원', d:'-2.1%',  tone:'',        spark:[24,23,22,21,21,20,19,18,18,17] },
    { l:'환자수',       v:'412',     u:'명',   d:'+12.1%', tone:'success', spark:[18,22,25,28,30,28,32,35,40,42] },
    { l:'신환',         v:'68',      u:'명',   d:'-5.5%',  tone:'danger',  spark:[12,14,16,13,12,11,10,11,9,8] },
  ];
  const Spark = ({ values, color='var(--accent)' }) => {
    const w = 140, h = 36, pad = 2;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = (max - min) || 1;
    const stepX = (w - pad*2) / (values.length - 1 || 1);
    const points = values.map((v,i) => {
      const x = pad + i * stepX;
      const y = pad + (h - pad*2) * (1 - (v - min) / range);
      return `${x},${y}`;
    }).join(' ');
    const lastX = pad + (values.length-1) * stepX;
    const lastY = pad + (h - pad*2) * (1 - (values[values.length-1] - min) / range);
    const areaPts = `${pad},${h-pad} ${points} ${lastX},${h-pad}`;
    return (
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height={h}>
        <polygon points={areaPts} fill={color} opacity="0.1"/>
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx={lastX} cy={lastY} r="3" fill={color}/>
      </svg>
    );
  };
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="경영지표" sub="박철홍정형외과 · 2026.05" actions={<>
        <button><MIcon name="calendar" size={20}/></button>
        <button><MIcon name="moreV" size={20}/></button>
      </>}/>
      <div className="m-scroll">
        <div style={{padding:'14px 16px 0'}}>
          <div style={{display:'flex', gap:6, marginBottom:12}}>
            {['5월','4월','3월','연간'].map((m,i) => (
              <button key={i} style={{
                flex:1, height:32, borderRadius:8,
                background: i === 0 ? 'var(--z-900)' : 'var(--card)',
                color: i === 0 ? '#fff' : 'var(--z-700)',
                border: i === 0 ? 0 : '1px solid var(--border)',
                fontSize:12, fontWeight:700,
              }}>{m}</button>
            ))}
          </div>

          {/* KPI grid */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
            {kpis.map((k,i) => (
              <div key={i} className="m-card" style={{padding:'14px 14px'}}>
                <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{k.l}</div>
                <div style={{display:'flex', alignItems:'baseline', gap:3, marginTop:4}}>
                  <span style={{fontSize:20, fontWeight:800, letterSpacing:'-0.025em'}} className="m-tnum">{k.v}</span>
                  <span style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{k.u}</span>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:4, marginTop:2}}>
                  <span style={{fontSize:11, fontWeight:800, color: k.tone === 'success' ? 'var(--success)' : k.tone === 'danger' ? 'var(--danger)' : 'var(--z-500)'}} className="m-tnum">
                    {k.d}
                  </span>
                  <span style={{fontSize:10, color:'var(--z-400)', fontWeight:600}}>vs 4월</span>
                </div>
                <div style={{marginTop:8}}>
                  <Spark values={k.spark} color={k.tone === 'danger' ? '#EF4444' : k.tone === 'success' ? '#10B981' : '#71717A'}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 매출 추이 */}
        <div className="m-section">
          <div className="m-section-h"><div className="lbl">매출 추이 (최근 12개월)</div><span className="more">상세</span></div>
          <div className="m-card" style={{padding:'14px 14px'}}>
            <div style={{display:'flex', alignItems:'flex-end', gap:4, height:120}}>
              {[18,22,21,28,32,30,35,33,38,36,40,45].map((v,i) => (
                <div key={i} style={{
                  flex:1, height: (v/50)*100 + '%',
                  background: i === 11 ? 'var(--accent)' : 'var(--accent-soft)',
                  borderRadius: '4px 4px 2px 2px',
                  position:'relative',
                }}>
                  {i === 11 && (
                    <div style={{position:'absolute', top:-22, left:'50%', transform:'translateX(-50%)', fontSize:10, fontWeight:800, color:'var(--accent)', whiteSpace:'nowrap'}} className="m-tnum">₩249M</div>
                  )}
                </div>
              ))}
            </div>
            <div style={{display:'flex', justifyContent:'space-between', marginTop:6, fontSize:10, color:'var(--z-500)', fontWeight:600}}>
              <span>'25.6</span><span>'25.9</span><span>'25.12</span><span>'26.3</span><span style={{color:'var(--accent)', fontWeight:800}}>5월</span>
            </div>
          </div>
        </div>

        {/* 부문별 */}
        <div className="m-section">
          <div className="m-section-h"><div className="lbl">부문별 매출 비중</div></div>
          <div className="m-card">
            {[
              { l:'외래 진료', v:48, n:'119,481', t:'#2563EB' },
              { l:'영상의학',  v:24, n:'59,740',  t:'#8B5CF6' },
              { l:'수술',     v:18, n:'44,805',  t:'#10B981' },
              { l:'기타',     v:10, n:'24,892',  t:'#A1A1AA' },
            ].map((s,i) => (
              <div key={i} style={{marginTop: i ? 12 : 0}}>
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:5}}>
                  <span style={{width:8, height:8, borderRadius:2, background: s.t}}/>
                  <span style={{fontSize:12, fontWeight:700, flex:1}}>{s.l}</span>
                  <span style={{fontSize:13, fontWeight:800, color:'var(--z-900)'}} className="m-tnum">{s.v}%</span>
                  <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600, width:60, textAlign:'right'}} className="m-tnum">₩{s.n}K</span>
                </div>
                <div style={{height:6, borderRadius:999, background:'var(--z-100)', overflow:'hidden'}}>
                  <div style={{width: s.v + '%', height:'100%', background: s.t, transition:'width .3s'}}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{padding:'16px 16px 0'}}>
          <div className="m-card" style={{padding:'14px 14px', background:'var(--accent-soft)', borderColor:'transparent', display:'flex', alignItems:'center', gap:10}}>
            <MIcon name="alertCircle" size={18} color="var(--accent)"/>
            <div style={{flex:1, fontSize:12, color:'var(--accent)', fontWeight:700}}>상세 분석·다운로드는 데스크톱에서 열어주세요</div>
          </div>
        </div>

        <div style={{height:24}}/>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 12. 추가기능 허브
// ═══════════════════════════════════════════════════════════════
const SAddon = ({ onBack, onOpen }) => {
  // PC ADDON_MODULES 와 1:1 매칭 (hub 제외 12개)
  const modules = [
    { id:'org',       ic:'users',       tone:'accent',  name:'조직도',      hint:'다중 병원 · 27명',          alert:0, nav:'org' },
    { id:'inventory', ic:'box',         tone:'',        name:'부서별 재고', hint:'외래팀 부족 1·주의 3',      alert:1, nav:'dept-inventory' },
    { id:'worknow',   ic:'clock',       tone:'success', name:'근무현황',    hint:'근무중 8 · 휴게 2',         alert:0, nav:'worknow' },
    { id:'handoff',   ic:'fileText',    tone:'',        name:'인계노트',    hint:'오늘 공통 4건',             alert:0, nav:'handoff' },
    { id:'eval',      ic:'star',        tone:'warning', name:'직원평가',    hint:'평가 11명',                 alert:0, nav:'eval' },
    { id:'discharge', ic:'fileText',    tone:'',        name:'퇴원심사',    hint:'심사중 7건',                alert:2, nav:'discharge' },
    { id:'consult',   ic:'chat',        tone:'',        name:'수술상담',    hint:'오늘 상담 5건 · 음성분석',  alert:0, nav:'consult' },
    { id:'opcheck',   ic:'checkCircle', tone:'success', name:'OP체크',      hint:'오늘 수술 7건',             alert:2, nav:'op-board' },
    { id:'deposit',   ic:'won',         tone:'',        name:'입금 실시간조회', hint:'오늘 142건 · 940만원', alert:0, nav:'deposit', ext:true },
    { id:'closing',   ic:'fileText',    tone:'danger',  name:'마감보고',    hint:'미제출 1일',                alert:1, nav:'closing', ext:true },
    { id:'parking',   ic:'box',         tone:'',        name:'주차관제',    hint:'외부 시스템 연동',          alert:0, nav:'parking', ext:'iframe' },
    { id:'webfax',    ic:'send',        tone:'',        name:'웹팩스',      hint:'외부 시스템 연동',          alert:0, nav:'webfax',  ext:'iframe' },
  ];
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="추가기능" sub="박철홍정형외과에서 사용 중인 모듈 8개"
        actions={<button><MIcon name="search" size={20}/></button>}/>
      <div className="m-scroll">
        {/* OP체크 hero */}
        <div style={{padding:'14px 16px 0'}}>
          <div className="m-card" style={{padding:'16px 18px', background:'linear-gradient(135deg, var(--accent), #1D4ED8)', borderColor:'transparent', color:'#fff'}}>
            <div style={{fontSize:11, fontWeight:800, opacity:0.85, letterSpacing:'0.04em'}}>OP체크 — 진행중</div>
            <div style={{fontSize:22, fontWeight:800, letterSpacing:'-0.025em', marginTop:4}}>
              <span className="m-tnum">2</span><span style={{fontSize:13, opacity:0.85, marginLeft:6}}>건 시술중</span>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:12, marginTop:12}}>
              {[
                { r:'1번방', n:'박○○', t:'관절경', m:32, c:'#10B981' },
                { r:'2번방', n:'김○○', t:'신경차단', m:18, c:'#F59E0B' },
              ].map((op,i) => (
                <div key={i} style={{flex:1, background:'rgba(255,255,255,0.14)', borderRadius:10, padding:'10px 12px'}}>
                  <div style={{display:'flex', alignItems:'center', gap:4, fontSize:10, fontWeight:800, opacity:0.85}}>
                    <span style={{width:6, height:6, borderRadius:999, background:op.c}}/>
                    {op.r} · {op.t}
                  </div>
                  <div style={{fontSize:13, fontWeight:800, marginTop:3}}>{op.n}</div>
                  <div style={{fontSize:11, opacity:0.8, marginTop:2}} className="m-tnum">시작 {op.m}분 전</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="m-section">
          <div className="m-section-h"><div className="lbl">모듈</div><span className="more">관리</span></div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
            {modules.map(m => (
              <div key={m.id} onClick={()=>onOpen && onOpen(m.nav)} className="m-card" style={{padding:'14px 14px', position:'relative', cursor:'pointer'}}>
                <div className={'ico-tile ' + (m.tone ? 'tone-'+m.tone : '')} style={{
                  width: 36, height:36, borderRadius:10,
                  background: m.tone === 'accent' ? 'var(--accent-soft)' : m.tone === 'success' ? 'var(--success-soft)' : m.tone === 'danger' ? 'var(--danger-soft)' : 'var(--z-100)',
                  color: m.tone === 'accent' ? 'var(--accent)' : m.tone === 'success' ? 'var(--success)' : m.tone === 'danger' ? 'var(--danger)' : 'var(--z-700)',
                  display:'grid', placeItems:'center',
                }}><MIcon name={m.ic} size={18}/></div>
                <div style={{fontSize:13, fontWeight:800, marginTop:10, letterSpacing:'-0.012em'}}>{m.name}</div>
                <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginTop:2}}>{m.hint}</div>
                {m.alert > 0 && (
                  <span style={{
                    position:'absolute', top:12, right:12,
                    minWidth:18, height:18, padding:'0 5px',
                    background:'var(--danger)', color:'#fff',
                    borderRadius:999, fontSize:10, fontWeight:800,
                    display:'grid', placeItems:'center',
                  }}>{m.alert}</span>
                )}
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
// 13. More — 메뉴 드로어 페이지
// ═══════════════════════════════════════════════════════════════
const SMore = ({ onNav }) => (
  <div className="m-screen">
    <MHeader title="더보기" sub="박철홍정형외과 · 백정민" actions={<button><MIcon name="settings" size={20}/></button>}/>
    <div className="m-scroll">
      <div style={{padding:'16px 16px 0'}}>
        <div className="m-card" style={{padding:'14px 16px', display:'flex', alignItems:'center', gap:12}}>
          <MAvatar tone="blue" size="lg">백</MAvatar>
          <div style={{flex:1}}>
            <div style={{fontSize:15, fontWeight:800}}>백정민</div>
            <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginTop:1}}>경영지원팀 이사 · 사번 2</div>
          </div>
          <MBtn>프로필</MBtn>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-h"><div className="lbl">인사관리</div></div>
        <div className="m-card flush">
          <MListRow icon="users"     iconTone=""       label="구성원"         sub="명단 32 · 인사발령 · 교육"     onClick={()=>onNav('hr-member')}/>
          <MListRow icon="clock"     iconTone="accent" label="근태 관리"      sub="출근 14/16 · 지각 2"          onClick={()=>onNav('hr-attend')}/>
          <MListRow icon="calendar"  iconTone="success" label="연차·휴가"      sub="잔여 11일"                    onClick={()=>onNav('hr-leave')}/>
          <MListRow icon="alertTri"  iconTone="warning" label="근태이상 감지"   sub="본인 4건 · 팀 12건"           onClick={()=>onNav('hr-abnormal')}/>
          <MListRow icon="won"       iconTone=""       label="급여 명세서"    sub="2026년 5월 (실수령 3,245,180)" onClick={()=>onNav('payroll')}/>
          <MListRow icon="star"      iconTone=""       label="복지"           sub="경조사·건강검진·면허"          onClick={()=>onNav('hr-welfare')}/>
          <MListRow icon="fileText"  iconTone=""       label="계약·문서"      sub="제출 필요 2건"                onClick={()=>onNav('hr-docs')}/>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-h"><div className="lbl">재고관리</div></div>
        <div className="m-card flush">
          <MListRow icon="inventory" iconTone="danger" label="재고 현황"      sub="부족 1 · 주의 2"                onClick={()=>onNav('stock')}/>
          <MListRow icon="arrowDown" iconTone=""       label="입출고·발주"    sub="오늘 입고 14 · 출고 23 · 발주 4" onClick={()=>onNav('stock-io')}/>
          <MListRow icon="box"       iconTone=""       label="물품·자산"      sub="192품목 · 자산 48"             onClick={()=>onNav('stock-item')}/>
          <MListRow icon="trending"  iconTone=""       label="분석·마감"      sub="ABC · 예측 · 실사 · 마감"      onClick={()=>onNav('stock-analyze')}/>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-h"><div className="lbl">관리자</div></div>
        <div className="m-card flush">
          <MListRow icon="trending"  iconTone="accent" label="경영 대시보드"  sub="5월 매출 +8.4%"                 onClick={()=>onNav('exec')}/>
          <MListRow icon="shield"    iconTone="danger" label="시스템 마스터"  sub="iOS 푸시 토큰 만료 7건"         onClick={()=>onNav('admin-master')}/>
          <MListRow icon="hr"        iconTone=""       label="회사 관리"      sub="기본정보·근무·법인카드 외"      onClick={()=>onNav('admin-company')}/>
          <MListRow icon="shield"    iconTone=""       label="권한 관리"      sub="역할 6개 · 권한 요청 3"         onClick={()=>onNav('admin-roles')}/>
          <MListRow icon="settings"  iconTone=""       label="운영 설정"      sub="일반·메시지·팝업·외부연동"     onClick={()=>onNav('admin-ops')}/>
          <MListRow icon="fileText"  iconTone=""       label="결재 양식"      sub="총 14종"                       onClick={()=>onNav('admin-forms')}/>
          <MListRow icon="alertTri"  iconTone="warning" label="감사·백업"      sub="심각 1 · 경고 7 · DR 99.97%"    onClick={()=>onNav('admin-audit')}/>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-h"><div className="lbl">개인</div></div>
        <div className="m-card flush">
          <MListRow icon="clock"     iconTone="accent"  label="출퇴근 체크인" sub="오늘 09:14 출근"   onClick={()=>onNav('attend')}/>
          <MListRow icon="check"     iconTone=""        label="할일"          sub="긴급 1 · 높음 2"  onClick={()=>onNav('todo')}/>
          <MListRow icon="fileText"  iconTone="warning" label="서류제출"      sub="미제출 10건"      onClick={()=>onNav('docs')}/>
          <MListRow icon="grid"      iconTone=""        label="추가기능 허브" sub="OP체크 외 7개"    onClick={()=>onNav('addon')}/>
          <MListRow icon="bell"      iconTone=""        label="알림 설정"/>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-h"><div className="lbl">결재 (5뷰)</div></div>
        <div className="m-card flush">
          <MListRow icon="approval"  iconTone="accent"  label="결재함"        sub="대기 4 · 24h 초과 1"  onClick={()=>onNav('app')}/>
          <MListRow icon="send"      iconTone=""        label="기안함"        sub="내 결재 5건"          onClick={()=>onNav('approval-sent')}/>
          <MListRow icon="file"      iconTone=""        label="참조 문서함"   sub="2건 미열람"           onClick={()=>onNav('approval-ref')}/>
          <MListRow icon="plus"      iconTone=""        label="작성하기"      sub="양식 14종"            onClick={()=>onNav('approval-write')}/>
          <MListRow icon="fileText"  iconTone=""        label="양식 관리"     sub="총 14종"              onClick={()=>onNav('admin-forms')}/>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-h"><div className="lbl">설정</div></div>
        <div className="m-card flush">
          <MListRow icon="settings" label="앱 설정"/>
          <MListRow icon="alertCircle" label="공지 / FAQ"/>
          <MListRow icon="out" label="로그아웃" iconTone="danger"/>
        </div>
      </div>

      <div style={{height:32}}/>
      <div style={{textAlign:'center', fontSize:11, color:'var(--z-400)', fontWeight:600}}>
        MSO Mobile v2.6 · 2026.05
      </div>
      <div style={{height:24}}/>
    </div>
  </div>
);

Object.assign(window, { SApproval, SApprovalDetail, SPayroll, SStock, SExec, SAddon, SMore });
