// MSO 모바일 — 채팅 + 전자결재 화면
const mInitial = (n) => (n || '').slice(0, 1);

function ChatScreen({ topInset, bottomInset }) {
  const D = window.MSM;
  const [open, setOpen] = useMsmState(false);
  return (
    <>
      <MsmAppbar topInset={topInset} eyebrow="협업" title="채팅" actions={
        <>
          <button className="msm-ibtn"><Icon name="search" size={19} /></button>
          <button className="msm-ibtn accent" style={{ background: 'var(--accent)', color: '#fff' }}><Icon name="edit" size={18} /></button>
        </>
      } />
      <div className="msm-scroll">
        <div className="msm-body">
          {D.chats.some(c => c.fixed) && <div className="msm-sec"><span className="msm-sec-t">고정</span></div>}
          <div className="msm-list">
            {D.chats.filter(c => c.fixed).map(c => <ChatRow key={c.id} c={c} onClick={() => setOpen(true)} />)}
          </div>
          <div className="msm-sec"><span className="msm-sec-t">대화</span></div>
          <div className="msm-list">
            {D.chats.filter(c => !c.fixed).map(c => <ChatRow key={c.id} c={c} onClick={() => setOpen(true)} />)}
          </div>
          <div style={{ height: bottomInset + 8 }} />
        </div>
      </div>
      <ChatThread open={open} topInset={topInset} bottomInset={bottomInset} onClose={() => setOpen(false)} />
    </>
  );
}

function ChatRow({ c, onClick }) {
  return (
    <button className="msm-row" onClick={onClick}>
      {c.dm
        ? <span className="av">{c.initials}</span>
        : <span className="lead" style={{ background: c.tone, color: '#fff', borderRadius: 13 }}>{(c.name || '').slice(0, 2)}</span>}
      <div className="main">
        <div className="nm">{c.name}{!c.dm && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-400)' }}>{c.members}</span>}</div>
        <div className="sub">{c.last}</div>
      </div>
      <div className="meta">
        <span className="time">{c.time}</span>
        {c.unread > 0 && <span className="msm-unread">{c.unread}</span>}
      </div>
    </button>
  );
}

