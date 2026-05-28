// MSO redesign — 업무공유 (게시판 서브)
// 커밋된 app/main/기능부품/게시판서브/업무가이드.tsx 사양 반영:
//   - 회사 → 본부 → 팀 계층
//   - 자료(GuideResource): 업무자료 / 업무 인수인계 + 대상(신규/기존/전체) + 키워드 + 첨부
//   - 팀 할일(GuideTask): 우선순위·마감·완료 토글
//   - 좌측 팀 사이드바, 우측 컨텐츠

// ─────────────────────────── 더미 데이터 ───────────────────────────
const GL_COMPANIES = [
  { id:'co1', name:'박철홍정형외과', divisions: [
    { name:'진료부', teams:[
      { key:'t1', name:'진료팀',   members: 4 },
      { key:'t2', name:'외래팀',   members: 6 },
      { key:'t3', name:'병동팀',   members: 8 },
      { key:'t4', name:'검사팀',   members: 3 },
    ]},
    { name:'경영지원부', teams:[
      { key:'t5', name:'경영지원팀', members: 4 },
      { key:'t6', name:'영양팀',     members: 2 },
    ]},
  ]},
  { id:'co2', name:'수연의원',       divisions: [
    { name:'진료부',     teams:[{ key:'t7', name:'외래팀', members: 5 }, { key:'t8', name:'병동팀', members: 6 }]},
    { name:'경영지원부', teams:[{ key:'t9', name:'경영지원팀', members: 3 }]},
  ]},
  { id:'co3', name:'MSO 본사',       divisions: [
    { name:'본부',       teams:[{ key:'t10', name:'운영팀', members: 4 }, { key:'t11', name:'IT팀', members: 3 }]},
  ]},
];

const GL_RESOURCES = [
  { id:'r1', team:'t2', kind:'education', audience:'new_hire', title:'외래 접수 응대 매뉴얼 v2.4',
    desc:'환자 접수 시 본인 확인 → 보험 확인 → 진료 카테고리 분류 순서로 응대합니다. 첫인사 멘트와 자주 묻는 질문 16종 포함.',
    keywords:['접수','응대','매뉴얼'], author:'김지오', date:'2026-05-08 14:22', attach: 3 },
  { id:'r2', team:'t2', kind:'education', audience:'all_staff', title:'환자 등록 시스템 단축키 모음',
    desc:'EMR 환자 등록·검색·차트 열람에 자주 쓰는 단축키 20종. F5는 새로고침이 아니라 진료 시작입니다.',
    keywords:['단축키','EMR','속도'], author:'지민수', date:'2026-05-06 11:00', attach: 1 },
  { id:'r3', team:'t2', kind:'handover', audience:'current_staff', title:'5월 2주차 외래 인수인계',
    desc:'주말 동안 미응대 콜 12건. 박OO 환자 재진료 예약 5/13 10:30. MRI 결과지 출력 누락 건 확인 필요.',
    keywords:['주간인계','콜','MRI'], author:'박지영', date:'2026-05-11 18:30', attach: 0 },
  { id:'r4', team:'t2', kind:'education', audience:'new_hire', title:'보험 청구 코드 빠른 참조표',
    desc:'정형외과 외래에서 가장 자주 쓰는 청구 코드 80개. 출력해서 책상 옆에 붙여두면 좋습니다.',
    keywords:['청구','보험','코드'], author:'김지오', date:'2026-04-29 09:18', attach: 2 },
  { id:'r5', team:'t2', kind:'handover', audience:'all_staff', title:'5월 1주차 외래 인수인계',
    desc:'장기 미수금 환자 3명 (송OO, 박OO, 곽OO). 안내 우선순위는 송OO부터.',
    keywords:['주간인계','미수금'], author:'박지영', date:'2026-05-04 18:00', attach: 0 },
  { id:'r6', team:'t2', kind:'education', audience:'current_staff', title:'전자 동의서 흐름 변경 안내',
    desc:'5/15부터 종이 동의서는 폐지됩니다. 태블릿으로 환자 본인 서명 후 자동 PDF 저장됩니다.',
    keywords:['전자동의서','태블릿','PDF'], author:'지민수', date:'2026-05-10 16:00', attach: 1 },
];

const GL_TASKS = [
  { id:'k1', team:'t2', title:'EMR 신규 단축키 5종 전원 교육', priority:'high', due:'2026-05-15', done:false, author:'김지오', note:'화요일 점심시간 15분' },
  { id:'k2', team:'t2', title:'5월 외래 미수금 3건 안내 콜', priority:'urgent', due:'2026-05-13', done:false, author:'박지영', note:'송OO 우선' },
  { id:'k3', team:'t2', title:'태블릿 전자동의서 동선 리허설', priority:'medium', due:'2026-05-14', done:false, author:'지민수', note:'박철홍 원장 시연 후 진행' },
  { id:'k4', team:'t2', title:'4월 응대 클레임 회고록 정리', priority:'low', due:'2026-05-20', done:true, author:'김지오', note:'완료 — 인계함에 첨부' },
  { id:'k5', team:'t2', title:'주차장 도색 안내문 게시', priority:'medium', due:'2026-05-12', done:true, author:'박지영', note:'완료 — 정문/후문 모두 부착' },
];

