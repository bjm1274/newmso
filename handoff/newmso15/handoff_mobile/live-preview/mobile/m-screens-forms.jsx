// MSO 모바일 — Screens (Forms) : 등록/작성 모달 화면
// 구성원·물품·자산(QR)·발주·연차신청·게시판 작성·새 대화

// 공통: 폼 헤더 (취소 · 제목 · 저장)
const FormHeader = ({ onCancel, title, sub, onSave, saveLabel = '저장', saveDisabled }) => (
  <div className="m-header" style={{paddingTop:18, paddingBottom:14}}>
    <button onClick={onCancel} style={{color:'var(--z-700)', fontSize:14, fontWeight:700, padding:'0 4px'}}>취소</button>
    <div style={{flex:1, textAlign:'center'}}>
      <div className="title" style={{fontSize:15}}>{title}</div>
      {sub && <div className="sub" style={{textAlign:'center'}}>{sub}</div>}
    </div>
    <button onClick={onSave} disabled={saveDisabled} style={{
      color: saveDisabled ? 'var(--z-400)' : 'var(--accent)',
      fontSize:14, fontWeight:800, padding:'0 4px',
    }}>{saveLabel}</button>
  </div>
);

// 공통: 필드 행
const Field = ({ label, required, children, sub }) => (
  <div style={{padding:'12px 16px', borderBottom:'1px solid var(--border)'}}>
    <div style={{fontSize:11, color:'var(--z-500)', fontWeight:800, letterSpacing:'0.04em', textTransform:'uppercase', marginBottom:6}}>
      {label} {required && <span style={{color:'var(--danger)'}}>*</span>}
    </div>
    {children}
    {sub && <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginTop:4}}>{sub}</div>}
  </div>
);
const Input = ({ value, placeholder, onChange, kind = 'text', autoFocus }) => (
  <input
    type={kind === 'tel' ? 'tel' : kind === 'email' ? 'email' : 'text'}
    inputMode={kind === 'tel' ? 'tel' : kind === 'numeric' ? 'numeric' : kind === 'decimal' ? 'decimal' : 'text'}
    {...(onChange ? { value: value || '', onChange } : { defaultValue: value || '' })}
    placeholder={placeholder}
    autoFocus={autoFocus}
    style={{width:'100%', padding:'8px 0', fontSize:15, fontFamily:'inherit', color:'var(--z-900)'}}
  />
);
const SegRow = ({ options, value, onPick }) => (
  <div className="m-seg" style={{marginTop:4}}>
    {options.map(o => (
      <button key={o.id} className={value === o.id ? 'on' : ''} onClick={()=>onPick(o.id)}>{o.label}</button>
    ))}
  </div>
);
const StepDots = ({ total, cur }) => (
  <div style={{display:'flex', gap:6, justifyContent:'center', padding:'14px 16px', background:'var(--card)', borderBottom:'1px solid var(--border)'}}>
    {Array.from({length:total}).map((_,i) => (
      <div key={i} style={{
        flex: i === cur ? '0 0 36px' : '0 0 8px',
        height:8, borderRadius:999,
        background: i <= cur ? 'var(--accent)' : 'var(--z-200)',
        transition:'flex .2s',
      }}/>
    ))}
  </div>
);