// 채팅 대화창 (풀스크린)
function ChatThread({ open, topInset, bottomInset, onClose }) {
  const th = window.MSM.thread;
  return (
    <div className={'glm-screen' + (open ? ' open' : '')} style={{ background: 'var(--z-50)' }}>
      <div className="msm-th-head" style={{ paddingTop: topInset + 8 }}>
        <button className="msm-th-back" onClick={onClose}><Icon name="chevL" size={20} /></button>
        <span className="msm-th-av" style={{ background: th.tone }}>{th.room.slice(0, 2)}</span>
        <div className="msm-th-title">
          <div className="msm-th-nm">{th.room}<span className="cnt">{th.members}</span></div>
          <div className="msm-th-status"><span className="live" />실시간 연결됨</div>
        </div>
        <button className="msm-ibtn"><Icon name="search" size={18} /></button>
        <button className="msm-ibtn"><Icon name="moreH" size={18} /></button>
      </div>
      <div className="msm-th-scroll">
        <div className="msm-th-body">
          {th.msgs.map((m, i) => {
            if (m.type === 'date') return <div key={i} className="msm-th-date">{m.t}</div>;
            if (m.type === 'sys') return <div key={i} className="msm-th-sys">{m.t}</div>;
            const showWho = m.type === 'in' && (i === 0 || th.msgs[i - 1].who !== m.who || th.msgs[i - 1].type !== 'in');
            return (
              <div key={i} className={'msm-msg ' + m.type}>
                {m.type === 'in' && <span className="msm-msg-av" style={{ background: m.avtone, visibility: showWho ? 'visible' : 'hidden' }}>{m.av}</span>}
                <div className="msm-msg-col">
                  {showWho && <div className="msm-msg-who">{m.who}</div>}
                  <div className="msm-msg-rowline">
                    <div className="msm-bubble">{m.text}</div>
                    <span className="msm-msg-time">{m.time}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="msm-th-input" style={{ paddingBottom: bottomInset + 10 }}>
        <button className="msm-th-plus"><Icon name="plus" size={20} /></button>
        <input className="msm-th-field" placeholder="메시지 입력" />
        <button className="msm-th-send"><Icon name="send" size={18} /></button>
      </div>
    </div>
  );
}

function ApprovalScreen({ topInset, bottomInset }) {
  const D = window.MSM;
  const [mode, setMode] = useMsmState('query'); // 'inbox' 결재함 | 'query' 문서 조회
  const [filter, setFilter] = useMsmState('pending');
  const [compose, setCompose] = useMsmState(false);
  // 문서 조회 상태
  const [docType, setDocType] = useMsmState('전체');
  const [period, setPeriod] = useMsmState('90');
  const [queried, setQueried] = useMsmState(false);
  const [loading, setLoading] = useMsmState(false);
  const { removed, leavingId, approve } = usePsnApprove();
  const search = () => { setLoading(true); setTimeout(() => { setLoading(false); setQueried(true); }, 420); };

  const filtered = D.approvals.filter(a => filter === 'all' ? true : a.status === filter);
  const chips = [
    { id: 'pending', lbl: '결재 대기', n: D.approvals.filter(a => a.status === 'pending').length },
    { id: 'done', lbl: '완료', n: D.approvals.filter(a => a.status === 'done').length },
    { id: 'rejected', lbl: '반려', n: D.approvals.filter(a => a.status === 'rejected').length },
    { id: 'all', lbl: '전체', n: D.approvals.length },
  ];
  // 조회용 문서 목록 (전자결재 결재문서 → 조회 항목으로 매핑)
  const docTypes = ['전체', ...Array.from(new Set(D.approvals.map(a => a.cat)))];
  const qItems = D.approvals
    .filter(a => docType === '전체' ? true : a.cat === docType)
    .filter(a => !removed.includes(a.id))
    .map(a => ({ id: a.id, date: a.date, label: a.title, note: a.author, step: a.step, icon: 'fileText',
      status: a.status === 'done' ? 'approved' : a.status }));

  return (
    <>
      <MsmAppbar topInset={topInset} eyebrow="협업" title="전자결재" actions={
        <button className="msm-ibtn accent" style={{ background: 'var(--accent)', color: '#fff' }} onClick={() => setCompose(true)}><Icon name="plus" size={19} /></button>
      } />
      <div className="msm-scroll">
        <div className="msm-body">
          {/* 결재함 / 문서 조회 세그먼트 */}
          <div className="mm-seg">
            <button className={mode === 'inbox' ? 'on' : ''} onClick={() => setMode('inbox')}>결재함</button>
            <button className={mode === 'query' ? 'on' : ''} onClick={() => setMode('query')}>문서 조회</button>
          </div>

          {mode === 'inbox' ? (
            <>
              {/* 필터칩 */}
              <div className="glm-chiprow" style={{ display: 'flex', gap: 7, overflowX: 'auto' }}>
                {chips.map(c => (
                  <button key={c.id} className={'glm-chip' + (filter === c.id ? ' on' : '')} onClick={() => setFilter(c.id)}>{c.lbl} <span className="ccnt">{c.n}</span></button>
                ))}
              </div>
              {/* 목록 */}
              <div className="msm-list">
                {filtered.length === 0 ? <div className="msm-empty"><Icon name="checkCircle" size={26} />문서가 없습니다.</div> : filtered.map(a => {
                  const st = D.APV_STATUS[a.status];
                  return (
                    <button key={a.id} className="msm-row" style={{ alignItems: 'flex-start' }}>
                      <span className="lead" style={{ background: 'var(--z-100)', color: 'var(--z-600)' }}><Icon name="fileText" size={18} /></span>
                      <div className="main">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span className="msm-badge muted" style={{ fontSize: 10 }}>{a.cat}</span>
                          {a.urgent && <span className="msm-badge danger" style={{ fontSize: 10 }}>긴급</span>}
                        </div>
                        <div className="nm" style={{ whiteSpace: 'normal' }}>{a.title}</div>
                        <div className="sub">{a.author} · {a.date}</div>
                      </div>
                      <div className="meta"><span className={'msm-badge ' + st.tone}>{st.lbl}</span><span className="time">{a.step}</span></div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              {/* 문서 조회 패널 */}
              <div className="msm-card" style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: 13 }}>
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--z-500)', marginBottom: 6 }}>문서 종류</div>
                  <select className="mm-select" style={{ width: '100%' }} value={docType} onChange={e => setDocType(e.target.value)}>
                    {docTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--z-500)', marginBottom: 6 }}>조회 기간</div>
                  <div style={{ display: 'flex', gap: 7 }}>
                    {PSN_PERIODS.map(([id, lbl]) => (
                      <button key={id} className={'glm-chip' + (period === id ? ' on' : '')}
                        style={{ flex: 1, justifyContent: 'center', textAlign: 'center' }} onClick={() => setPeriod(id)}>{lbl}</button>
                    ))}
                  </div>
                </div>
                <button className="msm-btn-lg accent" style={{ height: 46 }} onClick={search} disabled={loading}>
                  {loading ? <span className="psn-spin" /> : <Icon name="search" size={17} />}{loading ? ' 조회 중…' : ' 조회'}
                </button>
              </div>
              <PsnDocResults queried={queried} loading={loading} items={qItems} period={period}
                onApprove={approve} leavingId={leavingId}
                emptyHint="문서 종류·기간을 선택하고 조회 버튼을 눌러 결재문서를 확인하세요." />
            </>
          )}
          <div style={{ height: bottomInset + 8 }} />
        </div>
      </div>
      {/* 작성하기 (새 기안) */}
      <ApprovalCompose open={compose} topInset={topInset} bottomInset={bottomInset} onClose={() => setCompose(false)} />
    </>
  );
}

// ── 전자결재 작성하기 ──
const APV_TEMPLATES = [
  { group: '근태·휴가', items: ['연차신청', '연차계획서', '연장근무', '출결정정'] },
  { group: '업무·지원', items: ['수리요청서', '보고서 작성', '업무기안', '업무협조', '공문발송'] },
  { group: '구매·기타', items: ['물품신청', '양식신청', '연차촉진통보서'] },
];
const APV_LINE = [
  { n: '박유진', role: '기안자(나)', act: '기안', ts: '지금', me: true },
  { n: '김지오', role: '검토', act: null },
  { n: '박철홍', role: '전결', act: null },
];
const APV_CANDIDATES = ['김지오', '박철홍', '백정민', '이나림', '지민수', '홍자비', '송소현'];

function ApvForm({ tpl }) {
  const F = ({ label, req, children }) => (
    <div className="glm-field"><span className="lbl">{label}{req && <span style={{ color: 'var(--danger)' }}> *</span>}</span>{children}</div>
  );
  const Row = ({ children }) => <div style={{ display: 'flex', gap: 10 }}>{children}</div>;
  switch (tpl) {
    case '연차신청':
    case '연차계획서':
      return (
        <>
          <Row>
            <F label="시작일"><input className="glm-input" type="date" defaultValue="2026-05-20" /></F>
            <F label="종료일"><input className="glm-input" type="date" defaultValue="2026-05-21" /></F>
          </Row>
          <F label="휴가 종류"><select className="mm-select" style={{ width: '100%' }}><option>연차</option><option>반차(오전)</option><option>반차(오후)</option><option>병가</option><option>경조</option></select></F>
          <F label="사유" req><textarea className="glm-textarea" placeholder="간단한 사유를 작성해주세요" /></F>
          <F label="업무 인계"><textarea className="glm-textarea" placeholder="인계받을 직원과 인계 내용" style={{ minHeight: 70 }} /></F>
        </>
      );
    case '연장근무':
      return (
        <>
          <Row>
            <F label="근무일"><input className="glm-input" type="date" defaultValue="2026-05-13" /></F>
            <F label="구분"><select className="mm-select" style={{ width: '100%' }}><option>연장</option><option>야간</option><option>휴일</option></select></F>
          </Row>
          <Row>
            <F label="시작 시각"><input className="glm-input" type="time" defaultValue="18:00" /></F>
            <F label="종료 시각"><input className="glm-input" type="time" defaultValue="21:00" /></F>
          </Row>
          <F label="업무 내용" req><textarea className="glm-textarea" placeholder="연장근무 사유·업무 내용" /></F>
        </>
      );
    case '출결정정':
      return (
        <>
          <Row>
            <F label="정정 일자"><input className="glm-input" type="date" defaultValue="2026-05-02" /></F>
            <F label="정정 항목"><select className="mm-select" style={{ width: '100%' }}><option>출근</option><option>퇴근</option><option>외출</option></select></F>
          </Row>
          <Row>
            <F label="기록된 시각"><input className="glm-input" defaultValue="09:00" readOnly /></F>
            <F label="정정 시각" req><input className="glm-input" defaultValue="08:30" /></F>
          </Row>
          <F label="정정 사유" req><textarea className="glm-textarea" placeholder="정정이 필요한 사유" /></F>
        </>
      );
    case '물품신청':
      return (
        <>
          <Row>
            <F label="품목 분류"><select className="mm-select" style={{ width: '100%' }}><option>의료소모품</option><option>의료기기</option><option>약품</option><option>사무용품</option></select></F>
            <F label="희망 납기"><input className="glm-input" type="date" defaultValue="2026-05-16" /></F>
          </Row>
          <div className="msm-card" style={{ padding: 12 }}>
            <div className="msm-sec" style={{ padding: 0, marginBottom: 8 }}><span className="msm-sec-t" style={{ fontSize: 13 }}>신청 품목</span><span className="msm-sec-more">＋ 품목 추가</span></div>
            <div className="msm-list">
              <div className="msm-row" style={{ cursor: 'default', padding: 10 }}><div className="main"><div className="nm" style={{ fontSize: 13.5 }}>PSA 압박기 1대</div><div className="sub">의료기기 · 외래팀</div></div><span className="msm-row-val">1대</span></div>
              <div className="msm-row" style={{ cursor: 'default', padding: 10 }}><div className="main"><div className="nm" style={{ fontSize: 13.5 }}>라텍스 장갑 (S)</div><div className="sub">의료소모품</div></div><span className="msm-row-val">10 BOX</span></div>
            </div>
          </div>
          <F label="신청 사유"><textarea className="glm-textarea" placeholder="구매가 필요한 사유" style={{ minHeight: 70 }} /></F>
        </>
      );
    case '수리요청서':
      return (
        <>
          <Row>
            <F label="대상 자산"><input className="glm-input" defaultValue="2층 외래 데스크탑 PC" /></F>
            <F label="긴급도"><select className="mm-select" style={{ width: '100%' }}><option>보통</option><option>긴급</option></select></F>
          </Row>
          <F label="고장 증상" req><textarea className="glm-textarea" placeholder="고장 증상·발생 시점" /></F>
          <F label="요청 사항"><textarea className="glm-textarea" placeholder="수리 또는 교체 요청" style={{ minHeight: 60 }} /></F>
        </>
      );
    default:
      return (
        <>
          <F label="내용" req><textarea className="glm-textarea" placeholder="기안 내용을 작성해주세요" style={{ minHeight: 120 }} /></F>
        </>
      );
  }
}

function ApprovalCompose({ open, topInset, bottomInset, onClose }) {
  const [tpl, setTpl] = useMsmState('연차신청');
  const [line, setLine] = useMsmState(APV_LINE);
  const [pick, setPick] = useMsmState(false);
  const [load, setLoad] = useMsmState(false);
  const [tpls, setTpls] = useMsmState([
    { name: '연차신청 기본선', line: [{ n: '박유진', me: true, act: '기안' }, { n: '김지오', act: null }, { n: '박철홍', act: null }] },
    { name: '비품구매 결재선', line: [{ n: '박유진', me: true, act: '기안' }, { n: '홍자비', act: null }, { n: '백정민', act: null }, { n: '박철홍', act: null }] },
  ]);
  return (
    <div className={'glm-screen' + (open ? ' open' : '')}>
      <div className="glm-screen-head" style={{ paddingTop: topInset + 8 }}>
        <button className="glm-back" onClick={onClose}><Icon name="x" size={19} /> 취소</button>
        <div className="glm-screen-title">새 기안 작성</div>
        <div className="glm-screen-action" />
      </div>
      <div className="msm-scroll">
        <div className="msm-body">
          {/* 양식 선택 */}
          <div className="glm-field">
            <span className="lbl">결재 양식</span>
            <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
              <select className="mm-select" style={{ flex: '0 1 150px', minWidth: 0 }} value={tpl} onChange={e => setTpl(e.target.value)}>
                {APV_TEMPLATES.map(g => (
                  <optgroup key={g.group} label={g.group}>
                    {g.items.map(it => <option key={it} value={it}>{it}</option>)}
                  </optgroup>
                ))}
              </select>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button className="msm-mini-btn" style={{ height: 40 }} onClick={() => setLoad(v => !v)}><Icon name="file" size={13} /> 불러오기</button>
                <button className="msm-mini-btn" style={{ height: 40 }} onClick={() => { const nm = '결재선 ' + (tpls.length + 1); setTpls(t => [...t, { name: nm, line: line.map(p => ({ ...p, act: p.me ? '기안' : null })) }]); setLoad(true); }}><Icon name="check" size={13} /> 저장</button>
              </div>
            </div>
          </div>
          {/* 결재선 */}
          <div className="msm-sec"><span className="msm-sec-t">결재선</span><span className="msm-sec-more" style={{ color: 'var(--z-400)' }}>{line.length}단계</span></div>
          {load && (
            <div className="msm-card" style={{ padding: 10 }}>
              <div className="msm-sec" style={{ padding: 0, marginBottom: 8 }}><span className="msm-sec-t" style={{ fontSize: 13 }}>저장된 결재선 템플릿</span><button className="msm-sec-more" onClick={() => setLoad(false)}>닫기</button></div>
              <div className="msm-list">
                {tpls.map((t, i) => (
                  <div key={i} className="msm-row" style={{ padding: 10 }} onClick={() => { setLine(t.line.map(p => ({ ...p }))); setLoad(false); }}>
                    <span className="lead" style={{ background: 'var(--accent-soft)', color: 'var(--accent-700)' }}><Icon name="checkCircle" size={17} /></span>
                    <div className="main"><div className="nm" style={{ fontSize: 13.5 }}>{t.name}</div><div className="sub">{t.line.map(p => p.n).join(' → ')}</div></div>
                    <button onClick={(e) => { e.stopPropagation(); setTpls(ts => ts.filter((_, j) => j !== i)); }} style={{ border: 'none', background: 'transparent', color: 'var(--z-400)', cursor: 'pointer', padding: 6 }}><Icon name="trash" size={15} /></button>
                  </div>
                ))}
                {tpls.length === 0 && <div className="msm-empty" style={{ padding: 20 }}>저장된 템플릿이 없습니다.</div>}
              </div>
            </div>
          )}
          <div className="msm-card" style={{ display: 'flex', alignItems: 'flex-start', gap: 0, padding: '14px 8px', overflowX: 'auto' }}>
            {line.map((p, i) => (
              <React.Fragment key={i}>
                <div style={{ flex: '0 0 auto', minWidth: 72, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, position: 'relative' }}>
                  {!p.me && (
                    <button onClick={() => setLine(l => l.filter((_, j) => j !== i))} aria-label="삭제"
                      style={{ position: 'absolute', top: -6, right: 4, width: 18, height: 18, borderRadius: 999, border: 'none', background: 'var(--danger)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer', zIndex: 1 }}><Icon name="x" size={11} /></button>
                  )}
                  <span className="org-pic sm" style={{ background: p.me ? 'var(--accent)' : avTone(p.n) }}>{p.n[0]}</span>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>{p.n}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--z-400)' }}>{i === 0 ? '기안자(나)' : i === line.length - 1 ? '전결' : '검토'}</div>
                  <span className={'msm-badge ' + (p.act ? 'accent' : 'muted')} style={{ fontSize: 9.5 }}>{p.act || '대기'}</span>
                </div>
                {i < line.length - 1 && <div style={{ alignSelf: 'center', marginTop: 14 }}><Icon name="chevR" size={16} color="var(--z-300)" /></div>}
              </React.Fragment>
            ))}
            <div style={{ alignSelf: 'center', marginTop: 14, marginLeft: 6 }}>
              <button onClick={() => setPick(true)} aria-label="결재자 추가"
                style={{ width: 38, height: 38, borderRadius: 999, border: '1.5px dashed var(--border-strong)', background: '#fff', color: 'var(--accent)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon name="plus" size={18} /></button>
            </div>
          </div>
          {pick && (
            <div className="msm-card" style={{ padding: 10 }}>
              <div className="msm-sec" style={{ padding: 0, marginBottom: 8 }}><span className="msm-sec-t" style={{ fontSize: 13 }}>결재자 추가</span><button className="msm-sec-more" onClick={() => setPick(false)}>닫기</button></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {APV_CANDIDATES.filter(c => !line.some(p => p.n === c)).map(c => (
                  <button key={c} className="msm-mini-btn" onClick={() => { setLine(l => [...l, { n: c, role: '검토', act: null }]); setPick(false); }}>
                    <span className="org-pic sm" style={{ width: 20, height: 20, fontSize: 10, background: avTone(c), display: 'inline-grid', verticalAlign: 'middle', marginRight: 5 }}>{c[0]}</span>{c}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* 참조자 */}
          <div className="msm-sec"><span className="msm-sec-t">참조자</span><span className="msm-sec-more">＋ 추가</span></div>
          <div className="msm-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 7, padding: 13 }}>
            {['이나림', '송소현', '홍자비'].map(n => (
              <span key={n} className="glm-kwtag" style={{ paddingLeft: 5 }}>
                <span className="org-pic sm" style={{ width: 22, height: 22, fontSize: 11, background: avTone(n) }}>{n[0]}</span>
                {n}
                <button><Icon name="x" size={11} /></button>
              </span>
            ))}
            <button className="msm-mini-btn" style={{ height: 34 }}><Icon name="plus" size={13} /> 참조자 선택</button>
          </div>
          {/* 본문 폼 */}
          <div className="msm-sec"><span className="msm-sec-t">본문 — {tpl}</span><span className="msm-badge accent" style={{ marginLeft: 6 }}>기본 양식</span></div>
          <div className="glm-field"><span className="lbl">제목</span><input className="glm-input" defaultValue={tpl + ' 신청'} /></div>
          <ApvForm tpl={tpl} />
          <div className="glm-field"><span className="lbl">첨부 파일</span>
            <div className="glm-drop"><Icon name="upload" size={22} color="var(--z-400)" /><span className="t">탭하여 파일 선택</span></div>
          </div>
          <div style={{ height: bottomInset + 8 }} />
        </div>
      </div>
      <div className="glm-form-foot" style={{ paddingBottom: bottomInset + 12 }}>
        <button className="glm-btn" onClick={onClose}><Icon name="file" size={16} /> 임시저장</button>
        <button className="glm-btn primary" onClick={onClose}><Icon name="send" size={16} /> 결재 상신</button>
      </div>
    </div>
  );
}
