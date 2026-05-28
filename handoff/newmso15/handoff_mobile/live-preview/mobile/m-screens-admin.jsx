// MSO 모바일 — Screens (Admin) : 시스템 마스터 · 회사 · 권한 · 운영 · 양식 · 감사
// (경영 대시보드는 m-screens-2.jsx 의 SExec 사용)
// DesktopHint 는 m-screens-hr.jsx 에서 정의됨.

// ═══════════════════════════════════════════════════════════════
// Admin 1. 시스템 마스터 (master) — 마스터 운영 / 진단
// ═══════════════════════════════════════════════════════════════
const SAdminMaster = ({ onBack }) => {
  const [tab, setTab] = React.useState('ops');
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="시스템 마스터" sub="MSO 전체 운영 콘솔"
        actions={<button><MIcon name="refresh" size={20}/></button>}/>
      <div className="m-chip-bar">
        <button className={tab==='ops'?'on':''}    onClick={()=>setTab('ops')}>운영</button>
        <button className={tab==='log'?'on':''}    onClick={()=>setTab('log')}>변경이력</button>
        <button className={tab==='check'?'on':''}  onClick={()=>setTab('check')}>정합성</button>
        <button className={tab==='backup'?'on':''} onClick={()=>setTab('backup')}>복구</button>
        <button className={tab==='filter'?'on':''} onClick={()=>setTab('filter')}>채팅 필터</button>
        <button className={tab==='leave'?'on':''}  onClick={()=>setTab('leave')}>연차 수정</button>
      </div>
      <div className="m-scroll">
        {tab === 'ops' && (
          <>
            <div style={{padding:'14px 16px 0', display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
              {[
                { l:'DAU',        v:'29', sub:'활성 32명 중',     tone:'success' },
                { l:'채팅 24h',   v:'4,892', sub:'전사',           tone:'accent' },
                { l:'결재 진행중',v:'14', sub:'24h 초과 2',       tone:'warning' },
                { l:'자동 발주',  v:'38', sub:'이번 주',           tone:'success' },
                { l:'푸시 실패',  v:'7',  sub:'iOS 토큰 만료',    tone:'danger' },
                { l:'크론 잡',    v:'12', sub:'모두 정상',         tone:'success' },
              ].map((k,i) => (
                <div key={i} className="m-card" style={{padding:'12px 14px'}}>
                  <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{k.l}</div>
                  <div className="m-tnum" style={{fontSize:22, fontWeight:800, letterSpacing:'-0.025em', marginTop:4, color: k.tone === 'danger' ? 'var(--danger)' : k.tone === 'warning' ? 'var(--warning)' : 'var(--z-900)'}}>{k.v}</div>
                  <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginTop:2}}>{k.sub}</div>
                </div>
              ))}
            </div>
            <div className="m-section">
              <div className="m-section-h"><div className="lbl">최근 실행 잡</div></div>
              <div className="m-card flush">
                {[
                  { n:'cron · payroll-monthly', s:'성공', ts:'05/01 02:00', tone:'success' },
                  { n:'cron · stock-forecast',  s:'성공', ts:'매일 03:00',  tone:'success' },
                  { n:'cron · push-retry',      s:'실패', ts:'4분 전',       tone:'danger', m:'APNs 토큰 만료 7건' },
                  { n:'cron · backup-incr',     s:'성공', ts:'1시간 전',     tone:'success' },
                ].map((r,i,arr) => (
                  <div key={i} className="m-list-row">
                    <div className={'ico-tile tone-'+(r.tone)}><MIcon name={r.tone === 'success' ? 'checkCircle' : 'alertTri'} size={18}/></div>
                    <div>
                      <div className="lbl">{r.n}</div>
                      <div className="sub">{r.ts}{r.m ? ' · ' + r.m : ''}</div>
                    </div>
                    <MChip tone={r.tone}>{r.s}</MChip>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {tab === 'log' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { cat:'권한',   who:'백정민', t:'홍자비 → 결재담당 추가', ts:'14:22', tone:'accent' },
                { cat:'급여',   who:'박유진', t:'5월 야근수당 정책 변경',  ts:'13:08', tone:'warning' },
                { cat:'인사',   who:'백정민', t:'정수아 부서이동 (영상→경영)', ts:'어제',  tone:'' },
                { cat:'재고',   who:'시스템', t:'안전재고 자동 조정 12품목', ts:'어제', tone:'' },
                { cat:'백업',   who:'시스템', t:'증분 백업 완료 (2.4GB)',   ts:'어제',  tone:'success' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <MChip tone={r.tone}>{r.cat}</MChip>
                  <div>
                    <div className="lbl" style={{fontSize:13}}>{r.t}</div>
                    <div className="sub">{r.who} · {r.ts}</div>
                  </div>
                  <MIcon name="chevR" size={18} color="var(--z-400)"/>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'check' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card" style={{padding:'14px 14px', marginBottom:12, background:'var(--success-soft)', borderColor:'transparent'}}>
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <MIcon name="checkCircle" size={22} color="var(--success)"/>
                <div>
                  <div style={{fontSize:13, fontWeight:800, color:'var(--success)'}}>전체 정상 · 진단 8/8 통과</div>
                  <div style={{fontSize:11, color:'var(--z-600)', fontWeight:600, marginTop:1}}>마지막 점검: 12분 전</div>
                </div>
              </div>
            </div>
            <div className="m-card flush">
              {[
                { n:'DB 정합성',         s:'정상', tone:'success' },
                { n:'결재 흐름 무결성',   s:'정상', tone:'success' },
                { n:'급여 정산 무결성',   s:'정상', tone:'success' },
                { n:'근태 시프트 정합성', s:'정상', tone:'success' },
                { n:'재고 장부 정합성',   s:'주의 3', tone:'warning' },
                { n:'권한 매트릭스',     s:'정상', tone:'success' },
                { n:'외부 연동 (5)',     s:'정상', tone:'success' },
                { n:'iOS 푸시 토큰',     s:'심각 7', tone:'danger' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <div className={'ico-tile tone-'+(r.tone)}><MIcon name={r.tone === 'success' ? 'check' : 'alertTri'} size={18}/></div>
                  <div className="lbl">{r.n}</div>
                  <MChip tone={r.tone}>{r.s}</MChip>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'backup' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card" style={{padding:'14px 14px', marginBottom:12}}>
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>마지막 백업</div>
                  <div style={{fontSize:15, fontWeight:800, marginTop:2}}>1시간 전 · 증분 2.4GB</div>
                </div>
                <MChip tone="success" dot>정상</MChip>
              </div>
              <div style={{display:'flex', gap:8, marginTop:12}}>
                <MBtn block>전체 백업</MBtn>
                <MBtn block icon="download" variant="primary">즉시 백업</MBtn>
              </div>
            </div>
            <DesktopHint tone="warning">복구는 데스크톱 + 2단계 인증 필수</DesktopHint>
            <div className="m-section-h" style={{padding:'18px 0 8px'}}><div className="lbl">백업 이력</div></div>
            <div className="m-card flush">
              {[
                { ts:'05/11 14:00', t:'증분',   sz:'2.4 GB',  s:'성공', tone:'success' },
                { ts:'05/11 03:00', t:'증분',   sz:'1.8 GB',  s:'성공', tone:'success' },
                { ts:'05/10 03:00', t:'증분',   sz:'2.1 GB',  s:'성공', tone:'success' },
                { ts:'05/04 03:00', t:'전체',   sz:'48.2 GB', s:'성공', tone:'success' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <div className="ico-tile tone-success"><MIcon name="download" size={18}/></div>
                  <div>
                    <div className="lbl">{r.t} · {r.sz}</div>
                    <div className="sub">{r.ts}</div>
                  </div>
                  <MChip tone={r.tone}>{r.s}</MChip>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'filter' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card" style={{padding:'14px 14px', marginBottom:12}}>
              <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>전체 채팅방 실시간 스캔</div>
              <div style={{display:'flex', alignItems:'baseline', gap:6, marginTop:4}}>
                <div className="m-tnum" style={{fontSize:24, fontWeight:800, letterSpacing:'-0.025em'}}>14</div>
                <div style={{fontSize:12, color:'var(--z-500)', fontWeight:700}}>금지어 / 24h 매칭 <b style={{color:'var(--danger)'}}>3건</b></div>
              </div>
            </div>
            <div className="m-section-h"><div className="lbl">등록된 금지어 14</div></div>
            <div className="m-card flush">
              {[
                { w:'무능',      cnt:2, last:'5/11 14:22', tone:'danger' },
                { w:'바보',      cnt:1, last:'5/10',       tone:'warning' },
                { w:'XX 의료',   cnt:0, last:'-',          tone:'' },
                { w:'(개인정보 패턴 · 정규식 4)', cnt:0, last:'-', tone:'' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <MChip tone={r.tone || ''}>{r.cnt}</MChip>
                  <div>
                    <div className="lbl">{r.w}</div>
                    <div className="sub">최근 매칭: {r.last}</div>
                  </div>
                  <MIcon name="x" size={16} color="var(--z-400)"/>
                </div>
              ))}
            </div>
            <div className="m-section-h" style={{padding:'18px 0 8px'}}><div className="lbl">플래그된 채팅방</div></div>
            <div className="m-card flush">
              {[
                { r:'경영지원팀', wd:'무능',  who:'홍자비', ts:'5/11 14:22' },
                { r:'영상의학팀', wd:'바보',  who:'(미상)', ts:'5/10 09:18' },
              ].map((m,i,arr) => (
                <div key={i} className="m-list-row">
                  <div className="ico-tile tone-danger"><MIcon name="alertTri" size={18}/></div>
                  <div>
                    <div className="lbl">{m.r} <MChip tone="danger">"{m.wd}"</MChip></div>
                    <div className="sub">{m.who} · {m.ts}</div>
                  </div>
                  <MBtn size="sm">확인</MBtn>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'leave' && (
          <div style={{padding:'14px 16px 0'}}>
            <DesktopHint tone="warning">연차 수정은 감사 로그가 남습니다 · 2단계 인증 후 실행</DesktopHint>
            <div className="m-section-h" style={{padding:'14px 0 8px'}}><div className="lbl">최근 연차 수정 이력</div></div>
            <div className="m-card flush">
              {[
                { who:'홍자비', t:'잔여 5 → 8',  why:'입사일 정정',         by:'백정민', ts:'5/3' },
                { who:'정수아', t:'잔여 12 → 11', why:'4/30 반차 누락 보정', by:'박유진', ts:'4/30' },
                { who:'박철홍', t:'잔여 15 → 14', why:'특별휴가 차감',       by:'백정민', ts:'4/22' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <MAvatar tone={['pink','blue','violet'][i]} size="sm">{r.who.charAt(0)}</MAvatar>
                  <div>
                    <div className="lbl">{r.who} <span style={{fontSize:11, color:'var(--accent)', fontWeight:700, marginLeft:4}}>{r.t}</span></div>
                    <div className="sub">{r.why} · {r.by} · {r.ts}</div>
                  </div>
                  <MIcon name="chevR" size={18} color="var(--z-400)"/>
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
// Admin 2. 회사 관리 (company)
// ═══════════════════════════════════════════════════════════════
const SAdminCompany = ({ onBack }) => {
  const [tab, setTab] = React.useState('info');
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="회사 관리" sub="박철홍정형외과"/>
      <div className="m-chip-bar">
        <button className={tab==='info'?'on':''}     onClick={()=>setTab('info')}>기본정보</button>
        <button className={tab==='work'?'on':''}     onClick={()=>setTab('work')}>근무형태</button>
        <button className={tab==='card'?'on':''}     onClick={()=>setTab('card')}>법인카드</button>
        <button className={tab==='ctr'?'on':''}      onClick={()=>setTab('ctr')}>계약 템플릿</button>
        <button className={tab==='holiday'?'on':''}  onClick={()=>setTab('holiday')}>휴가/공휴일</button>
        <button className={tab==='pay'?'on':''}      onClick={()=>setTab('pay')}>급여기준</button>
        <button className={tab==='vault'?'on':''}    onClick={()=>setTab('vault')}>문서 보관</button>
      </div>
      <DesktopHint>회사 정보 편집은 데스크톱에서 — 모바일은 조회만</DesktopHint>
      <div className="m-scroll">
        {tab === 'info' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { l:'회사명',     v:'박철홍정형외과의원' },
                { l:'사업자번호', v:'123-45-67890' },
                { l:'대표자',     v:'박철홍' },
                { l:'개원일',     v:'2018.03.02' },
                { l:'주소',       v:'서울 강남구 테헤란로 234, 5층' },
                { l:'대표 연락처', v:'02-580-1234' },
                { l:'직원 수',    v:'32명' },
              ].map((r,i,arr) => (
                <div key={i} style={{display:'grid', gridTemplateColumns:'92px 1fr', padding:'12px 16px', borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none', gap:10}}>
                  <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{r.l}</div>
                  <div style={{fontSize:13, fontWeight:700, color:'var(--z-900)'}}>{r.v}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'work' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { n:'D · 주간 (정규)',  m:'09:00 – 18:00', cnt:18 },
                { n:'N · 야간 당직',    m:'18:00 – 09:00', cnt:4 },
                { n:'H · 반일 (오전)',  m:'09:00 – 13:00', cnt:6 },
                { n:'P · 시간제',      m:'유동',           cnt:4 },
              ].map((r,i,arr) => (
                <MListRow key={i} icon="clock" label={r.n} sub={r.m} val={r.cnt} valUnit="명"/>
              ))}
            </div>
          </div>
        )}
        {tab === 'card' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { n:'법인 BC카드 9821', h:'백정민', l:'₩ 3,000,000', u:'1,840,000', tone:'success' },
                { n:'법인 신한 4422',   h:'박철홍', l:'₩ 5,000,000', u:'4,820,000', tone:'warning' },
                { n:'법인 우리 7710',   h:'박유진', l:'₩ 1,500,000', u:'320,000',   tone:'' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <div className={'ico-tile tone-'+(r.tone || '')}><MIcon name="won" size={18}/></div>
                  <div>
                    <div className="lbl">{r.n}</div>
                    <div className="sub">{r.h} · 한도 {r.l}</div>
                  </div>
                  <div className="val m-tnum" style={{color: r.tone === 'warning' ? 'var(--warning)' : 'var(--z-900)'}}>{r.u}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'ctr' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { n:'정규직 근로계약서 v3.1',    u:'8회', tone:'accent' },
                { n:'계약직 근로계약서 v2.4',    u:'3회', tone:'' },
                { n:'시간제 근로계약서 v1.8',    u:'5회', tone:'' },
                { n:'비밀유지서약서 v2.0',      u:'32회', tone:'' },
                { n:'개인정보처리 동의서 v1.5', u:'32회', tone:'' },
              ].map((r,i,arr) => (
                <MListRow key={i} icon="fileText" iconTone={r.tone} label={r.n} sub={'사용 ' + r.u}/>
              ))}
            </div>
          </div>
        )}
        {tab === 'holiday' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { d:'2026.05.05', n:'어린이날',     t:'공휴일', tone:'danger' },
                { d:'2026.05.13', n:'석가탄신일',   t:'공휴일', tone:'danger' },
                { d:'2026.06.06', n:'현충일',       t:'공휴일', tone:'danger' },
                { d:'2026.05.20', n:'개원 기념일',  t:'회사휴무', tone:'accent' },
                { d:'2026.07.31', n:'여름 휴가 시작', t:'권장기간', tone:'success' },
              ].map((r,i,arr) => (
                <MListRow key={i} icon="calendar" iconTone={r.tone} label={r.n} sub={r.d} val={r.t}/>
              ))}
            </div>
          </div>
        )}
        {tab === 'pay' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { l:'급여 지급일',       v:'매월 25일' },
                { l:'정산 기준',         v:'전월 1일 ~ 말일' },
                { l:'야근 가산율',       v:'150%' },
                { l:'휴일 근무 가산율',  v:'200%' },
                { l:'식대 (비과세)',     v:'월 200,000원' },
                { l:'4대보험 기준',      v:'2026년 표준' },
              ].map((r,i,arr) => (
                <div key={i} style={{display:'grid', gridTemplateColumns:'128px 1fr', padding:'12px 16px', borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none', gap:10}}>
                  <div style={{fontSize:12, color:'var(--z-500)', fontWeight:700}}>{r.l}</div>
                  <div style={{fontSize:13, fontWeight:700, color:'var(--z-900)'}}>{r.v}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'vault' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card" style={{padding:'14px 14px', marginBottom:12}}>
              <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>총 보관 문서</div>
              <div className="m-tnum" style={{fontSize:24, fontWeight:800, letterSpacing:'-0.025em', marginTop:4}}>1,842<span style={{fontSize:12, color:'var(--z-500)', fontWeight:700, marginLeft:6}}>건 · 12.4 GB</span></div>
            </div>
            <div className="m-card flush">
              {[
                { n:'근로계약서',        c:42,  e:'영구 보존',   tone:'success' },
                { n:'급여대장',          c:240, e:'5년 보존',    tone:'success' },
                { n:'환자 동의서',       c:412, e:'10년 보존',   tone:'success' },
                { n:'영상 판독지',       c:892, e:'10년 보존',   tone:'success' },
                { n:'외부 협력 계약',    c:18,  e:'영구 보존',   tone:'success' },
                { n:'세금계산서',        c:174, e:'5년 보존',    tone:'success' },
                { n:'임시 보관',         c:64,  e:'30일 후 삭제', tone:'warning' },
              ].map((r,i,arr) => (
                <MListRow key={i} icon="fileText" iconTone={r.tone} label={r.n} sub={r.e} val={r.c} valUnit="건"/>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// Admin 3. 권한 관리 (roles)
// ═══════════════════════════════════════════════════════════════
const SAdminRoles = ({ onBack }) => {
  const roles = [
    { n:'대표',           c:1,  m:['전체'],                         tone:'danger' },
    { n:'경영지원 (이사)', c:2,  m:['결재','HR','재고','회사관리'],   tone:'accent' },
    { n:'팀장',           c:4,  m:['결재 1차','HR 조회','재고 입출고'], tone:'success' },
    { n:'급여 담당',      c:1,  m:['급여 정산','대장 조회'],          tone:'warning' },
    { n:'재고 담당',      c:2,  m:['재고 전체','발주','거래처'],       tone:'success' },
    { n:'일반 직원',      c:22, m:['본인 결재','본인 명세서','본인 근태'], tone:'' },
  ];
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="권한 관리" sub="역할 6개 · 직원 32명"/>
      <DesktopHint>역할 × 모듈 매트릭스 편집은 데스크톱에서</DesktopHint>
      <div className="m-scroll">
        <div style={{padding:'14px 16px 0', display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8}}>
          {[
            { l:'권한 요청', v:3, tone:'warning' },
            { l:'예외 권한', v:7, tone:'' },
          ].map((k,i) => (
            <div key={i} className="m-card" style={{padding:'12px 14px'}}>
              <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{k.l}</div>
              <div className="m-tnum" style={{fontSize:22, fontWeight:800, letterSpacing:'-0.025em', marginTop:4, color: k.tone === 'warning' ? 'var(--warning)' : 'var(--z-900)'}}>{k.v}<span style={{fontSize:11, color:'var(--z-500)', fontWeight:700, marginLeft:3}}>건</span></div>
            </div>
          ))}
        </div>
        <div className="m-section-h" style={{padding:'12px 16px 8px'}}><div className="lbl">역할</div></div>
        <div style={{padding:'0 16px 16px', display:'flex', flexDirection:'column', gap:10}}>
          {roles.map((r,i) => (
            <div key={i} className="m-card" style={{padding:'14px 16px'}}>
              <div style={{display:'flex', alignItems:'center', gap:8}}>
                <div className={'ico-tile tone-'+(r.tone || '')} style={{width:36, height:36}}><MIcon name="shield" size={18}/></div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:14, fontWeight:800, letterSpacing:'-0.012em'}}>{r.n}</div>
                  <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginTop:1}}>{r.c}명</div>
                </div>
                <MIcon name="chevR" size={18} color="var(--z-400)"/>
              </div>
              <div style={{display:'flex', gap:4, marginTop:10, flexWrap:'wrap'}}>
                {r.m.map((mm,j) => <MChip key={j} tone={j === 0 ? r.tone : ''}>{mm}</MChip>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// Admin 4. 운영 설정 (ops) — 일반 / 메시지템플릿 / 팝업 / 외부연동
// ═══════════════════════════════════════════════════════════════
const SAdminOps = ({ onBack }) => {
  const [tab, setTab] = React.useState('general');
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="운영 설정" sub="박철홍정형외과"/>
      <div className="m-chip-bar">
        <button className={tab==='general'?'on':''} onClick={()=>setTab('general')}>일반</button>
        <button className={tab==='msg'?'on':''}     onClick={()=>setTab('msg')}>메시지 12</button>
        <button className={tab==='popup'?'on':''}   onClick={()=>setTab('popup')}>팝업</button>
        <button className={tab==='int'?'on':''}     onClick={()=>setTab('int')}>외부연동 6</button>
      </div>
      <DesktopHint>편집은 데스크톱에서 — 모바일은 조회만</DesktopHint>
      <div className="m-scroll">
        {tab === 'general' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { l:'기본 언어',         v:'한국어' },
                { l:'시간대',           v:'Asia/Seoul (KST)' },
                { l:'주 시작일',        v:'월요일' },
                { l:'화폐 단위',        v:'KRW · 원' },
                { l:'세션 만료',        v:'30분' },
                { l:'PWA 푸시 알림',    v:'활성' },
              ].map((r,i,arr) => (
                <div key={i} style={{display:'grid', gridTemplateColumns:'120px 1fr auto', padding:'13px 16px', borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none', gap:10, alignItems:'center'}}>
                  <div style={{fontSize:12, color:'var(--z-500)', fontWeight:700}}>{r.l}</div>
                  <div style={{fontSize:13, fontWeight:700}}>{r.v}</div>
                  <MIcon name="chevR" size={16} color="var(--z-400)"/>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'msg' && (
          <div style={{padding:'14px 16px 0'}}>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12}}>
              {[
                { n:'템플릿 a · 결재', c:4, tone:'accent' },
                { n:'템플릿 b · 알림', c:5, tone:'success' },
                { n:'템플릿 c · 마케팅', c:3, tone:'warning' },
              ].map((g,i) => (
                <div key={i} className="m-card" style={{padding:'10px 10px'}}>
                  <div style={{fontSize:10, color:'var(--z-500)', fontWeight:700, lineHeight:1.4}}>{g.n}</div>
                  <div className="m-tnum" style={{fontSize:18, fontWeight:800, color: g.tone === 'accent' ? 'var(--accent)' : g.tone === 'success' ? 'var(--success)' : 'var(--warning)', marginTop:2}}>{g.c}</div>
                </div>
              ))}
            </div>
            <div className="m-card flush">
              {[
                { n:'결재 알림',         g:'a', ch:'이메일·푸시', u:124, tone:'accent' },
                { n:'결재 24h 초과 알림', g:'a', ch:'슬랙',       u:8,  tone:'accent' },
                { n:'근태 이상 알림',     g:'b', ch:'이메일',     u:18, tone:'warning' },
                { n:'급여 명세 발송',     g:'b', ch:'이메일',     u:27, tone:'' },
                { n:'증명서 발급 완료',   g:'b', ch:'카카오톡',   u:86, tone:'' },
                { n:'재고 부족 경고',     g:'b', ch:'슬랙',       u:42, tone:'danger' },
                { n:'생일 축하 메시지',   g:'c', ch:'카카오톡',   u:22, tone:'success' },
                { n:'분기 환자 안내',     g:'c', ch:'카카오톡',   u:412, tone:'' },
                { n:'개원 기념 안내',     g:'c', ch:'카카오톡',   u:32, tone:'' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <MChip tone={r.g === 'a' ? 'accent' : r.g === 'b' ? 'success' : 'warning'}>{r.g}</MChip>
                  <div>
                    <div className="lbl">{r.n}</div>
                    <div className="sub">{r.ch} · 사용 {r.u}</div>
                  </div>
                  <MIcon name="chevR" size={18} color="var(--z-400)"/>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'popup' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { n:'5월 운영 시간 변경 안내', s:'활성', tone:'success', exp:'5/31까지' },
                { n:'개원 기념일 휴무',       s:'예약', tone:'warning', exp:'5/20 시작' },
                { n:'2026 신년 인사',         s:'완료', tone:'',       exp:'1/15 종료' },
              ].map((r,i,arr) => (
                <MListRow key={i} icon="alertCircle" iconTone={r.tone || ''} label={r.n} sub={r.exp} right={<MChip tone={r.tone}>{r.s}</MChip>}/>
              ))}
            </div>
          </div>
        )}
        {tab === 'int' && (
          <div style={{padding:'14px 16px 0', display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
            {[
              { n:'카카오톡',  s:'연결', tone:'success', ic:'chat',     d:'알림톡 발송' },
              { n:'네이버웍스', s:'연결', tone:'success', ic:'chat',     d:'캘린더 동기화' },
              { n:'슬랙',     s:'연결', tone:'success', ic:'chat',     d:'관리자 채널' },
              { n:'홈택스',    s:'연결', tone:'success', ic:'won',      d:'전자세금계산서' },
              { n:'EDI',      s:'대기', tone:'warning', ic:'fileText', d:'발주 EDI 4사' },
              { n:'국민은행',  s:'끊김', tone:'danger',  ic:'won',      d:'펌뱅킹' },
            ].map((r,i) => (
              <div key={i} className="m-card" style={{padding:'14px 14px'}}>
                <div className={'ico-tile tone-'+(r.tone)} style={{width:36, height:36}}><MIcon name={r.ic} size={18}/></div>
                <div style={{fontSize:13, fontWeight:800, marginTop:10}}>{r.n}</div>
                <div style={{fontSize:11, color:'var(--z-500)', fontWeight:600, marginTop:2}}>{r.d}</div>
                <div style={{marginTop:8}}><MChip tone={r.tone} dot>{r.s}</MChip></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// Admin 5. 결재 양식 (forms)
// ═══════════════════════════════════════════════════════════════
const SAdminForms = ({ onBack }) => {
  const forms = [
    { n:'법인카드 사용 결의서', g:'재무', u:124, v:'v3.1', s:'active' },
    { n:'야근수당 신청서',     g:'근태', u:86,  v:'v2.4', s:'active' },
    { n:'연차 사용 신청서',     g:'근태', u:178, v:'v2.0', s:'active' },
    { n:'외부 강의 신청',      g:'교육', u:12,  v:'v1.2', s:'active' },
    { n:'경조사 지원 신청',    g:'복지', u:34,  v:'v1.8', s:'active' },
    { n:'재고 발주 결의서',     g:'재고', u:62,  v:'v2.2', s:'active' },
    { n:'장비 점검 보고서',    g:'재고', u:18,  v:'v1.0', s:'권한 필요', tone:'warning' },
    { n:'퇴직금 정산서',       g:'급여', u:4,   v:'v3.0', s:'active' },
    { n:'급여 변경 신청',      g:'급여', u:6,   v:'v1.1', s:'draft', tone:'' },
    { n:'개인정보 처리 동의',  g:'법무', u:32,  v:'v1.5', s:'active' },
    { n:'환자 동의서',         g:'진료', u:412, v:'v2.1', s:'active' },
    { n:'영상 판독 의뢰',      g:'진료', u:24,  v:'v1.0', s:'active' },
    { n:'장비 폐기 신청',      g:'재고', u:3,   v:'v1.0', s:'보류',     tone:'warning' },
    { n:'외부 협력 계약서',    g:'법무', u:8,   v:'v2.0', s:'active' },
  ];
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="결재 양식" sub={'총 ' + forms.length + '종'} actions={<button><MIcon name="search" size={20}/></button>}/>
      <DesktopHint>양식 신규/편집은 데스크톱에서</DesktopHint>
      <div className="m-scroll">
        <div style={{padding:'14px 16px 16px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
          {forms.map((f,i) => (
            <div key={i} className="m-card" style={{padding:'12px 12px', position:'relative'}}>
              <MChip tone="">{f.g}</MChip>
              <div style={{fontSize:13, fontWeight:800, marginTop:8, letterSpacing:'-0.012em', lineHeight:1.35, minHeight: 36}}>{f.n}</div>
              <div style={{display:'flex', alignItems:'center', gap:6, marginTop:8}}>
                <span className="m-tnum" style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{f.v}</span>
                <span style={{fontSize:11, color:'var(--z-300)'}}>·</span>
                <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>{f.u}회 사용</span>
                <div style={{flex:1}}/>
                {f.s !== 'active' && <MChip tone={f.tone || ''}>{f.s}</MChip>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// Admin 6. 감사·백업 (audit)
// ═══════════════════════════════════════════════════════════════
const SAdminAudit = ({ onBack }) => {
  const [tab, setTab] = React.useState('log');
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="감사·백업" sub="박철홍정형외과"/>
      <div className="m-chip-bar">
        <button className={tab==='log'?'on':''}     onClick={()=>setTab('log')}>감사 로그</button>
        <button className={tab==='anomaly'?'on':''} onClick={()=>setTab('anomaly')}>이상감지 3</button>
        <button className={tab==='payroll'?'on':''} onClick={()=>setTab('payroll')}>급여 이상치</button>
        <button className={tab==='backup'?'on':''}  onClick={()=>setTab('backup')}>백업·DR</button>
      </div>
      <div className="m-scroll">
        {tab === 'log' && (
          <div style={{padding:'14px 16px 0'}}>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12}}>
              {[
                { l:'심각',   v:1, tone:'danger' },
                { l:'경고',   v:7, tone:'warning' },
                { l:'정보',   v:248, tone:'' },
              ].map((k,i) => (
                <div key={i} className="m-card" style={{padding:'12px 12px'}}>
                  <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700}}>{k.l}</div>
                  <div className="m-tnum" style={{fontSize:22, fontWeight:800, letterSpacing:'-0.025em', marginTop:4, color: k.tone === 'danger' ? 'var(--danger)' : k.tone === 'warning' ? 'var(--warning)' : 'var(--z-900)'}}>{k.v}</div>
                </div>
              ))}
            </div>
            <div className="m-card flush">
              {[
                { sev:'심각', t:'관리자 권한 부여',        who:'백정민',  o:'홍자비',     ts:'14:22', tone:'danger' },
                { sev:'경고', t:'급여 정책 변경 (야근수당)', who:'박유진',  o:'5월 정책',   ts:'13:08', tone:'warning' },
                { sev:'경고', t:'역할 매트릭스 수정',       who:'백정민',  o:'팀장 권한',   ts:'어제',  tone:'warning' },
                { sev:'정보', t:'재고 발주 자동 실행',      who:'시스템',  o:'3건',        ts:'어제',  tone:'' },
                { sev:'정보', t:'백업 완료',              who:'시스템',  o:'2.4GB',      ts:'어제',  tone:'success' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <MChip tone={r.tone}>{r.sev}</MChip>
                  <div>
                    <div className="lbl">{r.t}</div>
                    <div className="sub">{r.who} · {r.o} · {r.ts}</div>
                  </div>
                  <MIcon name="chevR" size={18} color="var(--z-400)"/>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'anomaly' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card flush">
              {[
                { sev:'심각', t:'iOS 푸시 토큰 만료 7건',     m:'4시간 내 갱신 안되면 알림 누락 발생', tone:'danger',  ts:'12분 전' },
                { sev:'경고', t:'재고 장부 불일치 (3품목)',    m:'실사 완료 시 자동 해소',             tone:'warning', ts:'어제' },
                { sev:'경고', t:'결재 24h 초과 2건',          m:'야간근무·연차 신청',                   tone:'warning', ts:'어제' },
              ].map((r,i,arr) => (
                <div key={i} className="m-list-row">
                  <div className={'ico-tile tone-'+(r.tone)}><MIcon name="alertTri" size={18}/></div>
                  <div>
                    <div className="lbl">{r.t}</div>
                    <div className="sub">{r.m} · {r.ts}</div>
                  </div>
                  <MBtn size="sm">처리</MBtn>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'payroll' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card" style={{padding:'14px 14px', marginBottom:12, background:'var(--success-soft)', borderColor:'transparent'}}>
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <MIcon name="checkCircle" size={22} color="var(--success)"/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13, fontWeight:800, color:'var(--success)'}}>5월 급여 무결성 통과</div>
                  <div style={{fontSize:11, color:'var(--z-600)', fontWeight:600, marginTop:1}}>이상치 0건 — 검증 16/16 항목</div>
                </div>
              </div>
            </div>
            <div className="m-card flush">
              {[
                { l:'4월 야근수당 정합성', v:'정상',  s:'전월 동일 패턴' },
                { l:'정규/계약 비율',     v:'정상',  s:'편차 < 1%' },
                { l:'4대보험 산정 기준',  v:'정상',  s:'2026년 기준' },
                { l:'식대 비과세 적용',   v:'정상',  s:'200,000원 통일' },
                { l:'급여 일자 정합성',   v:'정상',  s:'전원 25일 지급' },
              ].map((r,i,arr) => (
                <MListRow key={i} icon="checkCircle" iconTone="success" label={r.l} sub={r.s} val={r.v}/>
              ))}
            </div>
          </div>
        )}
        {tab === 'backup' && (
          <div style={{padding:'14px 16px 0'}}>
            <div className="m-card" style={{padding:'16px 18px', background:'linear-gradient(135deg, var(--accent), #1D4ED8)', borderColor:'transparent', color:'#fff'}}>
              <div style={{fontSize:11, fontWeight:800, opacity:0.85, letterSpacing:'0.04em'}}>DR 가동률</div>
              <div className="m-tnum" style={{fontSize:32, fontWeight:800, letterSpacing:'-0.03em', marginTop:4}}>99.97%</div>
              <div style={{fontSize:11, opacity:0.85, marginTop:2}}>RPO 1시간 · RTO 4시간</div>
            </div>
            <div className="m-section-h" style={{padding:'18px 0 8px'}}><div className="lbl">최근 복구 이력</div></div>
            <div className="m-card flush">
              <MListRow icon="refresh" iconTone="success" label="실제 복구 테스트 (분기)" sub="4/2 11:30 · 22분 소요" val="성공"/>
              <MListRow icon="refresh" iconTone="success" label="DR 사이트 동기화 확인"  sub="매주 일요일 03:00" val="성공"/>
            </div>
            <DesktopHint tone="warning">실제 복구·DR 전환은 데스크톱 + 2단계 인증</DesktopHint>
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { SAdminMaster, SAdminCompany, SAdminRoles, SAdminOps, SAdminForms, SAdminAudit });