// ═══════════════════════════════════════════════════════════════
// FM 1. 구성원 등록 (3-step wizard)
// ═══════════════════════════════════════════════════════════════
const SFormMember = ({ onBack }) => {
  const [step, setStep] = React.useState(0);
  const [v, setV] = React.useState({
    name:'', emp:'', phone:'', email:'',
    dept:'경영지원팀', role:'사원',
    type:'정규직', start:'2026.05.27', salary:'',
    auth:'employee',
  });
  const set = (k, val) => setV(prev => ({...prev, [k]: val}));
  const TITLE = ['기본 정보','계약·근무','권한 설정'];
  return (
    <div className="m-screen">
      <FormHeader
        onCancel={onBack}
        title="구성원 등록"
        sub={`${step+1}/3 · ${TITLE[step]}`}
        saveLabel={step < 2 ? '다음' : '등록'}
        onSave={() => step < 2 ? setStep(step+1) : onBack && onBack()}
        saveDisabled={step === 0 && !v.name}
      />
      <StepDots total={3} cur={step}/>
      <div className="m-scroll">
        {step === 0 && (
          <>
            <div style={{padding:'18px 16px', background:'var(--card)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:14}}>
              <div style={{width:64, height:64, borderRadius:18, background:'var(--z-100)', display:'grid', placeItems:'center', color:'var(--z-400)'}}>
                <MIcon name="user" size={28}/>
              </div>
              <div style={{flex:1}}>
                <MBtn icon="plus">사진 추가</MBtn>
                <div style={{fontSize:11, color:'var(--z-500)', marginTop:6, fontWeight:600}}>선택사항 · 최대 4MB</div>
              </div>
            </div>
            <div className="m-card flush" style={{borderRadius:0, border:'none'}}>
              <Field label="이름" required>
                <Input value={v.name} onChange={e=>set('name', e.target.value)} placeholder="홍길동" autoFocus/>
              </Field>
              <Field label="사번" sub="비워두면 자동 생성됩니다">
                <Input value={v.emp} onChange={e=>set('emp', e.target.value)} placeholder="자동 — 예: 0033" kind="numeric"/>
              </Field>
              <Field label="연락처">
                <Input value={v.phone} onChange={e=>set('phone', e.target.value)} placeholder="010-0000-0000" kind="tel"/>
              </Field>
              <Field label="이메일">
                <Input value={v.email} onChange={e=>set('email', e.target.value)} placeholder="user@hospital.kr" kind="email"/>
              </Field>
            </div>
          </>
        )}
        {step === 1 && (
          <div className="m-card flush" style={{borderRadius:0, border:'none'}}>
            <Field label="부서">
              <div style={{display:'flex', gap:6, marginTop:4, flexWrap:'wrap'}}>
                {['경영지원팀','영상의학팀','간호부','외래팀','OP실','행정팀'].map(d => (
                  <button key={d} onClick={()=>set('dept', d)} style={{
                    padding:'8px 12px', borderRadius:999, fontSize:12, fontWeight:700,
                    background: v.dept === d ? 'var(--accent)' : 'var(--bg)',
                    color: v.dept === d ? '#fff' : 'var(--z-700)',
                  }}>{d}</button>
                ))}
              </div>
            </Field>
            <Field label="직급">
              <Input value={v.role} onChange={e=>set('role', e.target.value)} placeholder="사원 / 대리 / 팀장 / 이사"/>
            </Field>
            <Field label="계약 형태">
              <SegRow value={v.type} onPick={t=>set('type', t)}
                options={[
                  { id:'정규직', label:'정규직' },
                  { id:'계약직', label:'계약직' },
                  { id:'시간제', label:'시간제' },
                ]}/>
            </Field>
            <Field label="입사일">
              <Input value={v.start} onChange={e=>set('start', e.target.value)} placeholder="YYYY.MM.DD"/>
            </Field>
            <Field label="연봉 (선택)" sub="입력 시 자동으로 월급여 산출">
              <Input value={v.salary} onChange={e=>set('salary', e.target.value)} placeholder="₩ 36,000,000" kind="decimal"/>
            </Field>
          </div>
        )}
        {step === 2 && (
          <>
            <div style={{padding:'16px 16px 0', fontSize:13, color:'var(--z-700)'}}>
              <b>{v.name || '신규 직원'}</b>의 권한을 설정하세요. 입사 후 권한 관리 화면에서 변경할 수 있습니다.
            </div>
            <div className="m-card flush" style={{borderRadius:0, border:'none', marginTop:14}}>
              {[
                { id:'employee',   t:'일반 직원',     d:'본인 결재·명세서·근태만 접근', tone:'' },
                { id:'team',       t:'팀장',         d:'1차 결재 + HR 조회 + 재고 입출고', tone:'success' },
                { id:'manager',    t:'경영지원 이사', d:'결재·HR·재고·회사관리 전체',     tone:'accent' },
                { id:'admin',      t:'대표',         d:'전체 권한 (감사 로그 남음)',     tone:'danger' },
              ].map(r => (
                <label key={r.id} style={{display:'grid', gridTemplateColumns:'24px 1fr', gap:12, padding:'14px 16px', borderBottom:'1px solid var(--border)', alignItems:'flex-start', cursor:'pointer'}}>
                  <button onClick={(e)=>{e.preventDefault(); set('auth', r.id);}} style={{
                    width:22, height:22, borderRadius:'50%',
                    border: v.auth === r.id ? 'none' : '1.5px solid var(--z-300)',
                    background: v.auth === r.id ? 'var(--accent)' : 'transparent',
                    color:'#fff', display:'grid', placeItems:'center', marginTop:1,
                  }}>
                    {v.auth === r.id && <span style={{width:8, height:8, borderRadius:'50%', background:'#fff'}}/>}
                  </button>
                  <div>
                    <div style={{fontSize:14, fontWeight:800, display:'flex', alignItems:'center', gap:6}}>
                      {r.t} <MChip tone={r.tone || ''}>권한</MChip>
                    </div>
                    <div style={{fontSize:12, color:'var(--z-500)', fontWeight:600, marginTop:2}}>{r.d}</div>
                  </div>
                </label>
              ))}
            </div>
            <div style={{padding:'14px 16px 0'}}>
              <DesktopHint tone="warning">대표 / 경영지원 이사 권한 부여는 감사 로그가 남습니다</DesktopHint>
            </div>
          </>
        )}
      </div>
      {step > 0 && (
        <div className="m-sticky-foot">
          <MBtn block onClick={()=>setStep(step-1)}>이전</MBtn>
          <MBtn block variant="primary" onClick={()=> step < 2 ? setStep(step+1) : (onBack && onBack())}>
            {step < 2 ? '다음' : '등록 완료'}
          </MBtn>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// FM 2. 물품 등록
// ═══════════════════════════════════════════════════════════════
const SFormItem = ({ onBack }) => {
  const [v, setV] = React.useState({ name:'', sku:'', cat:'의료소모품', unit:'개', price:'', safety:'', vendor:'동인의료', img:false });
  const set = (k, val) => setV(prev => ({...prev, [k]: val}));
  return (
    <div className="m-screen">
      <FormHeader onCancel={onBack} title="물품 등록" onSave={onBack} saveDisabled={!v.name}/>
      <div className="m-scroll">
        {/* 이미지 / QR */}
        <div style={{padding:'18px 16px', background:'var(--card)', borderBottom:'1px solid var(--border)'}}>
          <div style={{display:'flex', gap:10}}>
            <button onClick={()=>set('img', !v.img)} style={{
              flex:1, height:90, borderRadius:12,
              background: v.img ? 'linear-gradient(135deg, #94A3B8, #64748B)' : 'var(--z-100)',
              color: v.img ? '#fff' : 'var(--z-500)',
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6,
              border: v.img ? 'none' : '1px dashed var(--z-300)',
            }}>
              <MIcon name="image" size={22}/>
              <span style={{fontSize:11, fontWeight:700}}>{v.img ? '사진 첨부됨' : '사진 추가'}</span>
            </button>
            <button style={{
              flex:1, height:90, borderRadius:12,
              background:'var(--accent-soft)', color:'var(--accent)',
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6,
              border:'1px dashed var(--accent)',
            }}>
              <MIcon name="qr" size={22}/>
              <span style={{fontSize:11, fontWeight:800}}>QR/바코드 스캔</span>
            </button>
          </div>
        </div>

        <div className="m-card flush" style={{borderRadius:0, border:'none'}}>
          <Field label="품목명" required>
            <Input value={v.name} onChange={e=>set('name', e.target.value)} placeholder="예: 카테터 18Ga" autoFocus/>
          </Field>
          <Field label="SKU" sub="비워두면 자동 생성">
            <Input value={v.sku} onChange={e=>set('sku', e.target.value)} placeholder="자동 — 예: M-C18"/>
          </Field>
          <Field label="카테고리">
            <div style={{display:'flex', gap:6, marginTop:4, flexWrap:'wrap'}}>
              {['의료소모품','영상의학','의약품','멸균/소독','사무용품'].map(c => (
                <button key={c} onClick={()=>set('cat', c)} style={{
                  padding:'8px 12px', borderRadius:999, fontSize:12, fontWeight:700,
                  background: v.cat === c ? 'var(--accent)' : 'var(--bg)',
                  color: v.cat === c ? '#fff' : 'var(--z-700)',
                }}>{c}</button>
              ))}
            </div>
          </Field>
          <Field label="단위">
            <SegRow value={v.unit} onPick={u=>set('unit', u)}
              options={[
                { id:'개',  label:'개' },
                { id:'팩',  label:'팩' },
                { id:'박스', label:'박스' },
                { id:'EA', label:'EA' },
              ]}/>
          </Field>
          <Field label="단가 (선택)">
            <div style={{display:'flex', alignItems:'center', gap:6}}>
              <span style={{fontSize:15, color:'var(--z-500)', fontWeight:700}}>₩</span>
              <Input value={v.price} onChange={e=>set('price', e.target.value)} placeholder="0" kind="decimal"/>
            </div>
          </Field>
          <Field label="안전 재고" sub="이 수량 이하로 떨어지면 자동 발주 권장 알림">
            <Input value={v.safety} onChange={e=>set('safety', e.target.value)} placeholder="예: 100" kind="numeric"/>
          </Field>
          <Field label="주거래처">
            <div style={{display:'flex', alignItems:'center', gap:8, padding:'6px 0'}}>
              <MAvatar tone="cyan" size="sm">{v.vendor.charAt(0)}</MAvatar>
              <div style={{flex:1, fontSize:14, fontWeight:700}}>{v.vendor}</div>
              <button style={{color:'var(--accent)', fontSize:12, fontWeight:700}}>변경</button>
            </div>
          </Field>
        </div>

        <div style={{padding:'14px 16px 24px'}}>
          <DesktopHint>품목 다량 등록·CSV 일괄 업로드는 데스크톱에서</DesktopHint>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// FM 3. 자산 등록 (QR 스캔 중심)
// ═══════════════════════════════════════════════════════════════
const SFormAsset = ({ onBack }) => {
  const [v, setV] = React.useState({ scan:false, name:'', tag:'', cat:'의료기기', loc:'영상의학실 A', buy:'', vendor:'', warranty:'' });
  const set = (k, val) => setV(prev => ({...prev, [k]: val}));
  return (
    <div className="m-screen">
      <FormHeader onCancel={onBack} title="자산 등록" onSave={onBack} saveDisabled={!v.name}/>
      <div className="m-scroll">
        {/* QR 스캔 hero */}
        <div style={{padding:'18px 16px', background:'var(--card)', borderBottom:'1px solid var(--border)'}}>
          {!v.scan ? (
            <button onClick={()=>{set('scan', true); set('tag','AST-0049'); set('name','C-Arm OEC 9900 Elite');}}
              style={{
                width:'100%', minHeight:160, borderRadius:14,
                background:'linear-gradient(135deg, var(--accent), #1D4ED8)', color:'#fff', border:0,
                display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10,
              }}>
              <MIcon name="qr" size={42} strokeWidth={1.4}/>
              <div style={{fontSize:16, fontWeight:800}}>자산 라벨 스캔하기</div>
              <div style={{fontSize:11, fontWeight:600, opacity:0.85}}>UDI 라벨 / QR / 바코드 자동 인식</div>
            </button>
          ) : (
            <div style={{padding:'14px 14px', borderRadius:14, background:'var(--success-soft)', border:'1px solid transparent'}}>
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <MIcon name="checkCircle" size={22} color="var(--success)"/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13, fontWeight:800, color:'var(--success)'}}>UDI 인식 완료 · MFDS DB 매칭</div>
                  <div style={{fontSize:11, color:'var(--z-600)', fontWeight:600, marginTop:1, fontFamily:'monospace'}}>(01)08806525301229(17)271231</div>
                </div>
                <button onClick={()=>set('scan', false)} style={{fontSize:12, fontWeight:700, color:'var(--z-500)'}}>재스캔</button>
              </div>
            </div>
          )}
        </div>

        <div className="m-card flush" style={{borderRadius:0, border:'none'}}>
          <Field label="자산명" required>
            <Input value={v.name} onChange={e=>set('name', e.target.value)} placeholder="예: 1.5T MRI · GE Signa" autoFocus/>
          </Field>
          <Field label="자산 태그" sub="자동 생성 또는 라벨 인식값">
            <Input value={v.tag} onChange={e=>set('tag', e.target.value)} placeholder="자동 — AST-XXXX"/>
          </Field>
          <Field label="카테고리">
            <div style={{display:'flex', gap:6, marginTop:4, flexWrap:'wrap'}}>
              {['의료기기','영상장비','IT 장비','가구','사무'].map(c => (
                <button key={c} onClick={()=>set('cat', c)} style={{
                  padding:'8px 12px', borderRadius:999, fontSize:12, fontWeight:700,
                  background: v.cat === c ? 'var(--accent)' : 'var(--bg)',
                  color: v.cat === c ? '#fff' : 'var(--z-700)',
                }}>{c}</button>
              ))}
            </div>
          </Field>
          <Field label="설치 위치">
            <div style={{display:'flex', alignItems:'center', gap:8, padding:'6px 0'}}>
              <MIcon name="mapPin" size={16} color="var(--accent)"/>
              <Input value={v.loc} onChange={e=>set('loc', e.target.value)} placeholder="예: 영상의학실 A"/>
            </div>
          </Field>
          <Field label="구입일">
            <Input value={v.buy} onChange={e=>set('buy', e.target.value)} placeholder="YYYY.MM.DD"/>
          </Field>
          <Field label="공급사">
            <Input value={v.vendor} onChange={e=>set('vendor', e.target.value)} placeholder="예: GE 헬스케어 코리아"/>
          </Field>
          <Field label="보증 만료" sub="예: 2028.03.15">
            <Input value={v.warranty} onChange={e=>set('warranty', e.target.value)} placeholder="YYYY.MM.DD"/>
          </Field>
        </div>
        <div style={{height:24}}/>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// FM 4. 발주 등록
// ═══════════════════════════════════════════════════════════════
const SFormOrder = ({ onBack }) => {
  const [vendor, setVendor] = React.useState('동인의료');
  const [items, setItems] = React.useState([
    { n:'1회용 주사기 5cc', q:500, p:248, u:'개' },
    { n:'멸균거즈 4x4',    q:50,  p:680, u:'팩' },
  ]);
  const total = items.reduce((s,i) => s + i.q * i.p, 0);
  const updateQ = (i, v) => setItems(prev => prev.map((it,j) => j === i ? {...it, q: Math.max(0, parseInt(v) || 0)} : it));
  return (
    <div className="m-screen">
      <FormHeader onCancel={onBack} title="발주 등록" onSave={onBack} saveLabel="결재 올림"/>
      <div className="m-scroll">
        {/* 거래처 */}
        <div className="m-card flush" style={{borderRadius:0, border:'none'}}>
          <Field label="거래처" required>
            <div style={{display:'flex', alignItems:'center', gap:10, padding:'6px 0'}}>
              <MAvatar tone="cyan" size="sm">{vendor.charAt(0)}</MAvatar>
              <div style={{flex:1}}>
                <div style={{fontSize:14, fontWeight:800}}>{vendor}</div>
                <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>의료소모품 · 평균 배송 2일</div>
              </div>
              <button style={{color:'var(--accent)', fontSize:12, fontWeight:700}}>변경</button>
            </div>
          </Field>
        </div>

        {/* 품목 리스트 */}
        <div style={{padding:'14px 16px 0', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div style={{fontSize:11, fontWeight:800, color:'var(--z-500)', letterSpacing:'0.04em', textTransform:'uppercase'}}>품목 {items.length}</div>
          <button style={{display:'inline-flex', alignItems:'center', gap:4, fontSize:12, fontWeight:700, color:'var(--accent)'}}><MIcon name="plus" size={14}/>품목 추가</button>
        </div>
        <div style={{padding:'8px 16px 0', display:'flex', flexDirection:'column', gap:10}}>
          {items.map((it,i) => (
            <div key={i} className="m-card" style={{padding:'12px 14px'}}>
              <div style={{display:'flex', alignItems:'flex-start', gap:10}}>
                <div className="ico-tile" style={{width:32, height:32, background:'var(--z-100)', color:'var(--z-700)'}}><MIcon name="box" size={16}/></div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:14, fontWeight:800}}>{it.n}</div>
                  <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginTop:2}} className="m-tnum">단가 ₩{it.p}/{it.u}</div>
                </div>
                <button style={{color:'var(--z-400)'}}><MIcon name="x" size={16}/></button>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:8, marginTop:12}}>
                <div style={{display:'flex', alignItems:'center', gap:4, background:'var(--bg)', borderRadius:10, padding:4}}>
                  <button onClick={()=>updateQ(i, it.q-1)} style={{width:30, height:30, borderRadius:7, background:'var(--card)', display:'grid', placeItems:'center'}}><MIcon name="minus" size={14}/></button>
                  <input type="text" inputMode="numeric" value={it.q} onChange={e=>updateQ(i, e.target.value)}
                    style={{width:60, textAlign:'center', fontSize:15, fontWeight:800, padding:'6px 0'}} className="m-tnum"/>
                  <button onClick={()=>updateQ(i, it.q+1)} style={{width:30, height:30, borderRadius:7, background:'var(--card)', display:'grid', placeItems:'center'}}><MIcon name="plus" size={14}/></button>
                </div>
                <div style={{flex:1, textAlign:'right'}}>
                  <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>소계</div>
                  <div className="m-tnum" style={{fontSize:15, fontWeight:800}}>₩ {(it.q * it.p).toLocaleString()}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 배송/메모 */}
        <div className="m-card flush" style={{borderRadius:0, border:'none', marginTop:14}}>
          <Field label="배송 희망일">
            <input defaultValue="2026.05.30" placeholder="2026.05.30" style={{width:'100%', padding:'8px 0', fontSize:15, fontFamily:'inherit', color:'var(--z-900)'}}/>
          </Field>
          <Field label="배송지">
            <input defaultValue="서울 강남구 테헤란로 234, 5층" placeholder="서울 강남구 테헤란로 234, 5층 (1F 데스크)" style={{width:'100%', padding:'8px 0', fontSize:15, fontFamily:'inherit', color:'var(--z-900)'}}/>
          </Field>
          <Field label="요청 메모 (선택)">
            <Input placeholder="예: 오전 배송 부탁드립니다"/>
          </Field>
        </div>

        <div style={{height:120}}/>
      </div>
      {/* sticky 합계 + 발주 버튼 */}
      <div className="m-sticky-foot" style={{flexDirection:'column', gap:10, alignItems:'stretch'}}>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <div style={{fontSize:11, fontWeight:800, color:'var(--z-500)'}}>총 금액 (VAT 별도)</div>
          <div style={{flex:1, textAlign:'right'}} className="m-tnum">
            <span style={{fontSize:22, fontWeight:800, letterSpacing:'-0.025em', color:'var(--z-900)'}}>₩ {total.toLocaleString()}</span>
          </div>
        </div>
        <MBtn block variant="primary" icon="send" size="lg">결재 올리기</MBtn>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// FM 5. 연차 신청
// ═══════════════════════════════════════════════════════════════
const SFormLeave = ({ onBack }) => {
  const [v, setV] = React.useState({ kind:'연차', start:'2026.05.15', end:'2026.05.17', reason:'', approver:'박철홍' });
  const set = (k, val) => setV(prev => ({...prev, [k]: val}));
  return (
    <div className="m-screen">
      <FormHeader onCancel={onBack} title="연차 신청" onSave={onBack} saveLabel="결재 올림"/>
      <div className="m-scroll">
        <div style={{padding:'18px 16px 8px', background:'var(--card)', borderBottom:'1px solid var(--border)', textAlign:'center'}}>
          <div style={{fontSize:11, color:'var(--z-500)', fontWeight:800, letterSpacing:'0.04em'}}>잔여 연차</div>
          <div className="m-tnum" style={{fontSize:32, fontWeight:800, color:'var(--accent)', letterSpacing:'-0.03em', marginTop:4}}>11<span style={{fontSize:14, color:'var(--z-500)', fontWeight:700, marginLeft:3}}>일</span></div>
          <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginTop:4}}>신청 후 잔여 <b style={{color:'var(--z-900)'}}>8일</b></div>
        </div>

        <div className="m-card flush" style={{borderRadius:0, border:'none'}}>
          <Field label="휴가 종류">
            <SegRow value={v.kind} onPick={k=>set('kind', k)}
              options={[
                { id:'연차',   label:'연차' },
                { id:'반차',   label:'반차' },
                { id:'경조사', label:'경조사' },
                { id:'병가',   label:'병가' },
              ]}/>
          </Field>
          <Field label="시작일" required>
            <div style={{display:'flex', alignItems:'center', gap:8, padding:'6px 0'}}>
              <MIcon name="calendar" size={16} color="var(--accent)"/>
              <Input value={v.start} onChange={e=>set('start', e.target.value)}/>
            </div>
          </Field>
          <Field label="종료일" required sub="총 3일 (영업일 기준)">
            <div style={{display:'flex', alignItems:'center', gap:8, padding:'6px 0'}}>
              <MIcon name="calendar" size={16} color="var(--accent)"/>
              <Input value={v.end} onChange={e=>set('end', e.target.value)}/>
            </div>
          </Field>
          <Field label="사유 (선택)">
            <textarea
              rows={3}
              value={v.reason}
              onChange={e=>set('reason', e.target.value)}
              placeholder="예: 가족 여행"
              style={{width:'100%', padding:'8px 0', fontSize:14, fontFamily:'inherit', resize:'none', color:'var(--z-900)'}}
            />
          </Field>
          <Field label="결재자">
            <div style={{display:'flex', alignItems:'center', gap:10, padding:'6px 0'}}>
              <MAvatar tone="violet" size="sm">박</MAvatar>
              <div style={{flex:1}}>
                <div style={{fontSize:14, fontWeight:800}}>{v.approver}</div>
                <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>원장 · 자동 매핑</div>
              </div>
              <button style={{color:'var(--accent)', fontSize:12, fontWeight:700}}>변경</button>
            </div>
          </Field>
        </div>

        <div style={{padding:'14px 16px 24px'}}>
          <div className="m-card" style={{padding:'12px 14px', background:'var(--accent-soft)', borderColor:'transparent', display:'flex', alignItems:'center', gap:10}}>
            <MIcon name="alertCircle" size={18} color="var(--accent)"/>
            <div style={{flex:1, fontSize:12, fontWeight:700, color:'var(--accent)'}}>
              5/15(목) 외래 일정 1건 — 박○○ 환자 · 박유진 PA가 대체
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// FM 6. 게시판 글 작성
// ═══════════════════════════════════════════════════════════════
const SFormPost = ({ onBack }) => {
  const [v, setV] = React.useState({ cat:'공지', title:'', body:'', attach:0, pin:false, importance:'normal' });
  const set = (k, val) => setV(prev => ({...prev, [k]: val}));
  return (
    <div className="m-screen">
      <FormHeader onCancel={onBack} title="새 글 작성" onSave={onBack} saveLabel="게시" saveDisabled={!v.title}/>
      <div className="m-scroll">
        <div className="m-card flush" style={{borderRadius:0, border:'none'}}>
          <Field label="카테고리" required>
            <div style={{display:'flex', gap:6, marginTop:4, flexWrap:'wrap'}}>
              {['공지','자유','경조사','수술일정','MRI일정','업무공유'].map(c => (
                <button key={c} onClick={()=>set('cat', c)} style={{
                  padding:'8px 12px', borderRadius:999, fontSize:12, fontWeight:700,
                  background: v.cat === c ? 'var(--accent)' : 'var(--bg)',
                  color: v.cat === c ? '#fff' : 'var(--z-700)',
                }}>{c}</button>
              ))}
            </div>
          </Field>
          <Field label="제목" required>
            <Input value={v.title} onChange={e=>set('title', e.target.value)} placeholder="제목을 입력하세요" autoFocus/>
          </Field>
          <div style={{padding:'14px 16px 0', borderBottom:'1px solid var(--border)'}}>
            <textarea
              rows={10}
              value={v.body}
              onChange={e=>set('body', e.target.value)}
              placeholder="본문을 입력하세요 — Markdown 지원"
              style={{width:'100%', padding:'4px 0 16px', fontSize:14, fontFamily:'inherit', resize:'none', color:'var(--z-900)', lineHeight:1.7}}
            />
          </div>
        </div>

        {/* 옵션 */}
        <div className="m-section">
          <div className="m-section-h"><div className="lbl">옵션</div></div>
          <div className="m-card flush">
            <label className="m-list-row" style={{cursor:'pointer'}}>
              <div className="ico-tile tone-accent"><MIcon name="pin" size={18}/></div>
              <div>
                <div className="lbl">상단 고정</div>
                <div className="sub">목록 최상단에 노출</div>
              </div>
              <button onClick={()=>set('pin', !v.pin)} style={{
                width:44, height:24, borderRadius:999,
                background: v.pin ? 'var(--accent)' : 'var(--z-200)',
                position:'relative',
              }}>
                <span style={{position:'absolute', top:2, left: v.pin ? 22 : 2, width:20, height:20, borderRadius:999, background:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,0.2)', transition:'left .15s'}}/>
              </button>
            </label>
            <div className="m-list-row" onClick={()=>set('attach', v.attach + 1)} style={{cursor:'pointer'}}>
              <div className="ico-tile tone-accent"><MIcon name="paperclip" size={18}/></div>
              <div>
                <div className="lbl">첨부 파일</div>
                <div className="sub">{v.attach > 0 ? `${v.attach}개 첨부됨` : '사진·문서·PDF'}</div>
              </div>
              <MIcon name="chevR" size={18} color="var(--z-400)"/>
            </div>
            <div className="m-list-row">
              <div className="ico-tile tone-warning"><MIcon name="alertTri" size={18}/></div>
              <div>
                <div className="lbl">중요도</div>
                <div className="sub">긴급/일반</div>
              </div>
              <SegRow value={v.importance} onPick={i=>set('importance', i)}
                options={[
                  { id:'normal',  label:'일반' },
                  { id:'urgent',  label:'긴급' },
                ]}/>
            </div>
          </div>
        </div>
        <div style={{height:24}}/>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// FM 7. 채팅 — 새 대화 시작
// ═══════════════════════════════════════════════════════════════
const SFormChat = ({ onBack }) => {
  const [picked, setPicked] = React.useState({});
  const [q, setQ] = React.useState('');
  const [tab, setTab] = React.useState('member');
  const members = [
    { d:'경영지원팀', members:[
      { n:'백정민', role:'이사', tone:'blue' },
      { n:'이재훈', role:'이사', tone:'cyan' },
      { n:'박유진', role:'대리', tone:'pink' },
      { n:'홍자비', role:'사원', tone:'violet' },
    ]},
    { d:'영상의학팀', members:[
      { n:'김상민', role:'팀장', tone:'green' },
      { n:'최영빈', role:'기사', tone:'pink' },
    ]},
    { d:'간호부', members:[
      { n:'정해영', role:'팀장', tone:'orange' },
      { n:'김민서', role:'간호사', tone:'blue' },
    ]},
  ];
  const tot = members.flatMap(g => g.members).filter(m => m.n.includes(q) || !q);
  const pickedNames = Object.keys(picked).filter(k => picked[k]);
  return (
    <div className="m-screen">
      <FormHeader onCancel={onBack} title="새 대화" onSave={onBack} saveLabel={pickedNames.length === 0 ? '다음' : pickedNames.length === 1 ? '시작' : `그룹 시작 (${pickedNames.length})`} saveDisabled={pickedNames.length === 0}/>
      <div style={{padding:'10px 16px 0', background:'var(--card)', borderBottom:'1px solid var(--border)'}}>
        <div className="m-seg">
          <button className={tab==='member'?'on':''}  onClick={()=>setTab('member')}>구성원</button>
          <button className={tab==='org'?'on':''}     onClick={()=>setTab('org')}>조직도</button>
          <button className={tab==='channel'?'on':''} onClick={()=>setTab('channel')}>채널 생성</button>
        </div>
      </div>
      {/* 선택된 사람 */}
      {pickedNames.length > 0 && (
        <div style={{padding:'10px 16px', background:'var(--card)', borderBottom:'1px solid var(--border)', display:'flex', gap:6, overflowX:'auto'}}>
          {pickedNames.map(n => (
            <div key={n} style={{display:'inline-flex', alignItems:'center', gap:6, padding:'4px 6px 4px 8px', background:'var(--accent-soft)', borderRadius:999, fontSize:12, fontWeight:800, color:'var(--accent)', flex:'0 0 auto'}}>
              {n}
              <button onClick={()=>setPicked(p => ({...p, [n]: false}))} style={{width:18, height:18, borderRadius:'50%', background:'var(--accent)', color:'#fff', display:'grid', placeItems:'center'}}><MIcon name="x" size={11}/></button>
            </div>
          ))}
        </div>
      )}
      {/* 검색 */}
      <div style={{padding:'10px 16px', background:'var(--card)', borderBottom:'1px solid var(--border)'}}>
        <div style={{display:'flex', alignItems:'center', gap:8, background:'var(--bg)', borderRadius:10, padding:'8px 12px'}}>
          <MIcon name="search" size={16} color="var(--z-500)"/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="이름·부서·직급으로 검색" style={{flex:1, fontSize:14, fontFamily:'inherit'}}/>
        </div>
      </div>

      <div className="m-scroll">
        {tab === 'member' && (
          <div>
            {members.map((g,gi) => {
              const visible = g.members.filter(m => !q || m.n.includes(q));
              if (visible.length === 0) return null;
              return (
                <div key={gi}>
                  <div style={{padding:'14px 16px 6px', display:'flex', alignItems:'center', gap:6}}>
                    <span style={{fontSize:11, fontWeight:800, color:'var(--z-500)', letterSpacing:'0.04em', textTransform:'uppercase'}}>{g.d}</span>
                    <span style={{fontSize:11, color:'var(--z-400)', fontWeight:700}}>{visible.length}명</span>
                  </div>
                  <div className="m-card flush" style={{margin:'0 16px'}}>
                    {visible.map((m,j,arr) => (
                      <label key={j} className="m-list-row" style={{cursor:'pointer'}}>
                        <MAvatar tone={m.tone}>{m.n.charAt(0)}</MAvatar>
                        <div>
                          <div className="lbl">{m.n}</div>
                          <div className="sub">{g.d} · {m.role}</div>
                        </div>
                        <button onClick={(e)=>{e.preventDefault(); setPicked(p => ({...p, [m.n]: !p[m.n]}));}}
                          style={{width:22, height:22, borderRadius:6,
                            border: picked[m.n] ? 'none' : '1.5px solid var(--z-300)',
                            background: picked[m.n] ? 'var(--accent)' : 'transparent',
                            color:'#fff', display:'grid', placeItems:'center'}}>
                          {picked[m.n] && <MIcon name="check" size={14}/>}
                        </button>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
            <div style={{height:24}}/>
          </div>
        )}
        {tab === 'org' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {['경영지원팀 5명','영상의학팀 4명','간호부 8명','외래팀 6명','OP실 4명','행정팀 3명'].map((d,i,arr) => (
                <MListRow key={i} icon="users" iconTone="" label={d.split(' ')[0]} sub={d.split(' ')[1]}/>
              ))}
            </div>
          </div>
        )}
        {tab === 'channel' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush" style={{borderRadius:14, border:'1px solid var(--border)'}}>
              <Field label="채널명" required>
                <Input placeholder="예: 5월 OP 알림" autoFocus/>
              </Field>
              <Field label="목적">
                <Input placeholder="채널 설명"/>
              </Field>
              <Field label="유형">
                <SegRow value="open" onPick={()=>{}}
                  options={[
                    { id:'open',    label:'공개' },
                    { id:'private', label:'비공개' },
                    { id:'notice',  label:'공지전용' },
                  ]}/>
              </Field>
            </div>
            <div style={{padding:'14px 0'}}>
              <MBtn block variant="primary" icon="plus">채널 생성</MBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, {
  SFormMember, SFormItem, SFormAsset, SFormOrder, SFormLeave, SFormPost, SFormChat,
});
