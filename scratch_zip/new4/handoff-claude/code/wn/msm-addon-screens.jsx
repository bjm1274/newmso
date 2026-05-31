// MSO 모바일 — 추가기능 12개 모듈 상세 화면
function AddonScreens() { return null; }

// 공통 헬퍼
function SecList({ label, children }) {
  return (<><div className="msm-sec"><span className="msm-sec-t">{label}</span></div><div className="msm-list">{children}</div></>);
}
function Stat2({ items }) {
  return (<div className="msm-stat2">{items.map((s, i) => { const t = msmTone(s.tone || 'accent'); return (
    <div key={i} className="msm-statcard"><div className="v" style={{ color: t.fg }}>{s.v}</div><div className="l">{s.l}</div></div>); })}</div>);
}
function Row({ ic, tone = 'muted', t, s, badge, badgeTone, val }) {
  const tn = msmTone(tone);
  return (
    <div className="msm-row" style={{ cursor: 'default' }}>
      {ic && <span className="lead" style={{ background: tn.bg, color: tn.fg }}><Icon name={ic} size={18} /></span>}
      <div className="main"><div className="nm" style={{ whiteSpace: 'normal' }}>{t}</div>{s && <div className="sub">{s}</div>}</div>
      <div className="meta">{val && <span className="msm-row-val" style={{ fontWeight: 800, fontSize: 14, fontFeatureSettings: '"tnum"' }}>{val}</span>}{badge && <span className={'msm-badge ' + (badgeTone || 'muted')}>{badge}</span>}</div>
    </div>
  );
}

const ADDON = {
  note: { title: '인계노트', body: <NoteModule /> },
  consult: { title: '수술상담', body: <ConsultModule /> },
  opcheck: { title: 'OP체크', body: <OpCheckModule /> },
  discharge: { title: '퇴원심사', body: <DischargeModule /> },
  org: { title: '조직도', body: <OrgModule /> },
  work: { title: '근무현황', body: <WorkNowModule /> },
  dept: { title: '부서별재고', body: <InvModule /> },
  parking: { title: '주차관제', body: (
    <>
      <div className="msm-hero" style={{ background: 'linear-gradient(135deg,#047857,#10B981)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>실시간 주차 현황</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}><div style={{ fontSize: 36, fontWeight: 800 }}>38</div><div style={{ fontSize: 15, color: 'rgba(255,255,255,0.8)' }}>/ 50면</div></div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>잔여 12면 · 가동률 76%</div>
      </div>
      <SecList label="최근 입차">
        <Row ic="shield" tone="accent" t="12가 3456" s="입차 09:21 · 방문객" badge="주차중" badgeTone="accent" />
        <Row ic="shield" tone="muted" t="34나 7890" s="입차 09:08 · 직원" badge="주차중" badgeTone="muted" />
        <Row ic="shield" tone="muted" t="56다 1234" s="출차 09:02 · 방문객" badge="출차" badgeTone="success" />
      </SecList>
    </>
  )},
  deposit: { title: '입금조회', body: (
    <>
      <div className="msm-hero" style={{ background: 'linear-gradient(135deg,#0B0B0E,#1A1A21)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>오늘 입금 합계</div>
        <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, fontFeatureSettings: '"tnum"' }}>8,420,000<span style={{ fontSize: 14 }}>원</span></div>
        <div style={{ fontSize: 12, color: '#34D399', marginTop: 2 }}>건수 14건 · 미수금 2건</div>
      </div>
      <SecList label="입금 내역">
        <Row ic="won" tone="success" t="국민건강보험공단" s="보험 청구 · 09:14" val="+3,200,000" />
        <Row ic="won" tone="success" t="송OO (외래)" s="진료비 카드 · 09:02" val="+182,000" />
        <Row ic="won" tone="danger" t="박OO (입원)" s="미수금" val="-540,000" badge="미수" badgeTone="danger" />
      </SecList>
    </>
  )},
  closing: { title: '마감보고', body: (
    <>
      <Stat2 items={[{ v: '완료', l: '5/11 마감', tone: 'success' }, { v: '대기', l: '5/12 마감', tone: 'warn' }]} />
      <SecList label="일일 마감 보고">
        <Row ic="fileText" tone="warn" t="5월 12일 (화) 마감" s="작성 대기 · 매출 입력 필요" badge="작성" badgeTone="warn" />
        <Row ic="fileText" tone="success" t="5월 11일 (월) 마감" s="백정민 · 18:42 제출" badge="완료" badgeTone="success" />
        <Row ic="fileText" tone="success" t="5월 8일 (금) 마감" s="백정민 · 18:30 제출" badge="완료" badgeTone="success" />
      </SecList>
    </>
  )},
  eval: { title: '직원평가', body: <EvalModule /> },
  fax: { title: '웹팩스', body: (
    <>
      <Stat2 items={[{ v: '3건', l: '받은 팩스', tone: 'accent' }, { v: '1건', l: '미확인', tone: 'warn' }]} />
      <SecList label="수신함">
        <Row ic="send" tone="accent" t="국민건강보험공단" s="02-1234-5678 · 09:30 · 2매" badge="미확인" badgeTone="warn" />
        <Row ic="send" tone="muted" t="OO의료기기" s="031-987-6543 · 어제 · 1매" badge="확인" badgeTone="success" />
        <Row ic="send" tone="muted" t="세무회계법인" s="02-555-1212 · 5/10 · 4매" badge="확인" badgeTone="success" />
      </SecList>
    </>
  )},
};

window.ADDON_SCREENS = ADDON;
Object.assign(window, { SecList, Stat2, AddonRow: Row });
