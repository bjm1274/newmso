// 업무공유 모바일 — 앱 셸 (목록 · 할일 · 시트 · 내비게이션)
// props: os ('ios'|'android'), topInset, bottomInset
function GuideMobileApp({ os = 'ios', topInset = 54, bottomInset = 34, onBack }) {
  const { useState, useMemo } = React;
  const company = GL.COMPANIES[0];
  const teams = company.divisions.flatMap(d => d.teams.map(t => ({ ...t, division: d.name })));

  const [teamKey, setTeamKey] = useState('t2');
  const [tab, setTab] = useState('res');
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [taskF, setTaskF] = useState('all');
  const [resources, setResources] = useState(GL.RESOURCES);
  const [tasks, setTasks] = useState(GL.TASKS);

  // overlays
  const [detailId, setDetailId] = useState(null);   // 상세 스크린
  const [composing, setComposing] = useState(false); // 등록 스크린
  const [sheet, setSheet] = useState(null);           // 'team' | 'more' | 'quicktask' | null
  const [toast, setToast] = useState('');

  const team = teams.find(t => t.key === teamKey) || teams[0];
  const baseRes = resources.filter(r => r.team === teamKey);
  const counts = {
    res: baseRes.length,
    edu: baseRes.filter(r => r.kind === 'education').length,
    handover: baseRes.filter(r => r.kind === 'handover').length,
    tasks: tasks.filter(t => t.team === teamKey && !t.done).length,
  };
  const filtered = baseRes.filter(r => {
    if (kind !== 'all' && r.kind !== kind) return false;
    if (q) { const hay = [r.title, r.desc, ...r.keywords, r.author].join(' ').toLowerCase(); if (!hay.includes(q.toLowerCase())) return false; }
    return true;
  });
  const teamTasks = tasks
    .filter(t => t.team === teamKey)
    .filter(t => taskF === 'all' ? true : taskF === 'open' ? !t.done : t.done)
    .sort((a, b) => (a.done !== b.done ? (a.done ? 1 : -1) : a.due.localeCompare(b.due)));

  const detailRes = resources.find(r => r.id === detailId) || null;
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2400); };
  const toggleTask = (id) => setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));

  const addResource = (data) => {
    const now = new Date('2026-05-12T10:00:00');
    const pad = (n) => String(n).padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const r = { id: 'new-' + Date.now(), team: data.teamKey, kind: data.kind, audience: data.audience, title: data.title, desc: data.desc || '(설명 없음 — 첨부파일 참조)', keywords: data.keywords, author: '나', date, attach: data.attach, isNew: true };
    setResources(prev => [r, ...prev]);
    setTeamKey(data.teamKey); setTab('res'); setKind('all'); setQ('');
    setComposing(false);
    showToast('업무자료를 등록했습니다.');
  };

  const safeTop = { paddingTop: topInset };
  const fabBottom = { bottom: bottomInset + 12 };
  const toastBottom = { bottom: bottomInset + 78 };

  return (
    <div className="glm">
      {/* 앱바 */}
      <div className="glm-appbar">
        <div className="glm-appbar-inner" style={safeTop}>
          <div className="glm-appbar-top">
            {onBack && (
              <button className="glm-ibtn" onClick={onBack} aria-label="뒤로" style={{ marginRight: 2 }}><Icon name="chevL" size={20} /></button>
            )}
            <div>
              <div className="glm-eyebrow">게시판</div>
              <div className="glm-title">업무공유</div>
            </div>
            <div className="glm-appbar-actions">
              <button className="glm-ibtn" onClick={() => setSheet('search')} aria-label="검색"><Icon name="search" size={19} /></button>
            </div>
          </div>
          {/* 회사·팀 셀렉터 */}
          <button className="glm-teamsel" onClick={() => setSheet('team')}>
            <div>
              <div className="ts-co">{company.name} · {team.division}</div>
              <div className="ts-team">{team.name}</div>
            </div>
            <div className="ts-stats">
              <span className="glm-mini accent">{counts.res}</span>
              <span className="glm-mini warn">{counts.handover}</span>
            </div>
            <span className="ts-chev"><Icon name="chevD" size={18} /></span>
          </button>
          {/* 세그먼트 */}
          <div className="glm-seg">
            <button className={tab === 'res' ? 'on' : ''} onClick={() => setTab('res')}>자료·인계 <span className="cnt">{counts.res}</span></button>
            <button className={tab === 'task' ? 'on' : ''} onClick={() => setTab('task')}>팀 할일 <span className="cnt">{counts.tasks}</span></button>
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div className="glm-scroll">
        {tab === 'res' ? (
          <div className="glm-body">
            <div className="glm-toolbar">
              <div className="glm-search">
                <Icon name="search" size={17} />
                <input placeholder="제목·키워드·작성자 검색" value={q} onChange={e => setQ(e.target.value)} />
              </div>
              <div className="glm-chiprow">
                {[
                  { id: 'all', lbl: '전체', cnt: counts.res },
                  { id: 'education', lbl: '업무자료', cnt: counts.edu },
                  { id: 'handover', lbl: '인수인계', cnt: counts.handover },
                ].map(c => (
                  <button key={c.id} className={'glm-chip' + (kind === c.id ? ' on' : '')} onClick={() => setKind(c.id)}>{c.lbl} <span className="ccnt">{c.cnt}</span></button>
                ))}
              </div>
            </div>
            {filtered.length === 0 ? (
              <div className="glm-empty"><Icon name="search" size={26} />조건에 맞는 자료가 없습니다.</div>
            ) : (
              filtered.map(r => <MResCard key={r.id} r={r} onClick={() => setDetailId(r.id)} />)
            )}
            <div style={{ height: bottomInset + 80 }} />
          </div>
        ) : (
          <div className="glm-body">
            <div className="glm-chiprow">
              {[{ id: 'all', lbl: '전체' }, { id: 'open', lbl: '진행중' }, { id: 'done', lbl: '완료' }].map(c => (
                <button key={c.id} className={'glm-chip' + (taskF === c.id ? ' on' : '')} onClick={() => setTaskF(c.id)}>{c.lbl}</button>
              ))}
            </div>
            {teamTasks.length === 0 ? (
              <div className="glm-empty"><Icon name="check" size={26} />할일이 없습니다.</div>
            ) : (
              teamTasks.map(t => {
                const pri = GL.PRI[t.priority];
                const soon = !t.done && t.due <= '2026-05-13';
                return (
                  <div key={t.id} className={'glm-task' + (t.done ? ' done' : '')}>
                    <button className={'glm-check' + (t.done ? ' on' : '')} onClick={() => toggleTask(t.id)}>{t.done && <Icon name="check" size={14} />}</button>
                    <div className="glm-task-main">
                      <div className="glm-task-titlerow">
                        <span className={'glm-pri ' + pri.tone}>{pri.lbl}</span>
                        <span className="glm-task-title">{t.title}</span>
                      </div>
                      {t.note && <div className="glm-task-note">{t.note}</div>}
                      <div className="glm-task-meta">
                        <span className={'due' + (soon ? ' soon' : '')}>마감 {t.due.slice(5).replace('-', '.')}</span>
                        <span>· {t.author}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div style={{ height: bottomInset + 80 }} />
          </div>
        )}
      </div>

      {/* FAB */}
      <button className="glm-fab" style={fabBottom} onClick={() => tab === 'res' ? setComposing(true) : setSheet('quicktask')}>
        <Icon name="plus" size={20} /> {tab === 'res' ? '자료 등록' : '할일 추가'}
      </button>

      {/* 상세 / 등록 스크린 */}
      <MDetailScreen r={detailRes} company={company.name} team={team.name}
        open={!!detailId} onClose={() => setDetailId(null)} onMore={() => setSheet('more')}
        topInset={topInset} bottomInset={bottomInset} />
      <MComposerScreen open={composing} company={company} defaultTeamKey={teamKey}
        onClose={() => setComposing(false)} onSubmit={addResource}
        topInset={topInset} bottomInset={bottomInset} />

      {/* ── 바텀시트들 ── */}
      <div className={'glm-scrim' + (sheet ? ' open' : '')} onClick={() => setSheet(null)} />

      {/* 팀 선택 */}
      <div className={'glm-sheet' + (sheet === 'team' ? ' open' : '')} style={{ paddingBottom: bottomInset }}>
        <div className="glm-sheet-grab" />
        <div className="glm-sheet-head">
          <div className="glm-sheet-title">팀 선택</div>
          <div className="glm-coseg" style={{ marginTop: 10 }}>
            {GL.COMPANIES.map(c => (
              <button key={c.id} className={'glm-cobtn' + (c.id === company.id ? ' on' : '')}>{c.name}</button>
            ))}
          </div>
        </div>
        <div className="glm-sheet-body">
          {company.divisions.map(div => (
            <div key={div.name}>
              <div className="glm-divlabel">{div.name}</div>
              {div.teams.map(t => (
                <button key={t.key} className={'glm-teamrow' + (t.key === teamKey ? ' on' : '')} onClick={() => { setTeamKey(t.key); setSheet(null); setDetailId(null); }}>
                  <span className="tr-nm">{t.name}</span>
                  {t.key === teamKey ? <span className="tr-check"><Icon name="check" size={20} /></span> : (
                    <span className="tr-pills">
                      <span className="glm-mini muted">{GL.teamResCount(t.key)}</span>
                      <span className="glm-mini warn">{GL.teamTaskCount(t.key)}</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 더보기 메뉴 */}
      <div className={'glm-sheet' + (sheet === 'more' ? ' open' : '')} style={{ paddingBottom: bottomInset }}>
        <div className="glm-sheet-grab" />
        <div className="glm-sheet-body" style={{ paddingTop: 6 }}>
          <button className="glm-menurow" onClick={() => setSheet(null)}><span className="mr-ic"><Icon name="edit" size={19} /></span> 수정</button>
          <button className="glm-menurow" onClick={() => { setSheet(null); showToast('공유 링크를 복사했습니다.'); }}><span className="mr-ic"><Icon name="share" size={19} /></span> 공유 링크 복사</button>
          <button className="glm-menurow" onClick={() => { setSheet(null); showToast('북마크에 저장했습니다.'); }}><span className="mr-ic"><Icon name="bookmark" size={19} /></span> 북마크</button>
          <button className="glm-menurow danger" onClick={() => { setSheet(null); setDetailId(null); showToast('업무자료를 삭제했습니다.'); }}><span className="mr-ic"><Icon name="trash" size={19} /></span> 삭제</button>
        </div>
      </div>

      {/* 빠른 할일 등록 */}
      <div className={'glm-sheet' + (sheet === 'quicktask' ? ' open' : '')} style={{ paddingBottom: bottomInset }}>
        <div className="glm-sheet-grab" />
        <div className="glm-sheet-head"><div className="glm-sheet-title">새 할일</div></div>
        <div className="glm-sheet-body">
          <div className="glm-quick">
            <div className="glm-field"><span className="lbl">할일</span><input className="glm-input" placeholder="예: 신규 입사자 EMR 단축키 교육" /></div>
            <div className="glm-field"><span className="lbl">우선순위</span>
              <select className="glm-select" defaultValue="medium"><option value="urgent">긴급</option><option value="high">높음</option><option value="medium">보통</option><option value="low">낮음</option></select>
            </div>
            <div className="glm-field"><span className="lbl">마감일</span><input className="glm-input" type="date" defaultValue="2026-05-15" /></div>
            <button className="glm-btn primary" style={{ width: '100%' }} onClick={() => { setSheet(null); showToast('팀 할일을 등록했습니다.'); }}><Icon name="plus" size={17} /> 등록</button>
          </div>
        </div>
      </div>

      {/* 검색 시트 (간이) */}
      <div className={'glm-sheet' + (sheet === 'search' ? ' open' : '')} style={{ paddingBottom: bottomInset }}>
        <div className="glm-sheet-grab" />
        <div className="glm-sheet-head"><div className="glm-sheet-title">검색</div></div>
        <div className="glm-sheet-body">
          <div className="glm-search">
            <Icon name="search" size={17} />
            <input autoFocus placeholder="제목·키워드·작성자" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <button className="glm-btn primary" style={{ width: '100%', marginTop: 14 }} onClick={() => setSheet(null)}>검색 결과 보기</button>
        </div>
      </div>

      {/* 토스트 */}
      <div className={'glm-toast' + (toast ? ' on' : '')} style={toastBottom}>
        <span className="ic"><Icon name="check" size={14} /></span>{toast}
      </div>
    </div>
  );
}
window.GuideMobileApp = GuideMobileApp;
