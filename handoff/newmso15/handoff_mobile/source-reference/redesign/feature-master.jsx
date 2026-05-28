// MSO redesign — 시스템 마스터 센터 (관리자 서브)
// 커밋된 app/main/기능부품/관리자전용서브/시스템마스터센터.tsx 사양 반영:
//   - 8개 탭: 개요 / 운영대시보드 / 변경이력 / 권한변경 / 전체채팅 / 정합성점검 / 복구센터 / 연차수동부여
//   - 단어 필터(금지어), 권한 diff, 푸시·크론 실패, 백업·복원, 위키 버전

const MC_TABS = [
  { id:'overview',  label:'개요',         icon:'arrowUp' },
  { id:'ops',       label:'운영대시보드', icon:'trending' },
  { id:'history',   label:'변경이력',     icon:'fileText' },
  { id:'perms',     label:'권한변경',     icon:'shield' },
  { id:'chats',     label:'전체채팅',     icon:'chat' },
  { id:'health',    label:'정합성점검',   icon:'alertTri' },
  { id:'recovery',  label:'복구센터',     icon:'refresh' },
  { id:'leave',     label:'연차수동부여', icon:'calendar' },
];

// ─────────────────────────── 더미 데이터 ───────────────────────────
const MC_SUMMARY = {
  staffs: 32,        // 활성 직원
  audits: 1247,      // 최근 30일 감사 로그
  payrolls: 156,     // 최근 6개월 급여 레코드
  chatRooms: 28,
  chatMessages: 4892,
  pushFailures: 3,
  cronJobs: 12,
  backups: 14,
  sensitiveStaffs: 32,
};

const MC_RECENT_AUDITS = [
  { id:1, time:'2026-05-12 14:21', actor:'백정민 (이사)',   category:'급여',     action:'급여명세서 수정',       target:'박철홍 — 2026-04 명세서' },
  { id:2, time:'2026-05-12 14:08', actor:'김지오 (간호과장)', category:'권한',     action:'권한 정책 부여',       target:'박지영 — 외래팀 매니저' },
  { id:3, time:'2026-05-12 13:55', actor:'시스템',           category:'백업',     action:'주간 백업 완료',       target:'mso_backup_2026-05-12.dump' },
  { id:4, time:'2026-05-12 13:32', actor:'백정민 (이사)',   category:'인사',     action:'직원 상태 변경',       target:'조현준 → 휴직' },
  { id:5, time:'2026-05-12 12:18', actor:'홍자비 (주임)',   category:'재고',     action:'발주서 일괄 발송',     target:'3M Korea — 12품목' },
  { id:6, time:'2026-05-12 11:45', actor:'시스템',           category:'알림',     action:'푸시 발송 실패 감지',  target:'iOS 디바이스 1대' },
  { id:7, time:'2026-05-12 11:22', actor:'박철홍 (병원장)', category:'문서',     action:'민감 문서 열람',       target:'2026-04 급여대장' },
  { id:8, time:'2026-05-12 10:50', actor:'백정민 (이사)',   category:'권한',     action:'권한 정책 회수',       target:'전 직원 — 결재 양식 편집' },
];

const MC_PERM_DIFFS = [
  { id:'p1', time:'2026-05-12 14:08', target:'박지영', before:['결재.작성','재고.조회'], after:['결재.작성','재고.조회','외래.매니저','직원평가.작성','휴가승인'] },
  { id:'p2', time:'2026-05-11 17:30', target:'홍자비', before:['재고.조회'], after:['재고.조회','재고.발주','거래처관리'] },
  { id:'p3', time:'2026-05-10 09:12', target:'전 직원', before:['결재.양식.편집'], after:[] },
];

