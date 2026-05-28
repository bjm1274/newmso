// MSO redesign — 재고관리 (Stock)
// 7장 → 4개 통합 워크센터

// ═══════════════════════════════════════════════════════════════════
// 서브메뉴 정의
// ═══════════════════════════════════════════════════════════════════

const STOCK_SUBMENUS = {
  status:  { id:'status',  label:'재고 현황',     icon:'inventory', merge:['재고현황', '내 부서 재고', '재고 알림', '유효기간 알림'], cnt: 4, primary:true },
  io:      { id:'io',      label:'입출고·발주',   icon:'arrowDown', merge:['입출고관리', '구매 발주', '거래처관리', '명세서관리', '납품확인서'], cnt: 5 },
  item:    { id:'item',    label:'물품·자산',     icon:'plusBox',   merge:['물품등록', '카테고리관리', '품목자산', '자산 QR', 'UDI 관리'], cnt: 5 },
  analyze: { id:'analyze', label:'분석·마감',     icon:'arrowUp',   merge:['ABC 분석', '재고 수요예측', '재고 실사', '월마감', '소모품 통계', 'AS·반품'], cnt: 6 },
};

const StockSidebar2 = ({ active, onPick }) => (
  <aside className="sidebar2">
    <div className="s2-scroll" style={{display:'grid', gap: 2, flex: 1, overflow:'auto'}}>
      <div className="s2-group-lbl" style={{marginTop: 4}}>재고관리</div>
      {Object.values(STOCK_SUBMENUS).map(m => (
        <div key={m.id} className={'s2-item board-item '+(m.id===active?'on':'')} onClick={()=>onPick(m.id)}>
          <Icon name={m.icon} size={14}/>
          <span style={{flex: 1}}>{m.label}</span>
          {m.primary && <span className="s2-tag" style={{background:'#FEF3C7', color:'#92400E'}}>★</span>}
          <span className="board-cnt">{m.cnt}</span>
        </div>
      ))}
    </div>
    <div className="s2-foot">
      <div className="small" style={{padding: '0 6px', fontSize: 11}}>7장 → 4개 통합</div>
    </div>
  </aside>
);

// ═══════════════════════════════════════════════════════════════════
// 메인 화면
// ═══════════════════════════════════════════════════════════════════

