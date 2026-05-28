// MSO 모바일 — Screens (Stock) : 입출고·발주 · 물품·자산 · 분석·마감
// (재고 현황은 m-screens-2.jsx 의 SStock 사용)

// ═══════════════════════════════════════════════════════════════
// Stock 1. 입출고·발주 (io)
// ═══════════════════════════════════════════════════════════════
const SStockIO = ({ onBack, onOpen }) => {
  const [tab, setTab] = React.useState('io');
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="입출고·발주" sub="박철홍정형외과" actions={<>
        <button><MIcon name="search" size={20}/></button>
        <button><MIcon name="qr" size={20}/></button>
      </>}/>
      <div className="m-chip-bar">
        <button className={tab==='io'?'on':''}      onClick={()=>setTab('io')}>입출고</button>
        <button className={tab==='order'?'on':''}   onClick={()=>setTab('order')}>발주 4</button>
        <button className={tab==='vendor'?'on':''}  onClick={()=>setTab('vendor')}>거래처</button>
        <button className={tab==='doc'?'on':''}     onClick={()=>setTab('doc')}>명세서</button>
      </div>
      <div className="m-scroll">
        {tab === 'io' && (
          <>
            <div style={{padding:'14px 16px 0', display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
              {[
                { l:'오늘 입고', v:14, u:'건', tone:'accent', d:'+₩ 1,240,000' },
                { l:'오늘 출고', v:23, u:'건', tone:'success', d:'12개 부서 사용' },
              ].map((k,i) => (
                <div key={i} className="m-card" style={{padding:'12px 14px'}}>
                  <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{k.l}</div>
                  <div className="m-tnum" style={{fontSize:22, fontWeight:800, letterSpacing:'-0.025em', marginTop:4}}>{k.v}<span style={{fontSize:11, color:'var(--z-500)', fontWeight:700, marginLeft:3}}>{k.u}</span></div>
                  <div style={{fontSize:11, color: k.tone === 'accent' ? 'var(--accent)' : 'var(--success)', fontWeight:700, marginTop:2}}>{k.d}</div>
                </div>
              ))}
            </div>
            <div className="m-section">
              <div className="m-section-h"><div className="lbl">최근 거래</div><span className="more">전체</span></div>
              <div className="m-card flush">
                {[
                  { d:'15:22', kind:'출고', t:'멸균거즈 4x4',    by:'박유진 · 1F',     qty:-12, tone:'success' },
                  { d:'14:08', kind:'입고', t:'카테터 18Ga',     by:'동인의료',       qty:+200, tone:'accent' },
                  { d:'13:30', kind:'출고', t:'1회용 주사기 5cc', by:'김상민 · 영상의학', qty:-50, tone:'success' },
                  { d:'11:14', kind:'입고', t:'알코올스왑',      by:'한솔메디칼',     qty:+500, tone:'accent' },
                  { d:'10:42', kind:'출고', t:'프린터 토너',     by:'행정팀',         qty:-1,  tone:'success' },
                ].map((r,i,arr) => (
                  <div key={i} className="m-list-row">
                    <div className={'ico-tile tone-'+(r.tone || '')}><MIcon name={r.kind === '입고' ? 'arrowDown' : 'arrowUp'} size={18}/></div>
                    <div>
                      <div className="lbl">{r.t}</div>
                      <div className="sub">{r.kind} · {r.by} · {r.d}</div>
                    </div>
                    <div className="val m-tnum" style={{color: r.qty > 0 ? 'var(--accent)' : 'var(--z-900)'}}>
                      {r.qty > 0 ? '+' : ''}{r.qty}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {tab === 'order' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card" style={{padding:'14px 16px', marginBottom:12, background:'var(--accent-soft)', borderColor:'transparent'}}>
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <MIcon name="alertCircle" size={18} color="var(--accent)"/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13, fontWeight:800, color:'var(--accent)'}}>자동 발주 권장 3건</div>
                  <div style={{fontSize:11, color:'var(--z-600)', fontWeight:600, marginTop:1}}>안전재고 미달 — 거래처 자동 매칭됨</div>
                </div>
                <MBtn size="sm" variant="primary">실행</MBtn>
              </div>
            </div>
            <div className="m-card flush">
              {[
                { t:'1회용 주사기 5cc 외 1', v:'동인의료', qty:'500개',  amt:'248,000', state:'배송중', ts:'5/10 발주', tone:'accent' },
                { t:'카테터 18Ga',           v:'한솔메디', qty:'200개',  amt:'1,400,000', state:'결재중', ts:'5/9 발주',  tone:'warning' },
                { t:'영상필름 A4 외 3',      v:'JK 의료',  qty:'5박스',  amt:'412,000',  state:'납품완료', ts:'5/7 완료', tone:'success' },
                { t:'멸균장갑 M·L 혼합',     v:'동인의료', qty:'2,000개', amt:'180,000', state:'발주취소', ts:'5/3',      tone:'danger' },
              ].map((r,i) => (
                <div key={i} className="m-card" style={{margin:'0 0 10px 0', borderRadius:12, padding:'12px 14px'}}>
                  <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
                    <MChip tone={r.tone}>{r.state}</MChip>
                    <div style={{flex:1}}/>
                    <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>{r.ts}</span>
                  </div>
                  <div style={{fontSize:14, fontWeight:800, letterSpacing:'-0.012em'}}>{r.t}</div>
                  <div style={{display:'flex', alignItems:'center', gap:8, marginTop:6, fontSize:12, color:'var(--z-500)', fontWeight:600}}>
                    <span>{r.v}</span>
                    <span style={{color:'var(--z-300)'}}>·</span>
                    <span>{r.qty}</span>
                    <div style={{flex:1}}/>
                    <span className="m-tnum" style={{fontSize:13, fontWeight:800, color:'var(--z-900)'}}>₩ {r.amt}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'vendor' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { n:'동인의료',     cat:'의료소모품',    o:42, tone:'success' },
                { n:'한솔메디칼',   cat:'의료기기',     o:18, tone:'' },
                { n:'JK 의료',     cat:'영상의학',     o:24, tone:'' },
                { n:'대한약품',     cat:'의약품',       o:36, tone:'' },
                { n:'오피스디포',   cat:'사무용품',     o:12, tone:'' },
              ].map((r,i,arr) => (
                <MListRow key={i}
                  icon="users"
                  iconTone={r.tone}
                  label={r.n}
                  sub={r.cat + ' · 발주 ' + r.o + '건'}
                  right={<MIcon name="chevR" size={18} color="var(--z-400)"/>}
                />
              ))}
            </div>
          </div>
        )}
        {tab === 'doc' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { n:'2026.05 거래명세서 #1240', v:'동인의료', amt:'248,000', s:'확인됨', tone:'success' },
                { n:'2026.05 거래명세서 #1239', v:'JK 의료',  amt:'412,000', s:'확인됨', tone:'success' },
                { n:'2026.04 거래명세서 #1232', v:'한솔메디', amt:'1,400,000', s:'대조 필요', tone:'warning' },
              ].map((r,i,arr) => (
                <MListRow key={i}
                  icon="fileText"
                  iconTone={r.tone}
                  label={r.n}
                  sub={r.v + ' · ₩ ' + r.amt}
                  right={<MChip tone={r.tone}>{r.s}</MChip>}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// Stock 2. 물품·자산 (item) — 물품 / 카테고리 / 자산 (QR)
// ═══════════════════════════════════════════════════════════════
const SStockItem = ({ onBack, onOpen }) => {
  const [tab, setTab] = React.useState('items');
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="물품·자산" sub="192품목 · 자산 48" actions={<>
        <button><MIcon name="search" size={20}/></button>
        <button onClick={()=>onOpen && onOpen('form-item')}><MIcon name="plus" size={20}/></button>
      </>}/>
      <div style={{padding:'10px 16px 0', background:'var(--card)', borderBottom:'1px solid var(--border)'}}>
        <div className="m-seg">
          <button className={tab==='items'?'on':''}    onClick={()=>setTab('items')}>물품 192</button>
          <button className={tab==='cat'?'on':''}      onClick={()=>setTab('cat')}>카테고리</button>
          <button className={tab==='asset'?'on':''}    onClick={()=>setTab('asset')}>자산 48</button>
          <button className={tab==='udi'?'on':''}      onClick={()=>setTab('udi')}>UDI</button>
        </div>
      </div>
      <div className="m-scroll">
        {tab === 'items' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { n:'1회용 주사기 5cc', cat:'의료소모품', sku:'M-S05', s:23, u:'개' },
                { n:'카테터 18Ga',     cat:'의료소모품', sku:'M-C18', s:48, u:'개' },
                { n:'멸균거즈 4x4',     cat:'의료소모품', sku:'M-G44', s:212, u:'팩' },
                { n:'알코올스왑',       cat:'의료소모품', sku:'M-A01', s:480, u:'개' },
                { n:'영상필름 A4',     cat:'영상의학',   sku:'I-FA4', s:18, u:'장' },
                { n:'프린터 토너 CL-1', cat:'사무',      sku:'O-T01', s:7,  u:'EA' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <div style={{width:36, height:36, borderRadius:8, background:'var(--z-100)', display:'grid', placeItems:'center'}}>
                    <MIcon name="box" size={18} color="var(--z-500)"/>
                  </div>
                  <div>
                    <div className="lbl">{r.n}</div>
                    <div className="sub">{r.cat} · SKU {r.sku}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div className="m-tnum" style={{fontSize:14, fontWeight:800}}>{r.s}<span style={{fontSize:10, color:'var(--z-500)', fontWeight:700, marginLeft:2}}>{r.u}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'cat' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { n:'의료소모품',   c:84, ic:'inventory', tone:'accent' },
                { n:'영상의학용품', c:32, ic:'pie',       tone:'' },
                { n:'의약품',      c:48, ic:'won',       tone:'' },
                { n:'멸균/소독',   c:18, ic:'shield',    tone:'success' },
                { n:'사무용품',    c:10, ic:'fileText',  tone:'' },
              ].map((r,i,arr) => (
                <MListRow key={i}
                  icon={r.ic}
                  iconTone={r.tone}
                  label={r.n}
                  sub={r.c + '품목'}
                />
              ))}
            </div>
          </div>
        )}
        {tab === 'asset' && (
          <div style={{padding:'14px 16px 0'}}>
            <button onClick={()=>onOpen && onOpen('form-asset')} style={{
              width:'100%', minHeight: 80, marginBottom:12,
              background: 'var(--accent)', color:'#fff', borderRadius:14,
              display:'flex', alignItems:'center', justifyContent:'center', gap:12,
              border:0, fontSize:15, fontWeight:800,
            }}>
              <MIcon name="qr" size={28} strokeWidth={1.6}/>
              <div style={{textAlign:'left'}}>
                <div>QR 코드로 자산 등록·확인</div>
                <div style={{fontSize:11, fontWeight:600, opacity:0.85, marginTop:2}}>카메라를 켜서 자산 라벨을 스캔하세요</div>
              </div>
            </button>
            <div className="m-card flush">
              {[
                { n:'1.5T MRI · GE Signa',   loc:'영상의학실 A', tag:'AST-0024', tone:'success' },
                { n:'X-Ray · Siemens',       loc:'영상의학실 B', tag:'AST-0019', tone:'success' },
                { n:'C-Arm · GE OEC',        loc:'OP실 1번',    tag:'AST-0011', tone:'warning' },
                { n:'초음파 · GE Logiq',     loc:'외래 2번',    tag:'AST-0018', tone:'danger' },
                { n:'데스크탑 PC Dell 7090', loc:'경영지원팀',   tag:'AST-0042', tone:'' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <div className={'ico-tile tone-'+(r.tone || '')}><MIcon name="settings" size={18}/></div>
                  <div>
                    <div className="lbl">{r.n}</div>
                    <div className="sub">{r.loc} · {r.tag}</div>
                  </div>
                  <MIcon name="qr" size={18} color="var(--z-400)"/>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'udi' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card" style={{padding:'14px 14px', marginBottom:12, background:'var(--accent-soft)', borderColor:'transparent'}}>
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <MIcon name="qr" size={20} color="var(--accent)"/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13, fontWeight:800, color:'var(--accent)'}}>UDI 통합 관리 · 48품목 등록</div>
                  <div style={{fontSize:11, color:'var(--z-600)', fontWeight:600, marginTop:1}}>식약처 의료기기 통합정보시스템(MFDS) 연동</div>
                </div>
                <MBtn size="sm" variant="primary">스캔</MBtn>
              </div>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12}}>
              {[
                { l:'등록', v:48, tone:'success' },
                { l:'동기화 대기', v:3, tone:'warning' },
                { l:'미등록 의료기기', v:2, tone:'danger' },
              ].map((k,i) => (
                <div key={i} className="m-card" style={{padding:'12px 12px'}}>
                  <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{k.l}</div>
                  <div className="m-tnum" style={{fontSize:20, fontWeight:800, letterSpacing:'-0.025em', marginTop:4, color: k.tone === 'danger' ? 'var(--danger)' : k.tone === 'warning' ? 'var(--warning)' : 'var(--success)'}}>{k.v}</div>
                </div>
              ))}
            </div>
            <div className="m-card flush">
              {[
                { n:'1.5T MRI · GE Signa',    udi:'(01)08806525210043(11)260301', s:'동기화', tone:'success' },
                { n:'X-Ray · Siemens',        udi:'(01)04057460081290(11)250812', s:'동기화', tone:'success' },
                { n:'C-Arm · GE OEC',         udi:'(01)08806525301229(17)271231', s:'대기',   tone:'warning' },
                { n:'초음파 · GE Logiq',      udi:'(01)08806525112201(10)A220301', s:'대기',   tone:'warning' },
                { n:'정형외과 수술 키트 (Set A)', udi:'미등록', s:'필요',  tone:'danger' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <div className={'ico-tile tone-'+(r.tone)}><MIcon name="qr" size={18}/></div>
                  <div>
                    <div className="lbl">{r.n}</div>
                    <div className="sub m-tnum" style={{fontSize:10}}>{r.udi}</div>
                  </div>
                  <MChip tone={r.tone}>{r.s}</MChip>
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
const SStockAnalyze = ({ onBack }) => {
  const [tab, setTab] = React.useState('abc');
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="재고 분석·마감" sub="박철홍정형외과 · 2026.05"/>
      <div className="m-chip-bar">
        <button className={tab==='abc'?'on':''}      onClick={()=>setTab('abc')}>ABC 분석</button>
        <button className={tab==='forecast'?'on':''} onClick={()=>setTab('forecast')}>수요예측</button>
        <button className={tab==='count'?'on':''}    onClick={()=>setTab('count')}>실사</button>
        <button className={tab==='close'?'on':''}    onClick={()=>setTab('close')}>월마감</button>
        <button className={tab==='usage'?'on':''}    onClick={()=>setTab('usage')}>소모품 통계</button>
        <button className={tab==='rma'?'on':''}      onClick={()=>setTab('rma')}>AS·반품</button>
      </div>
      <div className="m-scroll">
        {tab === 'abc' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card" style={{padding:'14px 14px', marginBottom:12}}>
              <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>전체 사용액 ₩ 24,820,000 / 5월</div>
              <div style={{display:'flex', alignItems:'center', gap:6, marginTop:12, height:14, borderRadius:7, overflow:'hidden'}}>
                <div style={{flex:74, background:'var(--accent)', height:'100%'}}/>
                <div style={{flex:21, background:'#A78BFA', height:'100%'}}/>
                <div style={{flex:5,  background:'var(--z-300)', height:'100%'}}/>
              </div>
              <div style={{display:'flex', justifyContent:'space-between', marginTop:8, fontSize:11, fontWeight:700}}>
                <span style={{color:'var(--accent)'}}>A · 74%</span>
                <span style={{color:'#7C3AED'}}>B · 21%</span>
                <span style={{color:'var(--z-500)'}}>C · 5%</span>
              </div>
            </div>
            <div className="m-section-h"><div className="lbl">A 등급 핵심 품목</div></div>
            <div className="m-card flush">
              {[
                { n:'카테터 18Ga',       use:'4,820,000', mom:'+12%', tone:'success' },
                { n:'1회용 주사기 5cc',  use:'3,180,000', mom:'+8%',  tone:'success' },
                { n:'멸균거즈 4x4',      use:'2,940,000', mom:'+3%',  tone:'success' },
                { n:'영상필름 A4',       use:'2,210,000', mom:'-5%',  tone:'danger' },
                { n:'알코올스왑',        use:'1,820,000', mom:'+2%',  tone:'success' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <div className="ico-tile tone-accent" style={{fontSize:11, fontWeight:800}}>A</div>
                  <div>
                    <div className="lbl">{r.n}</div>
                    <div className="sub">월 사용액 ₩ {r.use}</div>
                  </div>
                  <span className="m-tnum" style={{fontSize:12, fontWeight:800, color: r.tone === 'success' ? 'var(--success)' : 'var(--danger)'}}>{r.mom}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'forecast' && (
          <div style={{padding:'14px 16px 0'}}>
            <DesktopHint>상세 예측 모델 조정은 데스크톱에서</DesktopHint>
            <div className="m-card" style={{marginTop:12, padding:'14px 14px'}}>
              <div style={{fontSize:13, fontWeight:800}}>6월 수요 예측 (top 5)</div>
              <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginTop:2}}>최근 12개월 평균 + 계절성</div>
              <div style={{display:'flex', flexDirection:'column', gap:10, marginTop:12}}>
                {[
                  { n:'카테터 18Ga',       v:540, p:8,  tone:'success' },
                  { n:'1회용 주사기 5cc',  v:380, p:-3, tone:'danger' },
                  { n:'멸균거즈 4x4',      v:250, p:5,  tone:'success' },
                  { n:'알코올스왑',        v:480, p:2,  tone:'success' },
                  { n:'영상필름 A4',       v:36,  p:0,  tone:'' },
                ].map((r,i) => (
                  <div key={i}>
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <span style={{fontSize:12, fontWeight:700, flex:1}}>{r.n}</span>
                      <span className="m-tnum" style={{fontSize:13, fontWeight:800}}>{r.v}</span>
                      <span className="m-tnum" style={{fontSize:11, fontWeight:700, color: r.tone === 'success' ? 'var(--success)' : r.tone === 'danger' ? 'var(--danger)' : 'var(--z-500)', width:38, textAlign:'right'}}>{r.p > 0 ? '+' : ''}{r.p}%</span>
                    </div>
                    <div style={{marginTop:5, height:5, background:'var(--z-100)', borderRadius:999, overflow:'hidden'}}>
                      <div style={{width: Math.min(r.v/600*100, 100)+'%', height:'100%', background:'var(--accent)'}}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {tab === 'count' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card" style={{padding:'16px 18px'}}>
              <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>이번 분기 실사 진행률</div>
              <div className="m-tnum" style={{fontSize:30, fontWeight:800, letterSpacing:'-0.025em', color:'var(--accent)', marginTop:4}}>148<span style={{fontSize:14, color:'var(--z-500)', marginLeft:4}}>/192</span></div>
              <div style={{marginTop:10, height:8, background:'var(--z-100)', borderRadius:999, overflow:'hidden'}}>
                <div style={{width:'77%', height:'100%', background:'var(--accent)'}}/>
              </div>
              <div style={{display:'flex', justifyContent:'space-between', marginTop:6, fontSize:11, color:'var(--z-500)', fontWeight:700}}>
                <span>77% 완료</span><span>~6/15 마감</span>
              </div>
            </div>
            <div className="m-section-h" style={{padding:'18px 0 8px'}}><div className="lbl">이상 발견 3건</div></div>
            <div className="m-card flush">
              {[
                { n:'1회용 주사기 5cc', diff:'-12개', exp:'장부 35 / 실제 23', tone:'danger' },
                { n:'영상필름 A4',     diff:'+4장',  exp:'장부 14 / 실제 18', tone:'warning' },
                { n:'멸균거즈 4x4',    diff:'-2팩',  exp:'장부 214 / 실제 212', tone:'warning' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <div className={'ico-tile tone-'+(r.tone)}><MIcon name="alertTri" size={18}/></div>
                  <div>
                    <div className="lbl">{r.n}</div>
                    <div className="sub">{r.exp}</div>
                  </div>
                  <span className="m-tnum" style={{fontSize:14, fontWeight:800, color:'var(--'+r.tone+')'}}>{r.diff}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'close' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card" style={{padding:'16px 18px', background:'var(--accent-soft)', borderColor:'transparent'}}>
              <div style={{fontSize:11, color:'var(--accent)', fontWeight:800, letterSpacing:'0.04em'}}>5월 마감 진행</div>
              <div style={{fontSize:18, fontWeight:800, marginTop:4, color:'var(--accent)'}}>3 / 5 단계 완료</div>
            </div>
            <div className="m-card flush" style={{marginTop:12}}>
              {[
                { t:'재고 실사', s:'완료', tone:'success' },
                { t:'단가 확정', s:'완료', tone:'success' },
                { t:'사용액 정산', s:'완료', tone:'success' },
                { t:'부서 배분',  s:'진행중', tone:'warning' },
                { t:'대표 승인',  s:'대기', tone:'' },
              ].map((s,i,arr) => (
                <div key={i} className="m-list-row" style={{gridTemplateColumns:'40px 1fr auto'}}>
                  <div style={{width:32, height:32, borderRadius:'50%', display:'grid', placeItems:'center',
                    background: s.tone === 'success' ? 'var(--success)' : s.tone === 'warning' ? 'var(--warning)' : 'var(--z-200)',
                    color: s.tone ? '#fff' : 'var(--z-500)',
                    fontWeight:800, fontSize:13}}>
                    {s.tone === 'success' ? '✓' : i+1}
                  </div>
                  <div className="lbl">{s.t}</div>
                  <MChip tone={s.tone}>{s.s}</MChip>
                </div>
              ))}
            </div>
            <div style={{padding:'12px 0 0'}}>
              <MBtn block variant="primary" icon="check">대표 승인 요청</MBtn>
            </div>
          </div>
        )}
        {tab === 'usage' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card" style={{padding:'14px 14px', marginBottom:12}}>
              <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>이번 달 소모품 총 사용액</div>
              <div className="m-tnum" style={{fontSize:26, fontWeight:800, letterSpacing:'-0.025em', color:'var(--z-900)', marginTop:4}}>₩ 18,420,000<span style={{fontSize:12, fontWeight:700, color:'var(--success)', marginLeft:6}}>+6.2% MoM</span></div>
            </div>
            <div className="m-section-h"><div className="lbl">부서별 사용</div></div>
            <div className="m-card flush">
              {[
                { d:'영상의학팀', amt:'7,820,000', pct:42, tone:'accent' },
                { d:'OP실',     amt:'5,140,000', pct:28, tone:'success' },
                { d:'외래',     amt:'3,260,000', pct:18, tone:'' },
                { d:'간호부',   amt:'2,200,000', pct:12, tone:'' },
              ].map((r,i,arr) => (
                <div key={i} style={{padding:'12px 16px', borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none'}}>
                  <div style={{display:'flex', alignItems:'center', gap:8}}>
                    <span style={{fontSize:13, fontWeight:700, flex:1}}>{r.d}</span>
                    <span className="m-tnum" style={{fontSize:13, fontWeight:800}}>{r.pct}%</span>
                    <span className="m-tnum" style={{fontSize:11, color:'var(--z-500)', fontWeight:700, width:80, textAlign:'right'}}>₩{r.amt}</span>
                  </div>
                  <div style={{marginTop:6, height:5, background:'var(--z-100)', borderRadius:999, overflow:'hidden'}}>
                    <div style={{width: r.pct + '%', height:'100%', background: r.tone === 'accent' ? 'var(--accent)' : r.tone === 'success' ? 'var(--success)' : 'var(--z-400)'}}/>
                  </div>
                </div>
              ))}
            </div>
            <div className="m-section-h" style={{padding:'18px 0 8px'}}><div className="lbl">최근 6개월 추이</div></div>
            <div className="m-card" style={{padding:'14px 14px'}}>
              <div style={{display:'flex', alignItems:'flex-end', gap:8, height:80}}>
                {[14,16,15,18,17,18.4].map((v,i,arr) => (
                  <div key={i} style={{flex:1, height:(v/20)*100+'%', background: i === arr.length-1 ? 'var(--accent)' : 'var(--accent-soft)', borderRadius:'4px 4px 2px 2px'}}/>
                ))}
              </div>
              <div style={{display:'flex', gap:8, marginTop:6, fontSize:10, color:'var(--z-500)', fontWeight:600}}>
                {['12','1','2','3','4','5'].map((m,i,arr) => (
                  <div key={i} style={{flex:1, textAlign:'center', color: i === arr.length-1 ? 'var(--accent)' : 'var(--z-500)', fontWeight: i === arr.length-1 ? 800 : 600}}>{m}월</div>
                ))}
              </div>
            </div>
          </div>
        )}
        {tab === 'rma' && (
          <div style={{padding:'14px 16px 0'}}>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12}}>
              {[
                { l:'AS 진행', v:3, tone:'warning' },
                { l:'반품 진행', v:1, tone:'accent' },
              ].map((k,i) => (
                <div key={i} className="m-card" style={{padding:'12px 14px'}}>
                  <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{k.l}</div>
                  <div className="m-tnum" style={{fontSize:22, fontWeight:800, letterSpacing:'-0.025em', marginTop:4, color: k.tone === 'warning' ? 'var(--warning)' : 'var(--accent)'}}>{k.v}<span style={{fontSize:11, color:'var(--z-500)', fontWeight:700, marginLeft:3}}>건</span></div>
                </div>
              ))}
            </div>
            <div className="m-card flush">
              {[
                { kind:'AS',  n:'초음파 GE Logiq', v:'한솔메디칼', s:'점검중',     ts:'5/8 접수',  tone:'warning' },
                { kind:'AS',  n:'X-Ray Room 1',  v:'JK 의료',    s:'부품 대기',   ts:'5/5 접수',  tone:'warning' },
                { kind:'AS',  n:'C-Arm OEC',     v:'GE 코리아',  s:'완료',       ts:'5/2 완료',  tone:'success' },
                { kind:'반품', n:'멸균거즈 4x4 50팩', v:'동인의료', s:'환불 대기',  ts:'5/3 발송',  tone:'accent' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <MChip tone={r.kind === '반품' ? 'accent' : 'warning'}>{r.kind}</MChip>
                  <div>
                    <div className="lbl">{r.n}</div>
                    <div className="sub">{r.v} · {r.ts}</div>
                  </div>
                  <MChip tone={r.tone}>{r.s}</MChip>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { SStockIO, SStockItem, SStockAnalyze });
