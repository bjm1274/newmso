// 업무공유 모바일 — 카드 / 상세 / 컴포저 / 시트 부품
const { useState: useMState, useRef: useMRef } = React;
const MGL = window.GL;
const mInit = (n) => (n || '').slice(0, 1);

// ── 자료 카드 ──
function MResCard({ r, onClick }) {
  return (
    <button className={'glm-card ' + r.kind} onClick={onClick}>
      <div className="glm-card-top">
        <span className={'glm-kind ' + r.kind}>{MGL.KIND_LABEL[r.kind]}</span>
        <span className={'glm-aud ' + r.audience}>{MGL.AUD_LABEL[r.audience]}</span>
        {r.isNew && <span className="glm-newbadge">NEW</span>}
        {r.attach > 0 && <span className="glm-card-attach"><Icon name="file" size={13} /> {r.attach}</span>}
      </div>
      <div className="glm-card-title">{r.title}</div>
      <div className="glm-card-desc">{r.desc}</div>
      <div className="glm-card-keys">{r.keywords.map(k => <span key={k} className="glm-key">#{k}</span>)}</div>
      <div className="glm-card-foot">
        <span className="glm-avatar">{mInit(r.author)}</span>
        <span>{r.author}</span>
        <span className="date">{MGL.rel(r.date)}</span>
      </div>
    </button>
  );
}

// ── 상세 스크린 ──
function MDetailScreen({ r, company, team, open, onClose, onMore, topInset = 0, bottomInset = 0 }) {
  return (
    <div className={'glm-screen' + (open ? ' open' : '')}>
      <div className="glm-screen-head" style={{ paddingTop: topInset + 8 }}>
        <button className="glm-back" onClick={onClose}><Icon name="chevL" size={20} /> 목록</button>
        <div className="glm-screen-title">자료 상세</div>
        <div className="glm-screen-action">
          <button className="glm-ibtn" onClick={onMore}><Icon name="moreH" size={18} /></button>
        </div>
      </div>
      <div className="glm-scroll">
        {r && (
          <div className="glm-detail">
            <div className="glm-detail-badges">
              <span className={'glm-kind ' + r.kind}>{MGL.KIND_LABEL[r.kind]}</span>
              <span className={'glm-aud ' + r.audience}>{MGL.AUD_LABEL[r.audience]}</span>
              {r.isNew && <span className="glm-newbadge">NEW</span>}
            </div>
            <div className="glm-detail-title">{r.title}</div>
            <div className="glm-detail-meta">
              <span className="glm-avatar">{mInit(r.author)}</span>
              <span style={{ fontWeight: 700, color: 'var(--z-700)' }}>{r.author}</span>
              <span className="glm-meta-sep">{company} · {team}</span>
              <span className="glm-meta-date"><Icon name="clock" size={13} color="var(--z-400)" /> {r.date}</span>
            </div>
            <div className="glm-detail-desc">{r.desc}</div>
            {r.keywords.length > 0 && (
              <div className="glm-detail-keys">{r.keywords.map(k => <span key={k} className="glm-key">#{k}</span>)}</div>
            )}
            {r.attach > 0 && (
              <div className="glm-att">
                <div className="glm-att-lbl">첨부 {r.attach}개</div>
                {Array.from({ length: r.attach }).map((_, i) => (
                  <div key={i} className="glm-att-row">
                    <Icon name="file" size={17} color="var(--z-400)" />
                    <span className="nm">첨부파일_{i + 1}.pdf</span>
                    <span className="sz">1.2MB</span>
                    <Icon name="arrowDown" size={16} color="var(--accent)" />
                  </div>
                ))}
              </div>
            )}
            <div style={{ height: bottomInset + 24 }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── 등록 컴포저 스크린 ──
function MComposerScreen({ open, company, defaultTeamKey, onClose, onSubmit, topInset = 0, bottomInset = 0 }) {
  const [teamKey, setTeamKey] = useMState(defaultTeamKey);
  const [title, setTitle] = useMState('');
  const [division, setDivision] = useMState('');
  const [kind, setKind] = useMState('education');
  const [audience, setAudience] = useMState('all_staff');
  const [keywords, setKeywords] = useMState([]);
  const [kwInput, setKwInput] = useMState('');
  const [desc, setDesc] = useMState('');
  const [files, setFiles] = useMState([]);
  const [touched, setTouched] = useMState(false);
  const fileRef = useMRef(null);

  React.useEffect(() => { if (open) setTeamKey(defaultTeamKey); }, [open, defaultTeamKey]);

  const titleErr = touched && !title.trim();
  const contentErr = touched && !desc.trim() && files.length === 0;
  const addKw = (raw) => {
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length) setKeywords(prev => [...new Set([...prev, ...parts])]);
    setKwInput('');
  };
  const onKwKey = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && kwInput.trim()) { e.preventDefault(); addKw(kwInput); }
    else if (e.key === 'Backspace' && !kwInput && keywords.length) setKeywords(prev => prev.slice(0, -1));
  };
  const pickFiles = (list) => {
    const arr = Array.from(list).map(f => ({ name: f.name, size: (f.size / 1024 / 1024).toFixed(1) + 'MB' }));
    setFiles(prev => [...prev, ...arr]);
  };
  const reset = () => { setTitle(''); setDivision(''); setKeywords([]); setKwInput(''); setDesc(''); setFiles([]); setTouched(false); setKind('education'); setAudience('all_staff'); };
  const submit = () => {
    setTouched(true);
    if (!title.trim()) return;
    if (!desc.trim() && files.length === 0) return;
    onSubmit({ teamKey, title: title.trim(), kind, audience, keywords, desc: desc.trim(), attach: files.length });
    reset();
  };
  const close = () => { reset(); onClose(); };

  return (
    <div className={'glm-screen' + (open ? ' open' : '')}>
      <div className="glm-screen-head" style={{ paddingTop: topInset + 8 }}>
        <button className="glm-back" onClick={close}><Icon name="x" size={19} /> 취소</button>
        <div className="glm-screen-title">새 자료 등록</div>
        <div className="glm-screen-action" />
      </div>
      <div className="glm-scroll">
        <div className="glm-form">
          <div className="glm-field">
            <span className="lbl">회사</span>
            <input className="glm-input" value={company.name} readOnly />
          </div>
          <div className="glm-field">
            <span className="lbl">팀<span className="req">*</span></span>
            <select className="glm-select" value={teamKey} onChange={e => setTeamKey(e.target.value)}>
              {company.divisions.map(div => (
                <optgroup key={div.name} label={div.name}>
                  {div.teams.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="glm-field">
            <span className="lbl">제목<span className="req">*</span></span>
            <input className={'glm-input' + (titleErr ? ' invalid' : '')} value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 수술팀 신규 직원 준비 가이드" />
            {titleErr && <span className="err">제목을 입력해 주세요.</span>}
          </div>
          <div className="glm-field">
            <span className="lbl">소속 부문</span>
            <input className="glm-input" value={division} onChange={e => setDivision(e.target.value)} placeholder="예: 간호부" />
          </div>
          <div className="glm-field">
            <span className="lbl">공유 유형</span>
            <div className="glm-typecards">
              <button type="button" className={'glm-typecard' + (kind === 'education' ? ' on' : '')} onClick={() => setKind('education')}>
                <span className="glm-tc-head"><span className="glm-tc-radio" /><span className="glm-tc-nm">업무자료</span></span>
                <span className="glm-tc-desc">매뉴얼·가이드·참조표</span>
              </button>
              <button type="button" className={'glm-typecard handover' + (kind === 'handover' ? ' on' : '')} onClick={() => setKind('handover')}>
                <span className="glm-tc-head"><span className="glm-tc-radio" /><span className="glm-tc-nm">인수인계</span></span>
                <span className="glm-tc-desc">주간 인계·당직 전달</span>
              </button>
            </div>
          </div>
          <div className="glm-field">
            <span className="lbl">대상 직원</span>
            <select className="glm-select" value={audience} onChange={e => setAudience(e.target.value)}>
              <option value="new_hire">신규직원</option>
              <option value="current_staff">기존직원</option>
              <option value="all_staff">전체직원</option>
            </select>
          </div>
          <div className="glm-field">
            <span className="lbl">검색 키워드</span>
            <div className="glm-kwbox" onClick={() => document.getElementById('glm-kw')?.focus()}>
              {keywords.map(k => (
                <span key={k} className="glm-kwtag">#{k}<button onClick={() => setKeywords(prev => prev.filter(x => x !== k))}><Icon name="x" size={11} /></button></span>
              ))}
              <input id="glm-kw" value={kwInput} onChange={e => setKwInput(e.target.value)} onKeyDown={onKwKey} onBlur={() => kwInput.trim() && addKw(kwInput)} placeholder={keywords.length ? '' : '예: 신규교육, 체크리스트'} />
            </div>
          </div>
          <div className="glm-field">
            <span className="lbl">설명 / 프로세스<span className="req">*</span></span>
            <textarea className={'glm-textarea' + (contentErr ? ' invalid' : '')} value={desc} onChange={e => setDesc(e.target.value)} placeholder={'1. 준비 전 확인\n- 환자, 일정, 재고 확인\n\n2. 진행 순서\n- 단계별로 작성'} />
            {contentErr && <span className="err">설명 또는 첨부파일을 하나 이상 등록해 주세요.</span>}
          </div>
          <div className="glm-field">
            <span className="lbl">첨부파일</span>
            <div className="glm-drop" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={22} color="var(--z-400)" />
              <span className="t">탭하여 파일 선택</span>
              <span className="s">PDF · 이미지 · 문서 (개당 20MB)</span>
            </div>
            <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={e => pickFiles(e.target.files)} />
            {files.length > 0 && (
              <div className="glm-files">
                {files.map((f, i) => (
                  <div key={i} className="glm-fileitem">
                    <Icon name="file" size={15} color="var(--z-400)" />
                    <span className="nm">{f.name}</span><span className="sz">{f.size}</span>
                    <button className="rm" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ height: 8 }} />
        </div>
      </div>
      <div className="glm-form-foot" style={{ paddingBottom: bottomInset + 12 }}>
        <button className="glm-btn" onClick={close}>취소</button>
        <button className="glm-btn primary" onClick={submit}><Icon name="check" size={17} /> 등록</button>
      </div>
    </div>
  );
}

Object.assign(window, { MResCard, MDetailScreen, MComposerScreen, mInit });