const GL_KIND_LABEL = { education: '업무자료', handover: '업무 인수인계' };
const GL_AUDIENCE_LABEL = { new_hire: '신규직원', current_staff: '기존직원', all_staff: '전체직원' };
const GL_PRI_META = {
  urgent: { lbl:'긴급', tone:'danger' },
  high:   { lbl:'높음', tone:'warn' },
  medium: { lbl:'보통', tone:'accent' },
  low:    { lbl:'낮음', tone:'muted' },
};

const GuideLibraryScreen = () => {
  const [coId, setCoId] = React.useState('co1');
  const [teamKey, setTeamKey] = React.useState('t2');
  const [tab, setTab] = React.useState('resources'); // resources | tasks
  const [kindFilter, setKindFilter] = React.useState('all'); // all | education | handover
  const [audienceFilter, setAudienceFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [taskFilter, setTaskFilter] = React.useState('all'); // all | open | done
  const [selectedResource, setSelectedResource] = React.useState('r1');

  const company = GL_COMPANIES.find(c => c.id === coId) || GL_COMPANIES[0];
  const teams = company.divisions.flatMap(d => d.teams);
  const activeTeam = teams.find(t => t.key === teamKey) || teams[0];

  // 카운트
  const counts = React.useMemo(() => {
    const c = { resources: 0, handover: 0, tasks: 0 };
    GL_RESOURCES.forEach(r => {
      if (r.team !== activeTeam.key) return;
      c.resources += 1;
      if (r.kind === 'handover') c.handover += 1;
    });
    GL_TASKS.forEach(t => { if (t.team === activeTeam.key) c.tasks += 1; });
    return c;
  }, [activeTeam.key]);

  const teamResources = GL_RESOURCES.filter(r => {
    if (r.team !== activeTeam.key) return false;
    if (kindFilter !== 'all' && r.kind !== kindFilter) return false;
    if (audienceFilter !== 'all' && r.audience !== audienceFilter) return false;
    if (search) {
      const kw = search.toLowerCase();
      const hay = [r.title, r.desc, ...r.keywords, r.author].join(' ').toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });

  const teamTasks = GL_TASKS.filter(t => {
    if (t.team !== activeTeam.key) return false;
    if (taskFilter === 'open') return !t.done;
    if (taskFilter === 'done') return t.done;
    return true;
  }).sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.due.localeCompare(b.due);
  });

  const teamResourceCount = (key) => GL_RESOURCES.filter(r => r.team === key).length;
  const teamTaskCount = (key) => GL_TASKS.filter(t => t.team === key).length;

  const sel = teamResources.find(r => r.id === selectedResource) || teamResources[0];

  return (
    <div className="main">
      <div className="content gl-content">
        {/* 헤더 */}
        <div className="gl-header">
          <div>
            <div className="gl-h-eyebrow">게시판 › 업무공유</div>
            <div className="gl-h-title">{company.name} · {activeTeam.name}</div>
            <div className="gl-h-sub">팀 단위로 자료·인수인계·할일을 한 곳에서. 신규 입사자 온보딩과 주간 인계가 자동으로 모입니다.</div>
          </div>
          <div className="row" style={{gap: 8}}>
            <span className="gl-stat tone-accent">{counts.resources}건 자료</span>
            <span className="gl-stat tone-warn">{counts.handover}건 인수인계</span>
            <span className="gl-stat tone-muted">{counts.tasks}건 할일</span>
            <Btn icon="plus" variant="primary">새 자료 등록</Btn>
          </div>
        </div>

        {/* 2-col split */}
        <div className="gl-split">
          {/* 좌측 팀 사이드바 */}
          <aside className="gl-side">
            <div className="gl-side-label">회사</div>
            <select className="input" value={coId} onChange={(e) => {
              setCoId(e.target.value);
              const nextCo = GL_COMPANIES.find(c => c.id === e.target.value);
              setTeamKey(nextCo?.divisions[0]?.teams[0]?.key || 't2');
            }}>
              {GL_COMPANIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <div className="gl-side-divisions">
              {company.divisions.map(div => (
                <div key={div.name} className="gl-div">
                  <div className="gl-div-label">{div.name}</div>
                  {div.teams.map(t => {
                    const on = t.key === teamKey;
                    return (
                      <button key={t.key}
                        className={'gl-team' + (on ? ' on' : '')}
                        onClick={() => setTeamKey(t.key)}
                      >
                        <span className="gl-team-name">{t.name}</span>
                        <span className="gl-team-meta">
                          <span className="gl-team-pill">{teamResourceCount(t.key)}</span>
                          <span className="gl-team-pill warn">{teamTaskCount(t.key)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="gl-side-foot">
              <button className="gl-add-team">+ 새 팀 추가</button>
            </div>
          </aside>

          {/* 우측 컨텐츠 */}
          <section className="gl-main">
            <div className="gl-toolbar">
              <div className="gl-seg">
                <button className={tab === 'resources' ? 'on' : ''} onClick={() => setTab('resources')}>
                  업무자료·인수인계 <span className="gl-seg-cnt">{counts.resources}</span>
                </button>
                <button className={tab === 'tasks' ? 'on' : ''} onClick={() => setTab('tasks')}>
                  팀 할일 <span className="gl-seg-cnt">{counts.tasks}</span>
                </button>
              </div>
              <div className="row" style={{gap: 8, flex: 1, justifyContent:'flex-end'}}>
                <div className="input-wrap">
                  <Icon name="search" size={14} className="ico"/>
                  <input className="input" placeholder="제목·키워드·작성자 검색"
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    style={{paddingLeft: 30, width: 220}}/>
                </div>
                {tab === 'resources' ? (
                  <>
                    <select className="input" value={audienceFilter} onChange={(e) => setAudienceFilter(e.target.value)}>
                      <option value="all">대상 — 전체</option>
                      <option value="new_hire">신규직원</option>
                      <option value="current_staff">기존직원</option>
                      <option value="all_staff">전체직원</option>
                    </select>
                  </>
                ) : null}
              </div>
            </div>

            {tab === 'resources' ? (
              <>
                {/* 종류 칩 */}
                <div className="gl-chips">
                  {[
                    { id:'all',        lbl:'전체',          cnt: counts.resources },
                    { id:'education',  lbl:'업무자료',       cnt: counts.resources - counts.handover },
                    { id:'handover',   lbl:'업무 인수인계',  cnt: counts.handover },
                  ].map(c => (
                    <button key={c.id}
                      className={'gl-chip' + (kindFilter === c.id ? ' on' : '')}
                      onClick={() => setKindFilter(c.id)}
                    >
                      {c.lbl} <span className="gl-chip-cnt">{c.cnt}</span>
                    </button>
                  ))}
                </div>

                {/* 자료 split: 좌 리스트, 우 상세 */}
                <div className="gl-resource-split">
                  <div className="gl-resource-list">
                    {teamResources.length === 0 ? (
                      <div className="gl-empty">필터 조건에 맞는 자료가 없습니다.</div>
                    ) : teamResources.map(r => {
                      const on = sel && sel.id === r.id;
                      return (
                        <button key={r.id}
                          className={'gl-res-row' + (on ? ' on' : '')}
                          onClick={() => setSelectedResource(r.id)}
                        >
                          <div className="row" style={{gap: 6, alignItems:'center', flexWrap:'wrap'}}>
                            <span className={'gl-kind ' + r.kind}>{GL_KIND_LABEL[r.kind]}</span>
                            <span className="gl-aud">{GL_AUDIENCE_LABEL[r.audience]}</span>
                            {r.attach > 0 && (
                              <span className="gl-attach">
                                <Icon name="file" size={11}/> {r.attach}
                              </span>
                            )}
                          </div>
                          <div className="gl-res-title">{r.title}</div>
                          <div className="gl-res-desc">{r.desc}</div>
                          <div className="gl-res-foot">
                            <span>{r.author}</span>
                            <span>·</span>
                            <span>{r.date}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="gl-resource-detail">
                    {sel ? (
                      <>
                        <div className="row" style={{gap: 6, alignItems:'center', flexWrap:'wrap'}}>
                          <span className={'gl-kind ' + sel.kind}>{GL_KIND_LABEL[sel.kind]}</span>
                          <span className="gl-aud">{GL_AUDIENCE_LABEL[sel.audience]}</span>
                          <div style={{flex: 1}}/>
                          <Btn size="sm" icon="edit">수정</Btn>
                          <Btn size="sm" icon="x">삭제</Btn>
                        </div>
                        <h3 className="gl-detail-title">{sel.title}</h3>
                        <div className="gl-detail-foot">
                          {sel.author} · {company.name} · {activeTeam.name} · {sel.date}
                        </div>
                        <p className="gl-detail-desc">{sel.desc}</p>

                        {sel.keywords.length > 0 && (
                          <div className="gl-detail-keys">
                            {sel.keywords.map(k => <span key={k} className="gl-key">#{k}</span>)}
                          </div>
                        )}

                        {sel.attach > 0 && (
                          <div className="gl-detail-att">
                            <div className="gl-detail-att-label">첨부 {sel.attach}개</div>
                            {Array.from({length: sel.attach}).map((_, i) => (
                              <div key={i} className="gl-att-row">
                                <Icon name="file" size={14}/>
                                <span className="strong">첨부파일_{i+1}.pdf</span>
                                <span className="small">· 1.2MB</span>
                                <div style={{flex:1}}/>
                                <button className="gl-att-dl">다운로드</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="gl-empty">선택된 자료가 없습니다.</div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* 할일 빠른 등록 */}
                <div className="gl-task-quick">
                  <input className="input gl-task-input" placeholder="새 할일 — 예: 신규 입사자 EMR 단축키 교육"/>
                  <select className="input">
                    <option>보통</option>
                    <option>긴급</option>
                    <option>높음</option>
                    <option>낮음</option>
                  </select>
                  <input className="input" type="date" defaultValue="2026-05-15" style={{width: 150}}/>
                  <Btn variant="primary" icon="plus">등록</Btn>
                </div>

                {/* 할일 필터 */}
                <div className="gl-chips">
                  {[
                    { id:'all',  lbl:'전체',   cnt: counts.tasks },
                    { id:'open', lbl:'진행중', cnt: GL_TASKS.filter(t => t.team === activeTeam.key && !t.done).length },
                    { id:'done', lbl:'완료',   cnt: GL_TASKS.filter(t => t.team === activeTeam.key && t.done).length },
                  ].map(c => (
                    <button key={c.id}
                      className={'gl-chip' + (taskFilter === c.id ? ' on' : '')}
                      onClick={() => setTaskFilter(c.id)}
                    >
                      {c.lbl} <span className="gl-chip-cnt">{c.cnt}</span>
                    </button>
                  ))}
                </div>

                {/* 할일 리스트 */}
                <div className="gl-task-list">
                  {teamTasks.length === 0 ? (
                    <div className="gl-empty">표시할 할일이 없습니다.</div>
                  ) : teamTasks.map(t => {
                    const pri = GL_PRI_META[t.priority];
                    return (
                      <div key={t.id} className={'gl-task-row' + (t.done ? ' done' : '')}>
                        <button className={'gl-task-check' + (t.done ? ' on' : '')}>
                          {t.done ? <Icon name="check" size={12}/> : null}
                        </button>
                        <span className={'gl-task-pri tone-' + pri.tone}>{pri.lbl}</span>
                        <div className="gl-task-main">
                          <div className="gl-task-title">{t.title}</div>
                          {t.note && <div className="gl-task-note">{t.note}</div>}
                        </div>
                        <div className="gl-task-meta">
                          <span className="gl-task-due">마감 {t.due}</span>
                          <span className="gl-task-author">· {t.author}</span>
                        </div>
                        <button className="gl-task-more">⋯</button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </div>

        <Notes
          kicker="§ 게시판 — 업무공유 (신규)"
          title="회사 → 팀 단위로 자료·인수인계·할일을 한 곳에. 신규 입사 온보딩과 주간 인계가 같은 좌표에서."
          points={[
            { t:'좌측 팀 사이드바', b:'회사 → 본부 → 팀 계층을 그대로. 팀마다 자료 수(파랑)·할일 수(주황) 두 핀으로 빠른 스캔. 회사 select로 다중 기관 전환.' },
            { t:'자료 / 인수인계 / 할일 — 같은 코너', b:'팀 탭으로 컨텐츠 종류 전환. 자료(업무자료/인수인계)는 좌 리스트 + 우 상세 split. 할일은 빠른 등록 줄 + 단일 리스트.' },
            { t:'대상별 자료 분류 (신규/기존/전체)', b:'자료마다 대상 칩(신규직원 · 기존직원 · 전체직원). 신규 입사자 첫 출근 안내 자료가 자동으로 모이는 흐름.' },
            { t:'키워드 + 첨부 인덱싱', b:'각 자료에 #키워드 자유 입력 — 검색에 함께 걸림. 첨부 첨부수 인디케이터(아이콘 + 숫자)로 자료 무게 즉시 표시.' },
            { t:'팀 할일 — 우선순위·마감·완료 토글', b:'긴급(빨강) / 높음(주황) / 보통(파랑) / 낮음(회색) 4단계. 완료 항목은 자동으로 하단 정렬 + 흐림. 빠른 등록 줄로 1초 추가.' },
            { t:'권한 분리', b:'본인 작성 자료·할일만 수정·삭제 (MSO 관리자는 전체). board_posts 테이블에 board_type=업무가이드 / 업무가이드_팀할일로 저장.' },
          ]}
        />
      </div>
    </div>
  );
};

Object.assign(window, { GuideLibraryScreen });