const MC_CHAT_ROOMS = [
  { id:'c1', name:'경영진 협의실',   members: 4,  msgs: 18,  flag: 0, lastActive:'14:22' },
  { id:'c2', name:'외래팀 일일 회의', members: 6,  msgs: 142, flag: 1, lastActive:'14:18' },
  { id:'c3', name:'병동팀 인계',     members: 8,  msgs: 89,  flag: 0, lastActive:'14:05' },
  { id:'c4', name:'전체 공지',       members: 32, msgs: 7,   flag: 0, lastActive:'12:00' },
  { id:'c5', name:'채용 TF',         members: 5,  msgs: 23,  flag: 2, lastActive:'11:38' },
  { id:'c6', name:'재고 발주',       members: 4,  msgs: 56,  flag: 0, lastActive:'10:55' },
];

const MC_BANNED_WORDS_INITIAL = ['욕설1','욕설2','외부유출','경쟁사명','민감단어'];

const MC_HEALTH = {
  failures: [
    { id:'f1', severity:'critical', label:'iOS 푸시 토큰 만료', count: 3, detail:'박지영·홍자비·조현준 — 재로그인 안내 필요' },
    { id:'f2', severity:'warning',  label:'주간 백업 일정 누락', count: 1, detail:'2026-05-05 (화) 04:00 — 다음 백업까지 정상 동작 중' },
    { id:'f3', severity:'warning',  label:'shift_assignments 정합성 경고', count: 4, detail:'5/15·5/16 일요일에 배정 0건 — 근무 미정 가능성' },
    { id:'f4', severity:'info',     label:'staff_shift_assignments 빈 레코드', count: 2, detail:'직원 신규 가입 직후 — 자동 보정 대상' },
  ],
  platforms: [
    { platform:'iOS',     count: 18 },
    { platform:'Android', count: 9 },
    { platform:'Web',     count: 28 },
  ],
  cronJobs: [
    { path:'/cron/daily/payroll-snapshot',     schedule:'매일 02:00', label:'급여 일일 스냅샷', last:'2026-05-12 02:00 OK' },
    { path:'/cron/weekly/backup',              schedule:'매주 일 04:00', label:'주간 백업',     last:'2026-05-12 04:00 OK' },
    { path:'/cron/hourly/realtime-rollup',     schedule:'매시 :00',     label:'실시간 집계',   last:'2026-05-12 14:00 OK' },
    { path:'/cron/daily/notice-digest',        schedule:'매일 09:00',   label:'공지 다이제스트', last:'2026-05-12 09:00 OK' },
    { path:'/cron/hourly/push-token-prune',    schedule:'매시 :30',     label:'푸시 토큰 정리', last:'2026-05-12 13:30 OK' },
  ],
};

const MC_BACKUPS = [
  { name:'mso_backup_2026-05-12.dump', date:'2026-05-12 04:00', size:'8.4 GB' },
  { name:'mso_backup_2026-05-05.dump', date:'2026-05-05 04:00', size:'8.3 GB' },
  { name:'mso_backup_2026-04-28.dump', date:'2026-04-28 04:00', size:'8.1 GB' },
  { name:'mso_backup_2026-04-21.dump', date:'2026-04-21 04:00', size:'7.9 GB' },
];

const MC_RESTORE_RUNS = [
  { id:'rr1', file:'mso_backup_2026-04-28.dump', status:'완료',   started:'2026-04-29 09:12' },
  { id:'rr2', file:'mso_backup_2026-04-21.dump', status:'완료',   started:'2026-04-23 14:30' },
];

const MC_LEAVE_GRANTS = [
  { id:'l1', target:'박지영 (외래팀)',  days: 2, reason:'2026 임시 부여 — 신규 채용 보전',     date:'2026-05-08 16:30', actor:'백정민' },
  { id:'l2', target:'홍자비 (경영지원)', days: 1, reason:'5/4 자율 연장근무 보상',             date:'2026-05-06 09:00', actor:'백정민' },
  { id:'l3', target:'전 직원 (32명)',    days: 1, reason:'2026 창립기념일 특별 휴가',          date:'2026-04-30 09:00', actor:'박철홍' },
];

// ─────────────────────────── 컴포넌트 ───────────────────────────
const McKpi = ({ lbl, v, unit, sub, tone }) => (
  <div className={'mc-kpi' + (tone ? ' tone-' + tone : '')}>
    <div className="mc-kpi-lbl">{lbl}</div>
    <div className="mc-kpi-val">{v}{unit && <span className="mc-kpi-unit">{unit}</span>}</div>
    {sub && <div className="mc-kpi-sub">{sub}</div>}
  </div>
);