const StockScreen = ({ active = 'status' }) => {
  const m = STOCK_SUBMENUS[active] || STOCK_SUBMENUS.status;
  return (
    <div className="main"><div className="content">
      <div className="mod-pageheader">
        <div>
          <div className="addon-h1">{m.label}</div>
        </div>
        <div className="row" style={{gap: 8}}>
          {active==='status' && (
            <>
              <div className="input-wrap">
                <Icon name="search" size={13} className="ico"/>
                <input className="input" placeholder="품목·SKU·바코드" style={{paddingLeft: 30}}/>
              </div>
              <Btn icon="filter">필터</Btn>
              <Btn variant="primary" icon="plus">물품 등록</Btn>
            </>
          )}
          {active==='io' && (
            <>
              <Btn icon="file">엑셀 내보내기</Btn>
              <Btn variant="primary" icon="plus">새 발주</Btn>
            </>
          )}
          {active==='item' && (
            <>
              <Btn>일괄 가져오기</Btn>
              <Btn variant="primary" icon="plus">물품 등록</Btn>
            </>
          )}
          {active==='analyze' && (
            <>
              <Btn>월 선택</Btn>
              <Btn variant="primary" icon="file">월마감 보고서</Btn>
            </>
          )}
        </div>
      </div>

      <div className="hr-merge-banner">
        <div className="hr-merge-l">
          <span className="hr-merge-kicker">통합된 원본 화면 {m.cnt}장</span>
          <div className="hr-merge-chips">
            {m.merge.map((t,i) => <span key={i} className="hr-merge-chip">#{i+1} {t}</span>)}
          </div>
        </div>
        <div className="hr-merge-r"></div>
      </div>

      {active==='status'  && <StockStatus/>}
      {active==='io'      && <StockIO/>}
      {active==='item'    && <StockItem/>}
      {active==='analyze' && <StockAnalyze/>}
    </div></div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// 1. 재고 현황 워크센터
// ═══════════════════════════════════════════════════════════════════

const StockStatus = () => {
  const [scope, setScope] = React.useState('all');
  const items = [
    { name:'라텍스 장갑 (S)',     cat:'의료소모품', loc:'MSO 본사 창고',    stock: 14,  min: 20, unit:'BOX', expire:'2027-08',  status:'부족',     tone:'warn' },
    { name:'멩그루브 18cm',       cat:'의료소모품', loc:'외래팀',          stock: 0,   min: 10, unit:'EA',  expire:'2026-12',  status:'재고 0',   tone:'danger' },
    { name:'주사 바늘 23G',       cat:'의료소모품', loc:'MSO 본사 창고',    stock: 42,  min: 30, unit:'BOX', expire:'2027-02',  status:'정상',     tone:'success' },
    { name:'알코솔 솔션 500ml',   cat:'약품',     loc:'병동팀',          stock: 5,   min: 8,  unit:'병', expire:'2026-09',  status:'부족',     tone:'warn' },
    { name:'A4 복사지 80g',       cat:'사무용품',   loc:'경영지원팀',      stock: 3,   min: 5,  unit:'박', expire:'-',         status:'부족',     tone:'warn' },
    { name:'CT 조영제',           cat:'약품',     loc:'촬영실',          stock: 12,  min: 10, unit:'병', expire:'2026-08',  status:'유효기간', tone:'warn' },
    { name:'식자재 (식당)',         cat:'식자재',     loc:'영양팀',          stock: 38,  min: 25, unit:'kg',expire:'2026-05-15',status:'유효기간', tone:'danger' },
    { name:'수술용 봉합사 4-0',   cat:'의료소모품', loc:'수술팀',          stock: 28,  min: 20, unit:'EA',  expire:'2027-11',  status:'정상',     tone:'success' },
  ];
  return (
    <>
      <div className="hr-kpi-row">
        <div className="hr-kpi"><div className="lbl">전체 품목</div><div className="v">847<span className="u">종</span></div><div className="sub">의료소모품 412 · 약품 218 · 기타 217</div></div>
        <div className="hr-kpi tone-warn"><div className="lbl">부족 품목</div><div className="v">23<span className="u">건</span></div><div className="sub">발주 권장 12 · 자동 발주 11</div></div>
        <div className="hr-kpi tone-danger"><div className="lbl">재고 0</div><div className="v">4<span className="u">건</span></div><div className="sub">긴급 보충 필요</div></div>
        <div className="hr-kpi tone-warn"><div className="lbl">유효기간 임박</div><div className="v">8<span className="u">건</span></div><div className="sub">30일 이내 만료</div></div>
      </div>

      <div className="hr-row">
        <div className="card" style={{padding: 0}}>
          <div className="card-row" style={{padding: '12px 16px', margin: 0, borderBottom:'1px solid var(--border)', background:'var(--z-50)'}}>
            <div className="row" style={{gap: 6}}>
              <button className={'todo-chip tone-accent '+(scope==='all'?'on':'')} onClick={()=>setScope('all')}>전체<span className="cnt">847</span></button>
              <button className={'todo-chip '+(scope==='my'?'on':'')} onClick={()=>setScope('my')}>내 부서<span className="cnt">86</span></button>
              <button className={'todo-chip tone-warn '+(scope==='low'?'on':'')} onClick={()=>setScope('low')}>부족<span className="cnt">23</span></button>
              <button className={'todo-chip tone-danger '+(scope==='zero'?'on':'')} onClick={()=>setScope('zero')}>재고 0<span className="cnt">4</span></button>
              <button className={'todo-chip tone-warn '+(scope==='expire'?'on':'')} onClick={()=>setScope('expire')}>유효기간<span className="cnt">8</span></button>
            </div>
            <select className="board-sort">
              <option>위치별</option>
              <option>카테고리별</option>
              <option>재고 적은 순</option>
              <option>만료 임박 순</option>
            </select>
          </div>
          <table className="data-tbl" style={{width:'100%'}}>
            <thead><tr>
              <th>품목</th>
              <th>카테고리</th>
              <th>위치</th>
              <th style={{textAlign:'center'}}>재고</th>
              <th style={{textAlign:'center'}}>최소</th>
              <th>유효기간</th>
              <th>상태</th>
              <th style={{width: 80}}></th>
            </tr></thead>
            <tbody>
              {items.map((it,i) => (
                <tr key={i}>
                  <td><b style={{fontSize: 12.5}}>{it.name}</b></td>
                  <td><span className="small">{it.cat}</span></td>
                  <td><span className="small">{it.loc}</span></td>
                  <td className="tnum" style={{textAlign:'center', fontWeight: 800, color: it.stock===0?'var(--danger)':it.stock<it.min?'var(--warning)':'var(--z-900)'}}>{it.stock} <span className="small" style={{fontWeight: 700}}>{it.unit}</span></td>
                  <td className="tnum" style={{textAlign:'center'}}><span className="small">{it.min}</span></td>
                  <td className="tnum"><span className="small">{it.expire}</span></td>
                  <td><Chip tone={it.tone}>{it.status}</Chip></td>
                  <td>
                    <button className="board-tag" style={{height: 22, padding:'0 8px', fontSize: 10, border:'1px solid var(--accent)', color:'var(--accent)', background:'transparent'}}>발주</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-row">
            <div className="ctitle">긴급 알림</div>
            <Btn size="sm">설정</Btn>
          </div>
          <div className="hr-expire-list">
            <div className="hr-expire-row" style={{background:'var(--danger-soft)'}}>
              <Chip tone="danger">재고 0</Chip>
              <div className="row" style={{gap: 6, flex: 1, alignItems:'center'}}>
                <b>멩그루브 18cm</b><span className="small">외래팀 · 의료소모품</span>
              </div>
              <Btn size="sm" variant="primary">자동 발주</Btn>
            </div>
            <div className="hr-expire-row" style={{background:'var(--danger-soft)'}}>
              <Chip tone="danger">만료 6일</Chip>
              <div className="row" style={{gap: 6, flex: 1, alignItems:'center'}}>
                <b>식자재 (식당)</b><span className="small">영양팀 · 5/15 만료</span>
              </div>
              <Btn size="sm">사용 우선</Btn>
            </div>
            <div className="hr-expire-row" style={{background:'var(--warning-soft)'}}>
              <Chip tone="warn">부족</Chip>
              <div className="row" style={{gap: 6, flex: 1, alignItems:'center'}}>
                <b>라텍스 장갑 (S)</b><span className="small">14 / 20 BOX</span>
              </div>
              <Btn size="sm">발주</Btn>
            </div>
            <div className="hr-expire-row" style={{background:'var(--warning-soft)'}}>
              <Chip tone="warn">만료 D-90</Chip>
              <div className="row" style={{gap: 6, flex: 1, alignItems:'center'}}>
                <b>CT 조영제</b><span className="small">촬영실 · 2026.8 만료</span>
              </div>
              <Btn size="sm">상세</Btn>
            </div>
            <div className="hr-expire-row" style={{background:'var(--warning-soft)'}}>
              <Chip tone="warn">부족</Chip>
              <div className="row" style={{gap: 6, flex: 1, alignItems:'center'}}>
                <b>A4 복사지 80g</b><span className="small">경영지원팀 · 3 / 5 박</span>
              </div>
              <Btn size="sm">발주</Btn>
            </div>
          </div>

          <div className="card-row" style={{marginTop: 18}}>
            <div className="ctitle">부서별 사용량 TOP 5</div>
            <span className="small">최근 30일</span>
          </div>
          <div className="hr-dept-list">
            {[
              { d:'외래팀',    v: 412, max: 500 },
              { d:'병동팀1',   v: 318, max: 500 },
              { d:'수술팀',    v: 286, max: 500 },
              { d:'영양팀',    v: 198, max: 500 },
              { d:'경영지원',  v: 142, max: 500 },
            ].map((d,i) => (
              <div key={i} className="hr-dept-row" style={{gridTemplateColumns:'80px 1fr 80px'}}>
                <div className="hr-dept-name">{d.d}</div>
                <div className="hr-dept-bar"><div className="hr-dept-seg ok" style={{width: (d.v/d.max*100)+'%', background:'linear-gradient(90deg, #3B82F6, #2563EB)'}}/></div>
                <div className="tnum" style={{fontWeight: 800, fontSize: 12, textAlign:'right'}}>{d.v}<span className="small" style={{fontWeight: 600, marginLeft: 2}}>건</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════
// 2. 입출고·발주
// ═══════════════════════════════════════════════════════════════════

const StockIO = () => {
  const [tab, setTab] = React.useState('inout');
  const orders = [
    { id:'PO-2026-0512-001', vendor:'3M Korea',        items: 3,  amt: 1842000, status:'배송 중',     tone:'accent',  due:'5/14', placed:'5/12' },
    { id:'PO-2026-0511-007', vendor:'BD Korea',        items: 5,  amt: 2350000, status:'확정',       tone:'success', due:'5/15', placed:'5/11' },
    { id:'PO-2026-0510-004', vendor:'대한약품',         items: 12, amt:  890000, status:'납품 완료',   tone:'success', due:'5/11', placed:'5/10' },
    { id:'PO-2026-0510-002', vendor:'코오롱 인더스트리', items: 2,  amt: 4250000, status:'발주 대기',   tone:'warn',    due:'5/16', placed:'5/10' },
    { id:'PO-2026-0508-013', vendor:'사무·복지 마트',   items: 8,  amt:  342000, status:'납품 완료',   tone:'success', due:'5/9',  placed:'5/8'  },
  ];
  const moves = [
    { time:'14:23', kind:'입고', item:'라텍스 장갑 (S)',      qty: 24, unit:'BOX', from:'3M Korea',   to:'MSO 본사', who:'백민',   tone:'success' },
    { time:'13:48', kind:'출고', item:'주사 바늘 23G',         qty: 8,  unit:'BOX', from:'MSO 본사',  to:'외래팀',   who:'이나림', tone:'accent' },
    { time:'11:12', kind:'이관', item:'알코올 솔션 500ml',     qty: 4,  unit:'병', from:'본사 창고',  to:'병동팀',   who:'김지오', tone:'muted' },
    { time:'10:35', kind:'출고', item:'멩그루브 18cm',         qty: 12, unit:'EA',  from:'MSO 본사',  to:'외래팀',   who:'이나림', tone:'accent' },
    { time:'09:42', kind:'입고', item:'CT 조영제',             qty: 6,  unit:'병', from:'대한약품',    to:'촬영실',   who:'송소현', tone:'success' },
    { time:'09:18', kind:'반품', item:'주사기 1ml (불량)',     qty: 3,  unit:'BOX', from:'외래팀',     to:'BD Korea', who:'박유진', tone:'danger' },
  ];
  return (
    <>
      <div className="tabs" style={{marginBottom: 12}}>
        <button className={'tab-item '+(tab==='inout'?'on':'')} onClick={()=>setTab('inout')}>입출고 기록<span className="cnt">today</span></button>
        <button className={'tab-item '+(tab==='order'?'on':'')} onClick={()=>setTab('order')}>발주 관리<span className="cnt">12</span></button>
        <button className={'tab-item '+(tab==='vendor'?'on':'')} onClick={()=>setTab('vendor')}>거래처·명세서</button>
      </div>

      <div className="hr-kpi-row">
        <div className="hr-kpi"><div className="lbl">오늘 입출고</div><div className="v">28<span className="u">건</span></div><div className="sub">입고 12 · 출고 14 · 반품 2</div></div>
        <div className="hr-kpi tone-warn"><div className="lbl">발주 대기</div><div className="v">3<span className="u">건</span></div><div className="sub">결재 후 발송 예정</div></div>
        <div className="hr-kpi tone-accent"><div className="lbl">배송 중</div><div className="v">5<span className="u">건</span></div><div className="sub">금주 도착 예정</div></div>
        <div className="hr-kpi tone-success"><div className="lbl">이번 달 발주액</div><div className="v">28.4<span className="u">M원</span></div><div className="sub">전월 대비 -2.1%</div></div>
      </div>

      {tab === 'inout' && (
        <div className="card" style={{padding: 0}}>
          <div className="card-row" style={{padding: '12px 16px', margin: 0, borderBottom:'1px solid var(--border)'}}>
            <div className="ctitle">오늘 입출고 (2026.5.11)</div>
            <div className="row" style={{gap: 8}}>
              <select className="board-sort">
                <option>전체</option><option>입고</option><option>출고</option><option>이관</option><option>반품</option>
              </select>
              <Btn size="sm" icon="plus">수동 등록</Btn>
            </div>
          </div>
          <div className="io-list">
            {moves.map((m,i) => (
              <div key={i} className="io-row">
                <span className="tnum io-time">{m.time}</span>
                <Chip tone={m.tone}>{m.kind}</Chip>
                <div className="io-body">
                  <b>{m.item}</b>
                  <span className="small">{m.from} → {m.to}</span>
                </div>
                <span className="tnum io-qty">{m.qty}<span className="small" style={{fontWeight: 600}}> {m.unit}</span></span>
                <span className="small io-who">{m.who}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'order' && (
        <div className="card" style={{padding: 0}}>
          <div className="card-row" style={{padding: '12px 16px', margin: 0, borderBottom:'1px solid var(--border)'}}>
            <div className="row" style={{gap: 6}}>
              <button className="todo-chip tone-accent on">전체<span className="cnt">12</span></button>
              <button className="todo-chip tone-warn">대기<span className="cnt">3</span></button>
              <button className="todo-chip tone-success">확정<span className="cnt">2</span></button>
              <button className="todo-chip">배송 중<span className="cnt">5</span></button>
              <button className="todo-chip">완료<span className="cnt">2</span></button>
            </div>
            <Btn size="sm" variant="primary" icon="plus">새 발주</Btn>
          </div>
          <table className="data-tbl" style={{width:'100%'}}>
            <thead><tr>
              <th>발주번호</th>
              <th>거래처</th>
              <th style={{textAlign:'center'}}>품목 수</th>
              <th style={{textAlign:'right'}}>금액</th>
              <th>발주일</th>
              <th>납기일</th>
              <th>상태</th>
              <th style={{width: 90}}></th>
            </tr></thead>
            <tbody>
              {orders.map((o,i) => (
                <tr key={i}>
                  <td className="tnum"><b style={{fontSize: 11, color:'var(--accent)'}}>{o.id}</b></td>
                  <td><b style={{fontSize: 12.5}}>{o.vendor}</b></td>
                  <td className="tnum" style={{textAlign:'center'}}>{o.items}</td>
                  <td className="tnum" style={{textAlign:'right', fontWeight: 800}}>{o.amt.toLocaleString()}<span className="small" style={{fontWeight: 600}}> 원</span></td>
                  <td className="tnum"><span className="small">{o.placed}</span></td>
                  <td className="tnum"><span className="small">{o.due}</span></td>
                  <td><Chip tone={o.tone}>{o.status}</Chip></td>
                  <td><button className="board-tag" style={{height: 22, padding:'0 8px', fontSize: 10}}>상세</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'vendor' && (
        <div className="hr-grid-3">
          {[
            { name:'3M Korea',           cat:'의료소모품',  orders: 24, paid: 18.2, due: 4.8, contact:'김선임 010-1234-5678', tone:'success' },
            { name:'BD Korea',           cat:'의료소모품',  orders: 18, paid: 12.4, due: 0,   contact:'박매니저 010-2345-6789', tone:'success' },
            { name:'대한약품',            cat:'약품',      orders: 32, paid: 8.9,  due: 2.3, contact:'이대리 010-3456-7890',  tone:'warn' },
            { name:'코오롱 인더스트리',     cat:'장비',      orders: 4,  paid: 15.2, due: 8.5, contact:'정과장 010-4567-8901', tone:'danger' },
            { name:'사무·복지 마트',       cat:'사무용품',   orders: 12, paid: 2.1,  due: 0,   contact:'홍사장 010-5678-9012', tone:'success' },
            { name:'서울식자재',           cat:'식자재',    orders: 28, paid: 6.4,  due: 1.2, contact:'배실장 010-6789-0123', tone:'warn' },
          ].map((v,i) => (
            <div key={i} className="vendor-card">
              <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
                <b style={{fontSize: 14, letterSpacing:'-0.02em'}}>{v.name}</b>
                <Chip tone={v.tone}>{v.due===0?'정상':'미수금'}</Chip>
              </div>
              <div className="small">{v.cat} · {v.contact}</div>
              <div className="vendor-stats">
                <div><div className="lbl">발주</div><div className="v">{v.orders}<span className="u">건</span></div></div>
                <div><div className="lbl">지급</div><div className="v">{v.paid}<span className="u">M</span></div></div>
                <div><div className="lbl">미수</div><div className={'v '+(v.due>0?'danger':'')}>{v.due}<span className="u">M</span></div></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════
// 3. 물품·자산
// ═══════════════════════════════════════════════════════════════════

const StockItem = () => {
  const [tab, setTab] = React.useState('items');
  return (
    <>
      <div className="tabs" style={{marginBottom: 12}}>
        <button className={'tab-item '+(tab==='items'?'on':'')} onClick={()=>setTab('items')}>물품 카탈로그<span className="cnt">847</span></button>
        <button className={'tab-item '+(tab==='cats' ?'on':'')} onClick={()=>setTab('cats')}>카테고리<span className="cnt">24</span></button>
        <button className={'tab-item '+(tab==='asset'?'on':'')} onClick={()=>setTab('asset')}>자산·QR<span className="cnt">158</span></button>
        <button className={'tab-item '+(tab==='udi' ?'on':'')} onClick={()=>setTab('udi')}>UDI<span className="cnt">42</span></button>
      </div>

      <div className="hr-kpi-row">
        <div className="hr-kpi"><div className="lbl">물품 카탈로그</div><div className="v">847<span className="u">종</span></div><div className="sub">소모품 720 · 자산 127</div></div>
        <div className="hr-kpi tone-accent"><div className="lbl">고정자산</div><div className="v">158<span className="u">대</span></div><div className="sub">QR 부착 142 · 미부착 16</div></div>
        <div className="hr-kpi tone-success"><div className="lbl">UDI 등록</div><div className="v">42<span className="u">건</span></div><div className="sub">의료기기 식별 코드</div></div>
        <div className="hr-kpi"><div className="lbl">카테고리</div><div className="v">24<span className="u">개</span></div><div className="sub">대분류 6 · 중분류 24</div></div>
      </div>

      {tab === 'items' && (
        <div className="card">
          <div className="card-row">
            <div className="ctitle">물품 카탈로그 — 최근 등록</div>
            <div className="row" style={{gap: 8}}>
              <Btn size="sm" icon="file">일괄 가져오기</Btn>
              <Btn size="sm" variant="primary" icon="plus">물품 등록</Btn>
            </div>
          </div>
          <table className="data-tbl" style={{width:'100%'}}>
            <thead><tr><th>SKU</th><th>품목명</th><th>카테고리</th><th>단위</th><th style={{textAlign:'right'}}>단가</th><th>등록일</th><th>등록자</th></tr></thead>
            <tbody>
              {[
                { sku:'MS-25-0124', name:'주사 바늘 23G',     cat:'의료소모품', unit:'BOX', price:  12000, date:'2025.4.12', who:'백민' },
                { sku:'MS-25-0125', name:'라텍스 장갑 (S)',    cat:'의료소모품', unit:'BOX', price:  18500, date:'2025.4.10', who:'백민' },
                { sku:'DR-25-0008', name:'알코올 솔션 500ml',  cat:'약품',      unit:'병',  price:   3800, date:'2025.4.5',  who:'이재훈' },
                { sku:'EQ-25-0042', name:'CT 조영제',         cat:'약품',      unit:'병',  price: 124000, date:'2025.3.28', who:'송소현' },
                { sku:'OS-25-0011', name:'A4 복사지 80g',     cat:'사무용품',   unit:'박',  price:  18000, date:'2025.3.20', who:'박유진' },
              ].map((r,i) => (
                <tr key={i}>
                  <td><b style={{fontSize: 11, color:'var(--accent)'}} className="tnum">{r.sku}</b></td>
                  <td><b style={{fontSize: 12.5}}>{r.name}</b></td>
                  <td><span className="small">{r.cat}</span></td>
                  <td className="tnum"><span className="small">{r.unit}</span></td>
                  <td className="tnum" style={{textAlign:'right', fontWeight: 800}}>{r.price.toLocaleString()}<span className="small" style={{fontWeight: 600}}> 원</span></td>
                  <td className="tnum"><span className="small">{r.date}</span></td>
                  <td><span className="small">{r.who}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'cats' && (
        <div className="hr-grid-2">
          {[
            { p:'의료소모품', items:412, kids:['장갑·마스크', '주사·바늘', '드레싱·붕대', '카테터', '봉합사', '기타'] },
            { p:'약품',     items:218, kids:['처방약', '비처방약', '주사약', '소독·살균', '특수약품'] },
            { p:'장비·자산', items: 87, kids:['의료기기', '진단기기', '사무 장비', 'IT 장비'] },
            { p:'사무용품',  items: 64, kids:['용지·파일', '필기구', '인쇄·소모품'] },
            { p:'식자재',    items: 38, kids:['주식', '부식', '특별식'] },
            { p:'청소·복지', items: 28, kids:['청소용품', '복지물품'] },
          ].map((c,i) => (
            <div key={i} className="cat-card">
              <div className="row" style={{justifyContent:'space-between', alignItems:'baseline'}}>
                <b style={{fontSize: 15, letterSpacing:'-0.02em'}}>{c.p}</b>
                <span className="tnum" style={{fontSize: 12, fontWeight: 800, color:'var(--accent)'}}>{c.items} 종</span>
              </div>
              <div className="cat-kids">
                {c.kids.map((k,j) => <span key={j} className="cat-kid">{k}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'asset' && (
        <div className="hr-row">
          <div className="card" style={{padding: 0}}>
            <div className="card-row" style={{padding: '12px 16px', margin: 0, borderBottom:'1px solid var(--border)'}}>
              <div className="ctitle">고정자산</div>
              <Btn size="sm" icon="plus">자산 등록</Btn>
            </div>
            <table className="data-tbl" style={{width:'100%'}}>
              <thead><tr><th>자산번호</th><th>품목</th><th>위치</th><th>구매일</th><th>QR</th><th>상태</th></tr></thead>
              <tbody>
                {[
                  { id:'A-2023-001', name:'CT 장비',        loc:'촬영실 1',  date:'2023.5.10', qr:true,  s:'정상',     tone:'success' },
                  { id:'A-2023-008', name:'초음파 장비',    loc:'촬영실 2',  date:'2023.8.22', qr:true,  s:'정상',     tone:'success' },
                  { id:'A-2024-014', name:'데스크탑 PC',    loc:'외래 데스크', date:'2024.3.18', qr:true,  s:'수리 필요', tone:'danger' },
                  { id:'A-2024-022', name:'무영등',         loc:'수술방 1',  date:'2024.6.5',  qr:true,  s:'정상',     tone:'success' },
                  { id:'A-2025-003', name:'전동침대',       loc:'병동 102',  date:'2025.1.12', qr:false, s:'QR 미부착', tone:'warn' },
                ].map((r,i) => (
                  <tr key={i}>
                    <td className="tnum"><b style={{fontSize: 11, color:'var(--accent)'}}>{r.id}</b></td>
                    <td><b style={{fontSize: 12.5}}>{r.name}</b></td>
                    <td><span className="small">{r.loc}</span></td>
                    <td className="tnum"><span className="small">{r.date}</span></td>
                    <td>{r.qr ? <Chip tone="success">부착</Chip> : <Chip tone="warn">미부착</Chip>}</td>
                    <td><Chip tone={r.tone}>{r.s}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <div className="card-row"><div className="ctitle">QR 라벨 출력 도구</div></div>
            <div className="qr-tool">
              <div className="qr-preview">
                <div className="qr-grid">
                  {Array.from({length: 49}, (_,i) => <div key={i} className={'qr-pixel '+(Math.random()>0.55?'on':'')}/>)}
                </div>
                <div className="qr-label">
                  <div className="qr-id">A-2025-003</div>
                  <div className="qr-name">전동침대</div>
                  <div className="qr-meta">병동 102 · 2025.1.12</div>
                </div>
              </div>
              <div className="qr-options">
                <label><div className="lbl">라벨 크기</div><select className="input"><option>50 × 30mm</option><option>40 × 25mm</option><option>30 × 20mm</option></select></label>
                <label><div className="lbl">출력 매수</div><input className="input" defaultValue="1" type="number"/></label>
                <label><div className="lbl">출력 정보</div>
                  <div className="row" style={{gap: 6, flexWrap:'wrap'}}>
                    <Chip tone="accent">자산번호</Chip>
                    <Chip tone="accent">품명</Chip>
                    <Chip tone="muted">+ 위치</Chip>
                    <Chip tone="muted">+ 구매일</Chip>
                  </div>
                </label>
              </div>
              <Btn variant="primary" icon="send">라벨 인쇄</Btn>
            </div>
          </div>
        </div>
      )}

      {tab === 'udi' && (
        <div className="card">
          <div className="card-row">
            <div className="ctitle">UDI (의료기기 고유 식별 코드)</div>
            <Btn size="sm" icon="plus">UDI 등록</Btn>
          </div>
          <table className="data-tbl" style={{width:'100%'}}>
            <thead><tr><th>UDI 코드</th><th>품목</th><th>제조사</th><th>모델</th><th>로트</th><th>등록일</th></tr></thead>
            <tbody>
              {[
                { udi:'00643169007649', name:'CT 조영제',          mfr:'대한약품',  model:'OMNI-300', lot:'LT2025-001', date:'2025.4.10' },
                { udi:'00643169007652', name:'수술용 봉합사 4-0',   mfr:'BD Korea', model:'BD-4040',  lot:'LT2025-018', date:'2025.4.18' },
                { udi:'00643169007658', name:'주사 바늘 23G',      mfr:'3M Korea', model:'3M-23G',   lot:'LT2025-022', date:'2025.5.2'  },
                { udi:'00643169007661', name:'멩그루브 18cm',      mfr:'3M Korea', model:'MG-18',    lot:'LT2025-031', date:'2025.5.10' },
              ].map((r,i) => (
                <tr key={i}>
                  <td className="tnum"><b style={{fontSize: 11, color:'var(--accent)'}}>{r.udi}</b></td>
                  <td><b style={{fontSize: 12.5}}>{r.name}</b></td>
                  <td><span className="small">{r.mfr}</span></td>
                  <td className="tnum"><span className="small">{r.model}</span></td>
                  <td className="tnum"><span className="small">{r.lot}</span></td>
                  <td className="tnum"><span className="small">{r.date}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════
// 4. 분석·마감
// ═══════════════════════════════════════════════════════════════════

const StockAnalyze = () => {
  const [tab, setTab] = React.useState('abc');
  return (
    <>
      <div className="tabs" style={{marginBottom: 12}}>
        <button className={'tab-item '+(tab==='abc' ?'on':'')} onClick={()=>setTab('abc')}>ABC 분석</button>
        <button className={'tab-item '+(tab==='pred'?'on':'')} onClick={()=>setTab('pred')}>수요 예측</button>
        <button className={'tab-item '+(tab==='ins' ?'on':'')} onClick={()=>setTab('ins')}>재고 실사</button>
        <button className={'tab-item '+(tab==='clo' ?'on':'')} onClick={()=>setTab('clo')}>월마감</button>
      </div>

      <div className="hr-kpi-row">
        <div className="hr-kpi"><div className="lbl">A등급 (상위 70%)</div><div className="v">42<span className="u">종</span></div><div className="sub">중점 관리 대상</div></div>
        <div className="hr-kpi"><div className="lbl">B등급 (20%)</div><div className="v">218<span className="u">종</span></div><div className="sub">정기 점검</div></div>
        <div className="hr-kpi"><div className="lbl">C등급 (10%)</div><div className="v">587<span className="u">종</span></div><div className="sub">최소 관리</div></div>
        <div className="hr-kpi tone-warn"><div className="lbl">예측 부정확 품목</div><div className="v">12<span className="u">건</span></div><div className="sub">실제 vs 예측 차이 30%+</div></div>
      </div>

      {tab === 'abc' && (
        <div className="card">
          <div className="card-row">
            <div className="ctitle">ABC 분석 — 매출 기여도 기준</div>
            <span className="small">2026.5.1 ~ 2026.5.11</span>
          </div>
          <div className="abc-chart">
            <div className="abc-grade a">
              <div className="abc-grade-head"><b>A</b> 상위 5% (42 종)</div>
              <div className="abc-grade-bar"><div className="fill" style={{width:'70%'}}/></div>
              <div className="small">매출 기여 70% · 발주 1순위 · 안전재고 충분히 확보</div>
              <div className="row" style={{gap: 4, flexWrap:'wrap', marginTop: 8}}>
                <Chip tone="accent">라텍스 장갑</Chip>
                <Chip tone="accent">주사기 1ml</Chip>
                <Chip tone="accent">알코올 솔션</Chip>
                <Chip tone="muted">+ 39</Chip>
              </div>
            </div>
            <div className="abc-grade b">
              <div className="abc-grade-head"><b>B</b> 25% (218 종)</div>
              <div className="abc-grade-bar"><div className="fill" style={{width:'20%'}}/></div>
              <div className="small">매출 기여 20% · 정기 점검 · 일반 안전재고</div>
            </div>
            <div className="abc-grade c">
              <div className="abc-grade-head"><b>C</b> 70% (587 종)</div>
              <div className="abc-grade-bar"><div className="fill" style={{width:'10%'}}/></div>
              <div className="small">매출 기여 10% · 최소 관리 · 통합 발주</div>
            </div>
          </div>
        </div>
      )}

      {tab === 'pred' && (
        <div className="card">
          <div className="card-row">
            <div className="ctitle">수요 예측 — 다음 30일</div>
            <Btn size="sm" icon="file">예측 리포트</Btn>
          </div>
          <table className="data-tbl" style={{width:'100%'}}>
            <thead><tr><th>품목</th><th style={{textAlign:'right'}}>현재고</th><th style={{textAlign:'right'}}>30일 예측</th><th style={{textAlign:'right'}}>예상 부족</th><th>발주 권장일</th><th>신뢰도</th></tr></thead>
            <tbody>
              {[
                { name:'라텍스 장갑 (S)',     stock:14,  pred: 28, gap:-14, when:'5/15', conf:'94%', tone:'success' },
                { name:'주사 바늘 23G',       stock:42,  pred: 36, gap:  6, when:'5/30', conf:'88%', tone:'success' },
                { name:'멩그루브 18cm',       stock: 0,  pred: 32, gap:-32, when:'즉시',  conf:'92%', tone:'danger'  },
                { name:'알코올 솔션 500ml',   stock: 5,  pred:  9, gap: -4, when:'5/14', conf:'78%', tone:'warn'    },
                { name:'A4 복사지 80g',       stock: 3,  pred:  6, gap: -3, when:'5/18', conf:'65%', tone:'warn'    },
              ].map((r,i) => (
                <tr key={i}>
                  <td><b style={{fontSize: 12.5}}>{r.name}</b></td>
                  <td className="tnum" style={{textAlign:'right'}}>{r.stock}</td>
                  <td className="tnum" style={{textAlign:'right', fontWeight: 800}}>{r.pred}</td>
                  <td className="tnum" style={{textAlign:'right', fontWeight: 800, color: r.gap<0?'var(--danger)':'var(--success)'}}>{r.gap<0?r.gap:'+'+r.gap}</td>
                  <td className="tnum"><b style={{fontSize: 12, color: r.when==='즉시'?'var(--danger)':'var(--accent)'}}>{r.when}</b></td>
                  <td><Chip tone={r.tone}>{r.conf}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'ins' && (
        <div className="card">
          <div className="card-row">
            <div className="ctitle">재고 실사 — 2026년 5월 정기 실사</div>
            <div className="row" style={{gap: 8}}>
              <Chip tone="accent">진행률 78%</Chip>
              <Btn size="sm" variant="primary">실사 시작</Btn>
            </div>
          </div>
          <div className="hr-check-bar">
            <div className="hr-check-seg done" style={{flex: 78}}><span>실사 완료 660 종</span></div>
            <div className="hr-check-seg wait" style={{flex: 18}}><span>진행 중 152</span></div>
            <div className="hr-check-seg none" style={{flex: 4}}><span>미실시 35</span></div>
          </div>
          <table className="data-tbl" style={{width:'100%', marginTop: 12}}>
            <thead><tr><th>위치</th><th style={{textAlign:'right'}}>대상</th><th style={{textAlign:'right'}}>완료</th><th style={{textAlign:'right'}}>차이 발견</th><th>담당자</th><th>상태</th></tr></thead>
            <tbody>
              {[
                { loc:'MSO 본사 창고', total: 412, done: 412, diff: 8, who:'백민·박유진', tone:'success' },
                { loc:'외래팀',        total:  86, done:  86, diff: 2, who:'이나림',        tone:'success' },
                { loc:'병동팀1',       total:  72, done:  60, diff: 1, who:'김지오',        tone:'warn' },
                { loc:'수술팀',        total:  68, done:  68, diff: 4, who:'정해영',        tone:'success' },
                { loc:'촬영실',        total:  42, done:  20, diff: 0, who:'송소현',        tone:'warn' },
                { loc:'영양팀',        total:  38, done:  14, diff: 1, who:'배실장',        tone:'danger' },
              ].map((r,i) => (
                <tr key={i}>
                  <td><b style={{fontSize: 12.5}}>{r.loc}</b></td>
                  <td className="tnum" style={{textAlign:'right'}}>{r.total}</td>
                  <td className="tnum" style={{textAlign:'right', fontWeight: 800}}>{r.done}</td>
                  <td className="tnum" style={{textAlign:'right', fontWeight: 800, color: r.diff>0?'var(--warning)':'var(--z-500)'}}>{r.diff}</td>
                  <td><span className="small">{r.who}</span></td>
                  <td><Chip tone={r.tone}>{r.done===r.total?'완료':r.done/r.total>0.7?'진행':'지연'}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'clo' && (
        <div className="hr-row">
          <div className="card">
            <div className="card-row">
              <div className="ctitle">2026년 5월 마감 진행</div>
              <Chip tone="warn">진행 중</Chip>
            </div>
            <div className="cl-steps">
              {[
                { n: 1, t:'재고 실사',      d:'2026.5.11 진행 중 (78%)', state:'on'   },
                { n: 2, t:'입출고 확정',   d:'예정 2026.5.15',          state:'pending' },
                { n: 3, t:'차이 조정',     d:'예정 2026.5.16',          state:'pending' },
                { n: 4, t:'재고 평가',     d:'예정 2026.5.18',          state:'pending' },
                { n: 5, t:'마감 보고서',   d:'예정 2026.5.20',          state:'pending' },
              ].map((s,i) => (
                <div key={i} className={'cl-step '+s.state}>
                  <div className="cl-step-num">{s.state==='done'?<Icon name="check" size={11}/>:s.n}</div>
                  <div className="cl-step-body">
                    <div className="cl-step-t">{s.t}</div>
                    <div className="cl-step-d">{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-row"><div className="ctitle">최근 3개월 마감 결과</div></div>
            <div className="hr-expire-list">
              {[
                { m:'2026.4', amt:'128.4M', diff:'+2.1%', tone:'success', done:'4/30' },
                { m:'2026.3', amt:'125.8M', diff:'+0.8%', tone:'success', done:'3/30' },
                { m:'2026.2', amt:'124.7M', diff:'-1.2%', tone:'muted',   done:'2/28' },
              ].map((r,i) => (
                <div key={i} className="hr-expire-row">
                  <Chip tone={r.tone}>{r.diff}</Chip>
                  <div className="row" style={{gap: 6, flex: 1, alignItems:'center'}}>
                    <b>{r.m}</b><span className="small">· 재고 평가액 {r.amt}</span>
                  </div>
                  <span className="small tnum">완료 {r.done}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════
// 노트
// ═══════════════════════════════════════════════════════════════════

const StockNotes = ({ active }) => {
  const m = STOCK_SUBMENUS[active] || STOCK_SUBMENUS.status;
  return (
    <Notes
      kicker={'§ 재고관리 — ' + m.label}
      title={`7장 → 4개 통합. 현재 ${m.label} (원본 ${m.cnt}장)`}
      points={[
        '재고 현황 = 전체 + 부서별 + 알림 + 유효기간을 하나로. 필터 칩으로 즉시 컨텍스트 전환.',
        '입출고·발주 = 입출고 기록(today/시간순) + 발주 관리(상태 5단) + 거래처·명세서(미수금 톤). 한 메뉴 내 탭.',
        '물품·자산 = 카탈로그 + 카테고리 트리 + 자산 QR 라벨 출력 도구 + 의료기기 UDI. 4-탭.',
        '분석·마감 = ABC 분석(A/B/C 등급) + 수요 예측(다음 30일, 신뢰도) + 재고 실사(진행률) + 월마감(5단계 워크플로). 4-탭.',
        '추가기능의 \"부서별 재고\"와 동일 토큰 사용 — MSO 본사 vs 일반 부서 구분, 발주 흐름 일관.',
        '재고 0 / 만료 임박 / 부족 항상 danger·warn 톤으로 즉시 식별. 행 액션은 hover 시 노출.',
      ]}
    />
  );
};

Object.assign(window, {
  StockSidebar2, StockScreen, StockNotes, STOCK_SUBMENUS,
});