const MasterCenter = () => {
  const [tab, setTab] = React.useState('overview');
  const [bannedOpen, setBannedOpen] = React.useState(false);
  const [bannedWords, setBannedWords] = React.useState(MC_BANNED_WORDS_INITIAL);
  const [bannedInput, setBannedInput] = React.useState('');

  return (
    <>
      <div className="mc-eyebrow">
        <span className="mc-shield">
          <Icon name="shield" size={14}/>
        </span>
        <div>
          <div className="mc-eye-title">시스템 마스터 센터</div>
          <div className="mc-eye-sub">최상위 권한 — 박철홍 병원장·백정민 이사만 접근 가능 · 모든 동작은 변경이력에 기록됨</div>
        </div>
        <div style={{flex: 1}}/>
        <span className="mc-stat-pill"><span className="mc-stat-dot success"/> healthy</span>
        <span className="mc-stat-pill"><span className="mc-stat-dot warn"/> {MC_SUMMARY.pushFailures}건 푸시 실패</span>
      </div>

      <div className="mc-tabs">
        {MC_TABS.map(t => (
          <button key={t.id}
            className={'mc-tab' + (tab === t.id ? ' on' : '')}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={13}/>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="mc-kpi-row">
            <McKpi lbl="활성 직원"      v={MC_SUMMARY.staffs}        unit="명" sub="민감정보 보유"/>
            <McKpi lbl="감사 로그 (30일)" v={MC_SUMMARY.audits.toLocaleString()}        unit="건"/>
            <McKpi lbl="급여 레코드 (6개월)" v={MC_SUMMARY.payrolls}      unit="건" tone="accent"/>
            <McKpi lbl="채팅방"          v={MC_SUMMARY.chatRooms}     unit="개"/>
            <McKpi lbl="채팅 메시지 (24h)" v={MC_SUMMARY.chatMessages.toLocaleString()} unit="건"/>
            <McKpi lbl="푸시 실패"       v={MC_SUMMARY.pushFailures}  unit="건" sub="iOS 토큰 만료" tone="danger"/>
            <McKpi lbl="크론 잡"         v={MC_SUMMARY.cronJobs}      unit="개" sub="모두 정상"/>
            <McKpi lbl="보유 백업"       v={MC_SUMMARY.backups}       unit="개" sub="최근 7일 1건"/>
          </div>

          <div className="mc-split">
            <div className="mc-card">
              <div className="mc-card-h">
                <div className="mc-card-title">최근 변경이력</div>
                <Btn size="sm" onClick={() => setTab('history')}>전체 보기</Btn>
              </div>
              <div className="mc-log-list">
                {MC_RECENT_AUDITS.slice(0, 6).map(a => (
                  <div key={a.id} className="mc-log-row">
                    <span className="mc-log-time">{a.time.slice(11)}</span>
                    <span className={'mc-log-cat tone-' + (
                      a.category === '권한' ? 'danger' :
                      a.category === '급여' ? 'warn' :
                      a.category === '백업' ? 'success' : 'muted'
                    )}>{a.category}</span>
                    <div className="mc-log-main">
                      <div className="mc-log-action">{a.action}</div>
                      <div className="mc-log-target">{a.target} · {a.actor}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mc-card">
              <div className="mc-card-h">
                <div className="mc-card-title">민감 정보 노출 면적</div>
              </div>
              <div className="mc-sensitive">
                <div className="mc-sens-row">
                  <span className="mc-sens-lbl">주민등록번호</span>
                  <span className="mc-sens-bar"><span style={{width:'100%', background:'var(--danger)'}}/></span>
                  <span className="mc-sens-val">{MC_SUMMARY.sensitiveStaffs}명</span>
                </div>
                <div className="mc-sens-row">
                  <span className="mc-sens-lbl">계좌번호</span>
                  <span className="mc-sens-bar"><span style={{width:'94%', background:'var(--warning)'}}/></span>
                  <span className="mc-sens-val">30명</span>
                </div>
                <div className="mc-sens-row">
                  <span className="mc-sens-lbl">개인 휴대폰</span>
                  <span className="mc-sens-bar"><span style={{width:'100%', background:'var(--accent)'}}/></span>
                  <span className="mc-sens-val">32명</span>
                </div>
                <div className="mc-sens-row">
                  <span className="mc-sens-lbl">기본급</span>
                  <span className="mc-sens-bar"><span style={{width:'88%', background:'var(--warning)'}}/></span>
                  <span className="mc-sens-val">28명</span>
                </div>
                <div className="mc-sens-foot">
                  민감 정보 열람 시 자동으로 변경이력에 기록됩니다.
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'ops' && (
        <>
          <div className="mc-kpi-row">
            <McKpi lbl="DAU"          v="29" unit="명" sub="활성 직원 32명 중"/>
            <McKpi lbl="채팅 메시지"   v="4,892" unit="건" sub="24시간 누계" tone="accent"/>
            <McKpi lbl="결재 진행중"   v="14" unit="건" sub="2건 24시간 초과" tone="warn"/>
            <McKpi lbl="자동 발주"     v="38" unit="건" sub="이번 주" tone="success"/>
          </div>
          <div className="mc-card">
            <div className="mc-card-h">
              <div className="mc-card-title">크론 잡 상태 ({MC_HEALTH.cronJobs.length})</div>
              <Btn size="sm" icon="refresh">전체 재실행</Btn>
            </div>
            <table className="data-tbl" style={{width:'100%'}}>
              <thead><tr><th>경로</th><th>스케줄</th><th>라벨</th><th>마지막 실행</th><th style={{textAlign:'right'}}>액션</th></tr></thead>
              <tbody>
                {MC_HEALTH.cronJobs.map((j,i) => (
                  <tr key={i}>
                    <td className="tnum strong">{j.path}</td>
                    <td>{j.schedule}</td>
                    <td>{j.label}</td>
                    <td className="tnum"><Chip tone="success">{j.last}</Chip></td>
                    <td style={{textAlign:'right'}}><Btn size="sm">즉시 실행</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'history' && (
        <div className="mc-card">
          <div className="mc-card-h">
            <div className="mc-card-title">변경이력 — 최근 30일 ({MC_SUMMARY.audits.toLocaleString()}건)</div>
            <div className="row" style={{gap: 8}}>
              <select className="input"><option>전체 분류</option><option>권한</option><option>급여</option><option>인사</option><option>재고</option><option>백업</option></select>
              <select className="input"><option>전체 작업자</option><option>백정민</option><option>박철홍</option><option>시스템</option></select>
              <Btn size="sm" icon="file">CSV 내보내기</Btn>
            </div>
          </div>
          <table className="data-tbl mc-history-tbl" style={{width:'100%'}}>
            <thead><tr><th>시각</th><th>분류</th><th>작업</th><th>대상</th><th>작업자</th></tr></thead>
            <tbody>
              {MC_RECENT_AUDITS.map(a => (
                <tr key={a.id}>
                  <td className="tnum">{a.time}</td>
                  <td><Chip tone={
                    a.category === '권한' ? 'danger' :
                    a.category === '급여' ? 'warn' :
                    a.category === '백업' ? 'success' : 'muted'
                  }>{a.category}</Chip></td>
                  <td className="strong">{a.action}</td>
                  <td>{a.target}</td>
                  <td>{a.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'perms' && (
        <div className="mc-card">
          <div className="mc-card-h">
            <div className="mc-card-title">권한 변경 diff</div>
            <Btn size="sm" icon="file">전체 정책 보기</Btn>
          </div>
          <div className="mc-perm-list">
            {MC_PERM_DIFFS.map(p => {
              const added = p.after.filter(x => !p.before.includes(x));
              const removed = p.before.filter(x => !p.after.includes(x));
              const kept = p.before.filter(x => p.after.includes(x));
              return (
                <div key={p.id} className="mc-perm-row">
                  <div className="mc-perm-head">
                    <span className="tnum small">{p.time}</span>
                    <span className="strong">{p.target}</span>
                    <div style={{flex:1}}/>
                    <span className="small">+{added.length} / −{removed.length}</span>
                  </div>
                  <div className="mc-perm-tokens">
                    {kept.map(t => <span key={'k'+t} className="mc-perm-tok">{t}</span>)}
                    {added.map(t => <span key={'a'+t} className="mc-perm-tok add">+ {t}</span>)}
                    {removed.map(t => <span key={'r'+t} className="mc-perm-tok rem">− {t}</span>)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'chats' && (
        <>
          <div className="mc-bw-bar">
            <div>
              <div className="mc-card-title">단어 필터 (금지어)</div>
              <div className="small" style={{marginTop: 4}}>전체 채팅방의 메시지를 실시간 스캔. 매칭 메시지는 자동으로 플래그 표시되며 관리자 알림이 발송됩니다.</div>
            </div>
            <div className="row" style={{gap: 8}}>
              <span className="mc-stat-pill">{bannedWords.length}개 단어 등록</span>
              <Btn size="sm" icon="edit" onClick={() => setBannedOpen(true)}>관리</Btn>
            </div>
          </div>
          <div className="mc-card">
            <div className="mc-card-h">
              <div className="mc-card-title">채팅방 ({MC_CHAT_ROOMS.length}) · 매칭 알림 3건</div>
              <select className="input"><option>전체 / 플래그 / 일반</option></select>
            </div>
            <table className="data-tbl" style={{width:'100%'}}>
              <thead><tr><th>채팅방</th><th>참여자</th><th>오늘 메시지</th><th>플래그</th><th>마지막 활동</th><th style={{textAlign:'right'}}>액션</th></tr></thead>
              <tbody>
                {MC_CHAT_ROOMS.map(r => (
                  <tr key={r.id}>
                    <td className="strong">{r.name}</td>
                    <td className="tnum">{r.members}명</td>
                    <td className="tnum">{r.msgs}</td>
                    <td>{r.flag > 0 ? <Chip tone="danger">{r.flag}건</Chip> : <span className="small">·</span>}</td>
                    <td className="tnum">{r.lastActive}</td>
                    <td style={{textAlign:'right'}}><Btn size="sm">로그 열기</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {bannedOpen && (
            <div className="wn-modal-bg" onClick={() => setBannedOpen(false)}>
              <div className="wn-modal" style={{maxWidth: 480}} onClick={(e) => e.stopPropagation()}>
                <div className="wn-modal-h">
                  <div>
                    <div className="wn-modal-title">🔍 단어 필터</div>
                    <div className="wn-modal-sub">현재 {bannedWords.length}개 — 변경 시 즉시 적용</div>
                  </div>
                  <button className="wn-pager" onClick={() => setBannedOpen(false)}>닫기</button>
                </div>
                <div className="wn-modal-body" style={{display:'flex', flexDirection:'column', gap: 12}}>
                  <div className="row" style={{gap: 8}}>
                    <input
                      className="input"
                      style={{flex: 1}}
                      value={bannedInput}
                      onChange={(e) => setBannedInput(e.target.value)}
                      placeholder="금지어 입력 후 추가"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && bannedInput.trim()) {
                          setBannedWords([...bannedWords, bannedInput.trim()]);
                          setBannedInput('');
                        }
                      }}
                    />
                    <Btn variant="primary" onClick={() => {
                      if (bannedInput.trim()) {
                        setBannedWords([...bannedWords, bannedInput.trim()]);
                        setBannedInput('');
                      }
                    }}>추가</Btn>
                  </div>
                  <div className="mc-bw-chips">
                    {bannedWords.map((w, i) => (
                      <span key={i} className="mc-bw-chip">
                        {w}
                        <button onClick={() => setBannedWords(bannedWords.filter((_, j) => j !== i))}>×</button>
                      </span>
                    ))}
                  </div>
                  <div className="row" style={{gap: 8, justifyContent:'flex-end', paddingTop: 8, borderTop: '1px solid var(--border)'}}>
                    <Btn onClick={() => setBannedWords(MC_BANNED_WORDS_INITIAL)}>기본값으로 초기화</Btn>
                    <Btn variant="primary" onClick={() => setBannedOpen(false)}>확인</Btn>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'health' && (
        <>
          <div className="mc-card">
            <div className="mc-card-h">
              <div className="mc-card-title">정합성 점검 — 감지된 이상 {MC_HEALTH.failures.length}건</div>
              <Btn size="sm" icon="refresh">즉시 재점검</Btn>
            </div>
            <div className="mc-failures">
              {MC_HEALTH.failures.map(f => (
                <div key={f.id} className={'mc-fail tone-' + f.severity}>
                  <div className="mc-fail-sev">{f.severity === 'critical' ? '심각' : f.severity === 'warning' ? '경고' : '정보'}</div>
                  <div className="mc-fail-main">
                    <div className="mc-fail-label">{f.label} <span className="mc-fail-cnt">×{f.count}</span></div>
                    <div className="mc-fail-detail">{f.detail}</div>
                  </div>
                  <Btn size="sm">처리</Btn>
                </div>
              ))}
            </div>
          </div>

          <div className="mc-split">
            <div className="mc-card">
              <div className="mc-card-h">
                <div className="mc-card-title">플랫폼별 푸시 구독</div>
              </div>
              <div className="mc-platforms">
                {MC_HEALTH.platforms.map(p => (
                  <div key={p.platform} className="mc-platform">
                    <span className="mc-plat-lbl">{p.platform}</span>
                    <span className="mc-plat-bar"><span style={{width: `${(p.count / 32) * 100}%`}}/></span>
                    <span className="mc-plat-val">{p.count}대</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mc-card">
              <div className="mc-card-h">
                <div className="mc-card-title">크론 잡 ({MC_HEALTH.cronJobs.length})</div>
              </div>
              <div className="mc-cron-list">
                {MC_HEALTH.cronJobs.map((j, i) => (
                  <div key={i} className="mc-cron-row">
                    <div>
                      <div className="strong">{j.label}</div>
                      <div className="small tnum">{j.path}</div>
                    </div>
                    <div className="small tnum">{j.schedule}</div>
                    <Chip tone="success">OK</Chip>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'recovery' && (
        <>
          <div className="mc-recovery-banner">
            <div>
              <div className="strong" style={{fontSize: 14}}>복구 작업은 전체 데이터에 영향을 줍니다</div>
              <div className="small">반드시 사전 백업 확인 후 진행해 주세요. 복구 시작 시 모든 사용자가 로그아웃됩니다.</div>
            </div>
            <Btn variant="primary" icon="send">즉시 백업 실행</Btn>
          </div>

          <div className="mc-split">
            <div className="mc-card">
              <div className="mc-card-h">
                <div className="mc-card-title">보유 백업 ({MC_BACKUPS.length})</div>
                <Btn size="sm">전체 다운로드</Btn>
              </div>
              <table className="data-tbl" style={{width:'100%'}}>
                <thead><tr><th>파일</th><th>생성일</th><th>크기</th><th style={{textAlign:'right'}}>액션</th></tr></thead>
                <tbody>
                  {MC_BACKUPS.map(b => (
                    <tr key={b.name}>
                      <td className="strong tnum">{b.name}</td>
                      <td className="tnum">{b.date}</td>
                      <td className="tnum">{b.size}</td>
                      <td style={{textAlign:'right'}}><Btn size="sm">복구</Btn></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mc-card">
              <div className="mc-card-h">
                <div className="mc-card-title">복구 실행 이력</div>
              </div>
              {MC_RESTORE_RUNS.map(r => (
                <div key={r.id} className="mc-restore-row">
                  <div>
                    <div className="strong">{r.file}</div>
                    <div className="small tnum">{r.started}</div>
                  </div>
                  <Chip tone="success">{r.status}</Chip>
                </div>
              ))}
              <div className="mc-empty-hint">최근 90일 내 복구 실행 2건. 정상 종료.</div>
            </div>
          </div>
        </>
      )}

      {tab === 'leave' && (
        <>
          <div className="mc-leave-form">
            <div className="mc-card-title">연차 수동 부여</div>
            <div className="mc-leave-grid">
              <label className="mc-leave-field">
                <span>대상 직원</span>
                <select className="input"><option>박지영 (외래팀)</option><option>홍자비 (경영지원)</option><option>전 직원 (32명)</option></select>
              </label>
              <label className="mc-leave-field">
                <span>부여 일수</span>
                <input className="input" type="number" defaultValue="1" min="0.5" step="0.5"/>
              </label>
              <label className="mc-leave-field">
                <span>적용 일자</span>
                <input className="input" type="date" defaultValue="2026-05-12"/>
              </label>
              <label className="mc-leave-field" style={{gridColumn:'span 3'}}>
                <span>사유 *</span>
                <input className="input" placeholder="예: 5/4 자율 연장근무 보상"/>
              </label>
            </div>
            <div className="row" style={{gap: 8, justifyContent:'flex-end', marginTop: 12}}>
              <Btn>취소</Btn>
              <Btn variant="primary" icon="check">부여 실행</Btn>
            </div>
          </div>

          <div className="mc-card">
            <div className="mc-card-h">
              <div className="mc-card-title">최근 수동 부여 이력</div>
              <Btn size="sm" icon="file">CSV 내보내기</Btn>
            </div>
            <table className="data-tbl" style={{width:'100%'}}>
              <thead><tr><th>대상</th><th>일수</th><th>사유</th><th>적용</th><th>작업자</th></tr></thead>
              <tbody>
                {MC_LEAVE_GRANTS.map(g => (
                  <tr key={g.id}>
                    <td className="strong">{g.target}</td>
                    <td className="tnum">+{g.days}일</td>
                    <td>{g.reason}</td>
                    <td className="tnum">{g.date}</td>
                    <td>{g.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
};

const MasterCenterNotes = () => (
  <Notes
    kicker="§ 관리자 — 시스템 마스터 센터 (신규)"
    title="병원장·이사 전용 — 변경이력·민감정보·복구를 한 곳에. 모든 동작은 자동 감사 기록."
    points={[
      { t:'8개 탭 — 한 화면에서 시스템 전부', b:'개요(KPI) · 운영대시보드(트래픽) · 변경이력(audit log) · 권한변경(diff) · 전체채팅(모니터링) · 정합성점검(cron·push) · 복구센터(backup) · 연차수동부여.' },
      { t:'개요 — 8 KPI + 민감정보 면적', b:'8개 핵심 지표를 한 행으로 노출. 민감 정보(주민·계좌·휴대폰·기본급) 보유 비율을 시각화해 즉시 노출 면적 인지.' },
      { t:'변경이력 — 분류·작업자 필터 + CSV', b:'권한/급여/인사/재고/백업 5종 분류. 작업자별 필터. 30일 1,247건 → 매번 새로 만들지 않고 동일 표 컨벤션 재사용.' },
      { t:'권한변경 diff — 추가·삭제·유지 토큰', b:'before/after 두 배열을 +/− 토큰 카드로. 권한 정책 변동을 즉시 한 줄로 읽을 수 있게.' },
      { t:'전체채팅 — 단어 필터 모달', b:'금지어 등록·삭제 모달. 메시지 스캔 매칭 시 채팅방에 플래그(빨강 칩). 관리자가 즉시 확인할 수 있는 라인 정렬.' },
      { t:'정합성점검 — 심각/경고/정보 분리', b:'iOS 토큰 만료·백업 누락·shift 정합성 같은 자동 진단을 severity별로. 처리 버튼 인라인.' },
      { t:'복구센터 — 백업 표 + 실행 이력', b:'백업 파일별 즉시 복구 버튼. 위험성 배너로 사전 안내. 복구 실행 이력으로 추적 가능.' },
      { t:'연차 수동 부여 — 폼 + 이력', b:'대상/일수/사유/적용일 4필드 폼. 부여 즉시 변경이력에 기록. 최근 이력 표로 검증.' },
    ]}
  />
);

Object.assign(window, { MasterCenter, MasterCenterNotes });
