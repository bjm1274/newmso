// MSO Content Screens — redesigned per menu

// ── Shared helpers ──────────────────────────────────
const token = (dark) => ({
  bg: dark ? '#0d0d10' : '#f8f8f9',
  card: dark ? '#111113' : '#ffffff',
  border: dark ? '#27272a' : '#e9e9ec',
  borderSubtle: dark ? '#1f1f22' : '#f0f0f2',
  fg: dark ? '#f4f4f5' : '#18181b',
  fgMuted: dark ? '#a1a1aa' : '#71717a',
  muted: dark ? '#18181b' : '#f4f4f5',
  zinc400: dark ? '#a1a1aa' : '#a1a1aa',
});

const PageHeader = ({ title, subtitle, dark, accent, actions }) => {
  const t = token(dark);
  return (
    <div style={{
      background: t.card, borderBottom: `1px solid ${t.border}`,
      padding: '14px 20px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: 12, flexShrink: 0,
    }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: t.fg, letterSpacing: '-0.025em' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: t.fgMuted, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
    </div>
  );
};

const StatCard = ({ label, value, sub, icon, accent, dark, trend, color }) => {
  const t = token(dark);
  const c = color || accent;
  return (
    <div style={{
      background: t.card, border: `1px solid ${t.border}`, borderRadius: 12,
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10,
      flex: 1, minWidth: 140,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: t.fgMuted }}>{label}</span>
        <span style={{
          width: 30, height: 30, borderRadius: 8,
          background: `${c}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name={icon} size={15} color={c} strokeWidth={1.8} />
        </span>
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, color: t.fg, letterSpacing: '-0.04em', lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: trend === 'up' ? '#10b981' : trend === 'down' ? '#ef4444' : t.fgMuted, marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  );
};

const Btn = ({ label, icon, primary, danger, onClick, dark, accent, small }) => {
  const t = token(dark);
  const bg = primary ? accent : danger ? '#ef4444' : t.card;
  const color = primary || danger ? '#fff' : t.fg;
  const border = primary || danger ? 'none' : `1px solid ${t.border}`;
  return (
    <button onClick={onClick} style={{
      background: bg, color, border, borderRadius: 8,
      padding: small ? '5px 10px' : '7px 14px',
      fontSize: small ? 11 : 12, fontWeight: 600, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 5,
      letterSpacing: '-0.01em', whiteSpace: 'nowrap',
      transition: 'opacity 0.1s',
    }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.82'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >
      {icon && <Icon name={icon} size={13} color={color} strokeWidth={2} />}
      {label}
    </button>
  );
};

const Badge = ({ label, type = 'gray', dark }) => {
  const t = token(dark);
  const styles = {
    blue:   { bg: '#eff6ff', color: '#2563eb' },
    green:  { bg: '#f0fdf4', color: '#10b981' },
    red:    { bg: '#fef2f2', color: '#ef4444' },
    yellow: { bg: '#fffbeb', color: '#f59e0b' },
    gray:   { bg: t.muted, color: t.fgMuted },
  };
  const s = styles[type] || styles.gray;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: s.bg, color: s.color,
      borderRadius: 99, padding: '2px 8px',
      fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    }}>{label}</span>
  );
};

const DataTable = ({ cols, rows, dark, accent }) => {
  const t = token(dark);
  return (
    <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${t.border}` }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: t.muted }}>
            {cols.map((c, i) => (
              <th key={i} style={{
                padding: '9px 14px', textAlign: 'left',
                fontWeight: 600, color: t.fgMuted, fontSize: 11,
                borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap',
              }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${t.borderSubtle}` : 'none' }}
              onMouseEnter={e => e.currentTarget.style.background = t.muted}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '9px 14px', color: t.fg, verticalAlign: 'middle' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─────────────────────────────────────────────────────
// SCREENS
// ─────────────────────────────────────────────────────

// 내정보
const ScreenMyInfo = ({ dark, accent }) => {
  const t = token(dark);
  const [tab, setTab] = React.useState('overview');
  const tabs = [
    { id: 'overview', label: '개요' },
    { id: 'attendance', label: '근태' },
    { id: 'payslip', label: '급여명세서' },
    { id: 'docs', label: '문서' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader dark={dark} accent={accent} title="내 정보" subtitle="박철홍 · 정형외과 · 수석" actions={
        <Btn label="정보 수정" icon="edit" dark={dark} accent={accent} />
      } />
      <div style={{ overflowY: 'auto', flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Profile card */}
        <div style={{
          background: t.card, border: `1px solid ${t.border}`, borderRadius: 14,
          padding: 20, display: 'flex', gap: 20, alignItems: 'flex-start',
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: `${accent}18`, border: `2px solid ${accent}33`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 800, color: accent, flexShrink: 0,
          }}>박</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: t.fg, letterSpacing: '-0.03em' }}>박철홍</div>
            <div style={{ fontSize: 13, color: t.fgMuted, marginTop: 2 }}>수석 · 정형외과</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <Badge label="재직중" type="green" dark={dark} />
              <Badge label="정규직" type="blue" dark={dark} />
              <Badge label="입사 3년차" type="gray" dark={dark} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: t.fgMuted, textAlign: 'right' }}>
            <span>사번 00123</span>
            <span>입사 2022.03.01</span>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{
          display: 'flex', gap: 2, background: t.muted, borderRadius: 10,
          padding: 4,
        }}>
          {tabs.map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)} style={{
              flex: 1, border: 'none', borderRadius: 8,
              padding: '7px 8px', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s',
              background: tab === tb.id ? t.card : 'transparent',
              color: tab === tb.id ? t.fg : t.fgMuted,
              boxShadow: tab === tb.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}>{tb.label}</button>
          ))}
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatCard label="이번 달 근태" value="22/22" sub="✓ 개근" icon="clock" accent={accent} dark={dark} color="#10b981" trend="up" />
          <StatCard label="잔여 연차" value="8.5일" sub="사용 5.5일" icon="calendar" accent={accent} dark={dark} />
          <StatCard label="이번 달 급여" value="4,280,000" sub="전월 대비 +2.1%" icon="dollarSign" accent={accent} dark={dark} trend="up" />
          <StatCard label="미결재" value="2건" sub="결재 대기중" icon="approval" accent={accent} dark={dark} color="#f59e0b" />
        </div>

        {/* Quick links */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10,
        }}>
          {[
            { icon: 'fileText', label: '급여명세서 보기', sub: '2025년 3월 발급' },
            { icon: 'calendar', label: '연차/휴가 신청', sub: '잔여 8.5일' },
            { icon: 'approval', label: '전자결재 확인', sub: '2건 대기' },
            { icon: 'lock', label: '비밀번호 변경', sub: '보안 설정' },
          ].map((item, i) => (
            <button key={i} style={{
              background: t.card, border: `1px solid ${t.border}`, borderRadius: 10,
              padding: '14px 16px', textAlign: 'left', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 12, transition: 'border-color 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = accent}
              onMouseLeave={e => e.currentTarget.style.borderColor = t.border}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 9, background: `${accent}12`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon name={item.icon} size={16} color={accent} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.fg }}>{item.label}</div>
                <div style={{ fontSize: 11, color: t.fgMuted, marginTop: 2 }}>{item.sub}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// 채팅
const ScreenChat = ({ dark, accent }) => {
  const t = token(dark);
  const [selected, setSelected] = React.useState(0);
  const [msg, setMsg] = React.useState('');
  const rooms = [
    { name: '전체 공지', last: '내일 정기 회의 10시 진행합니다.', time: '10:22', unread: 2, icon: 'bell' },
    { name: '정형외과팀', last: '수술실 3호 오후 2시 준비 완료했습니다', time: '09:58', unread: 5, icon: 'users' },
    { name: '인사팀', last: '3월 급여 명세서 배포 완료', time: '어제', unread: 0, icon: 'users' },
    { name: '박철홍 원장', last: '오늘 미팅 3시 괜찮습니다', time: '어제', unread: 0, icon: 'user' },
    { name: '재고관리팀', last: '소독제 발주 요청드립니다', time: '월요일', unread: 0, icon: 'package' },
  ];
  const messages = [
    { from: '이수연', text: '안녕하세요! 내일 수술 일정 확인 부탁드립니다.', mine: false, time: '09:41' },
    { from: '나', text: '네, 확인했습니다. 오전 9시 수술실 2호 맞죠?', mine: true, time: '09:43' },
    { from: '이수연', text: '맞습니다. 기구 준비는 오전 8시 30분까지 완료해주세요.', mine: false, time: '09:44' },
    { from: '나', text: '알겠습니다. 준비하겠습니다!', mine: true, time: '09:45' },
    { from: '김민준', text: '저도 참가합니다. 마취과도 8시 45분 도착 예정입니다.', mine: false, time: '09:47' },
    { from: '이수연', text: '수고하세요 모두! 내일 뵙겠습니다 🙏', mine: false, time: '09:50' },
  ];
  const room = rooms[selected];
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Room list */}
      <div style={{
        width: 260, minWidth: 260, borderRight: `1px solid ${t.border}`,
        display: 'flex', flexDirection: 'column', background: t.card,
      }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.fg, marginBottom: 10 }}>채팅</div>
          <div style={{
            background: t.muted, borderRadius: 8, display: 'flex', alignItems: 'center',
            gap: 8, padding: '7px 10px',
          }}>
            <Icon name="search" size={13} color={t.fgMuted} />
            <span style={{ fontSize: 12, color: t.fgMuted }}>채팅방 검색</span>
          </div>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {rooms.map((room, i) => (
            <button key={i} onClick={() => setSelected(i)} style={{
              width: '100%', background: i === selected ? `${accent}10` : 'transparent',
              border: 'none', padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
              borderBottom: `1px solid ${t.borderSubtle}`, display: 'flex', gap: 10, alignItems: 'center',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                background: i === selected ? `${accent}20` : t.muted,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name={room.icon} size={16} color={i === selected ? accent : t.fgMuted} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: t.fg }}>{room.name}</span>
                  <span style={{ fontSize: 10, color: t.fgMuted }}>{room.time}</span>
                </div>
                <div style={{ fontSize: 11, color: t.fgMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.last}</div>
              </div>
              {room.unread > 0 && (
                <span style={{
                  minWidth: 18, height: 18, borderRadius: 9,
                  background: '#ef4444', color: '#fff',
                  fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                }}>{room.unread}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{
          padding: '12px 18px', borderBottom: `1px solid ${t.border}`,
          background: t.card, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Icon name={room.icon} size={16} color={t.fgMuted} />
          <span style={{ fontSize: 13, fontWeight: 700, color: t.fg }}>{room.name}</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: m.mine ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-end' }}>
              {!m.mine && (
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: t.muted,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: t.fgMuted, flexShrink: 0,
                }}>{m.from[0]}</div>
              )}
              <div style={{ maxWidth: '65%' }}>
                {!m.mine && <div style={{ fontSize: 10, color: t.fgMuted, marginBottom: 3 }}>{m.from}</div>}
                <div style={{
                  background: m.mine ? accent : t.card,
                  border: m.mine ? 'none' : `1px solid ${t.border}`,
                  borderRadius: m.mine ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  padding: '8px 12px', fontSize: 12.5, color: m.mine ? '#fff' : t.fg,
                  lineHeight: 1.55,
                }}>{m.text}</div>
                <div style={{ fontSize: 10, color: t.fgMuted, marginTop: 3, textAlign: m.mine ? 'right' : 'left' }}>{m.time}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{
          padding: '10px 14px', borderTop: `1px solid ${t.border}`,
          background: t.card, display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: t.fgMuted, display: 'flex' }}>
            <Icon name="paperclip" size={18} />
          </button>
          <input value={msg} onChange={e => setMsg(e.target.value)}
            placeholder="메시지를 입력하세요"
            style={{
              flex: 1, border: `1px solid ${t.border}`, borderRadius: 10,
              padding: '8px 12px', fontSize: 13, color: t.fg,
              background: t.muted, outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button style={{
            width: 36, height: 36, borderRadius: 9, border: 'none',
            background: msg ? accent : t.muted, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}>
            <Icon name="send" size={15} color={msg ? '#fff' : t.fgMuted} />
          </button>
        </div>
      </div>
    </div>
  );
};

// 게시판
const ScreenBoard = ({ dark, accent, subView }) => {
  const t = token(dark);
  const posts = [
    { title: '2025년 4월 정기 회의 일정 안내', author: '관리자', date: '2025.04.25', views: 142, pinned: true },
    { title: '3월 급여명세서 배포 완료 안내', author: '인사팀', date: '2025.04.24', views: 98, pinned: true },
    { title: '수술실 소독 가이드라인 업데이트', author: '이수연', date: '2025.04.23', views: 56 },
    { title: '4월 교대근무 일정 공유드립니다', author: '박민아', date: '2025.04.22', views: 77 },
    { title: '의료기기 정기점검 결과 보고', author: '김민준', date: '2025.04.21', views: 34 },
    { title: '직원 경조사 - 이수연 결혼 축하드립니다 🎊', author: '관리자', date: '2025.04.18', views: 201 },
    { title: '4월 MRI 일정 조정 안내', author: '방사선팀', date: '2025.04.17', views: 45 },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader dark={dark} accent={accent} title={subView || '게시판'} subtitle={`총 ${posts.length}개의 게시물`} actions={
        <Btn label="글쓰기" icon="edit" primary dark={dark} accent={accent} />
      } />
      <div style={{ overflowY: 'auto', flex: 1, padding: 20 }}>
        <div style={{ background: t.card, borderRadius: 12, border: `1px solid ${t.border}`, overflow: 'hidden' }}>
          {posts.map((post, i) => (
            <div key={i} style={{
              padding: '13px 18px', borderBottom: i < posts.length - 1 ? `1px solid ${t.borderSubtle}` : 'none',
              display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
              transition: 'background 0.12s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = t.muted}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {post.pinned && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: accent,
                  background: `${accent}14`, borderRadius: 5, padding: '2px 6px', flexShrink: 0,
                }}>공지</span>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, color: t.fg, fontWeight: post.pinned ? 600 : 400 }}>{post.title}</span>
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: t.fgMuted }}>{post.author}</span>
                <span style={{ fontSize: 11, color: t.fgMuted }}>{post.date}</span>
                <span style={{ fontSize: 11, color: t.fgMuted, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Icon name="eye" size={11} color={t.fgMuted} /> {post.views}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// 전자결재
const ScreenApproval = ({ dark, accent, subView }) => {
  const t = token(dark);
  const items = [
    { title: '3월 소모품 구매 승인 요청', from: '김민준', date: '04.25', status: '대기', type: '구매결재' },
    { title: '연차 사용 승인 - 이수연', from: '이수연', date: '04.24', status: '승인', type: '연차신청' },
    { title: '4월 외주업체 계약서 검토', from: '관리팀', date: '04.23', status: '반려', type: '계약' },
    { title: '의료기기 발주 승인 건', from: '재고팀', date: '04.22', status: '대기', type: '발주' },
    { title: '수술 기구 긴급 구매 요청', from: '수술실', date: '04.21', status: '승인', type: '구매결재' },
  ];
  const statusMap = { '대기': 'yellow', '승인': 'green', '반려': 'red' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader dark={dark} accent={accent} title="전자결재" subtitle={subView} actions={
        <Btn label="기안 작성" icon="edit" primary dark={dark} accent={accent} />
      } />
      <div style={{ overflowY: 'auto', flex: 1, padding: 20 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <StatCard label="대기중" value="4건" icon="clock" accent={accent} dark={dark} color="#f59e0b" />
          <StatCard label="이번 달 승인" value="12건" icon="check" accent={accent} dark={dark} color="#10b981" />
          <StatCard label="반려" value="1건" icon="x" accent={accent} dark={dark} color="#ef4444" />
        </div>
        <DataTable dark={dark} accent={accent}
          cols={['문서 제목', '기안자', '문서 유형', '기안일', '상태', '']}
          rows={items.map(item => [
            <span style={{ fontSize: 12, fontWeight: 500, color: token(dark).fg }}>{item.title}</span>,
            item.from,
            <Badge label={item.type} type="blue" dark={dark} />,
            item.date,
            <Badge label={item.status} type={statusMap[item.status]} dark={dark} />,
            <div style={{ display: 'flex', gap: 4 }}>
              <Btn label="상세" small dark={dark} accent={accent} />
            </div>
          ])}
        />
      </div>
    </div>
  );
};

// 인사관리
const ScreenHR = ({ dark, accent, subView }) => {
  const t = token(dark);
  const staff = [
    { name: '박철홍', dept: '정형외과', role: '수석', status: '재직', joined: '2022.03.01' },
    { name: '이수연', dept: '간호부', role: '수간호사', status: '재직', joined: '2020.05.15' },
    { name: '김민준', dept: '마취과', role: '전문의', status: '재직', joined: '2021.09.01' },
    { name: '박민아', dept: '행정팀', role: '주임', status: '재직', joined: '2023.01.10' },
    { name: '최건호', dept: '방사선과', role: '방사선사', status: '휴직', joined: '2019.07.20' },
    { name: '장서윤', dept: '물리치료팀', role: '치료사', status: '재직', joined: '2024.02.01' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader dark={dark} accent={accent} title="인사관리" subtitle={`${subView} · 총 ${staff.length}명`} actions={<>
        <Btn label="직원 등록" icon="plus" primary dark={dark} accent={accent} />
        <Btn label="내보내기" icon="download" dark={dark} accent={accent} />
      </>} />
      <div style={{ overflowY: 'auto', flex: 1, padding: 20 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <StatCard label="전체 직원" value="38명" icon="users" accent={accent} dark={dark} />
          <StatCard label="이번 달 입사" value="2명" icon="plus" accent={accent} dark={dark} color="#10b981" />
          <StatCard label="휴직" value="1명" icon="calendar" accent={accent} dark={dark} color="#f59e0b" />
          <StatCard label="이번 달 퇴사" value="0명" icon="logout" accent={accent} dark={dark} />
        </div>
        <DataTable dark={dark} accent={accent}
          cols={['이름', '부서', '직책', '입사일', '상태', '']}
          rows={staff.map(s => [
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: `${accent}18`, color: accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
              }}>{s.name[0]}</div>
              <span style={{ fontWeight: 600, color: token(dark).fg }}>{s.name}</span>
            </div>,
            s.dept, s.role, s.joined,
            <Badge label={s.status} type={s.status === '재직' ? 'green' : 'yellow'} dark={dark} />,
            <Btn label="상세" small dark={dark} accent={accent} />,
          ])}
        />
      </div>
    </div>
  );
};

// 재고관리
const ScreenInventory = ({ dark, accent, subView }) => {
  const t = token(dark);
  const items = [
    { name: '의료용 소독제', cat: '소모품', stock: 240, unit: 'mL', min: 50, status: '정상' },
    { name: '수술용 장갑 (M)', cat: '의료기기', stock: 12, unit: '박스', min: 20, status: '부족' },
    { name: '붕대 (10cm)', cat: '소모품', stock: 340, unit: '개', min: 100, status: '정상' },
    { name: '주사기 (10mL)', cat: '소모품', stock: 890, unit: '개', min: 200, status: '정상' },
    { name: '혈압계', cat: '의료기기', stock: 3, unit: '대', min: 5, status: '부족' },
    { name: '심전도 전극 패드', cat: '소모품', stock: 45, unit: '개', min: 50, status: '주의' },
  ];
  const statusMap = { '정상': 'green', '부족': 'red', '주의': 'yellow' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader dark={dark} accent={accent} title="재고관리" subtitle={subView} actions={<>
        <Btn label="입고 등록" icon="upload" primary dark={dark} accent={accent} />
        <Btn label="출고 등록" icon="download" dark={dark} accent={accent} />
      </>} />
      <div style={{ overflowY: 'auto', flex: 1, padding: 20 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <StatCard label="총 품목" value="142개" icon="package" accent={accent} dark={dark} />
          <StatCard label="부족 품목" value="4개" icon="alert" accent={accent} dark={dark} color="#ef4444" />
          <StatCard label="이번 달 입고" value="28건" icon="upload" accent={accent} dark={dark} color="#10b981" />
          <StatCard label="이번 달 출고" value="61건" icon="download" accent={accent} dark={dark} />
        </div>
        <DataTable dark={dark} accent={accent}
          cols={['품목명', '카테고리', '현재 재고', '단위', '최소 재고', '상태', '']}
          rows={items.map(item => [
            <span style={{ fontWeight: 500, color: token(dark).fg }}>{item.name}</span>,
            <Badge label={item.cat} type="gray" dark={dark} />,
            <span style={{
              fontWeight: 700, color: item.status === '부족' ? '#ef4444' : item.status === '주의' ? '#f59e0b' : token(dark).fg,
              fontVariantNumeric: 'tabular-nums',
            }}>{item.stock}</span>,
            item.unit, item.min,
            <Badge label={item.status} type={statusMap[item.status]} dark={dark} />,
            <Btn label="발주" small dark={dark} accent={accent} />,
          ])}
        />
      </div>
    </div>
  );
};

// 관리자
const ScreenAdmin = ({ dark, accent, subView }) => {
  const t = token(dark);
  const metrics = [
    { label: '이번 달 매출', value: '₩142M', icon: 'trending', color: '#10b981', sub: '전월 대비 +8.2%' },
    { label: '총 직원', value: '38명', icon: 'users', color: accent, sub: '이번 달 입사 2명' },
    { label: '미결재 건수', value: '6건', icon: 'clock', color: '#f59e0b', sub: '긴급 1건 포함' },
    { label: '재고 이상', value: '4개', icon: 'alert', color: '#ef4444', sub: '발주 필요' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader dark={dark} accent={accent} title="관리자" subtitle={`${subView} · 경영대시보드`} />
      <div style={{ overflowY: 'auto', flex: 1, padding: 20 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {metrics.map((m, i) => (
            <StatCard key={i} label={m.label} value={m.value} icon={m.icon} accent={accent} dark={dark} color={m.color} sub={m.sub} trend="up" />
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          {/* 최근 알림 */}
          <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.fg, marginBottom: 14 }}>최근 알림</div>
            {[
              { icon: 'alert', text: '수술용 장갑 재고 부족 감지', time: '방금', color: '#ef4444' },
              { icon: 'approval', text: '김민준 결재 대기 중', time: '5분 전', color: '#f59e0b' },
              { icon: 'users', text: '장서윤 근무 이탈 감지', time: '12분 전', color: '#f59e0b' },
              { icon: 'check', text: '3월 급여 이상치 없음', time: '2시간 전', color: '#10b981' },
            ].map((n, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 7, background: `${n.color}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon name={n.icon} size={13} color={n.color} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: t.fg }}>{n.text}</div>
                  <div style={{ fontSize: 11, color: t.fgMuted, marginTop: 2 }}>{n.time}</div>
                </div>
              </div>
            ))}
          </div>

          {/* 빠른 액세스 */}
          <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.fg, marginBottom: 14 }}>빠른 액세스</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { icon: 'barChart', label: '경영 대시보드' },
                { icon: 'dollarSign', label: '급여 이상치' },
                { icon: 'eye', label: '감사 로그' },
                { icon: 'database', label: '데이터 백업' },
                { icon: 'users', label: '직원 권한' },
                { icon: 'settings', label: '운영 설정' },
              ].map((item, i) => (
                <button key={i} style={{
                  background: t.muted, border: `1px solid ${t.border}`, borderRadius: 8,
                  padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 8, transition: 'border-color 0.15s',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = accent}
                  onMouseLeave={e => e.currentTarget.style.borderColor = t.border}
                >
                  <Icon name={item.icon} size={14} color={accent} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: t.fg }}>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Screen router ────────────────────────────────────
const ContentScreen = ({ mainMenu, subView, dark, accent }) => {
  const t = token(dark);
  const screens = {
    '내정보':   () => <ScreenMyInfo dark={dark} accent={accent} />,
    '채팅':     () => <ScreenChat dark={dark} accent={accent} />,
    '게시판':   () => <ScreenBoard dark={dark} accent={accent} subView={subView} />,
    '전자결재': () => <ScreenApproval dark={dark} accent={accent} subView={subView} />,
    '인사관리': () => <ScreenHR dark={dark} accent={accent} subView={subView} />,
    '재고관리': () => <ScreenInventory dark={dark} accent={accent} subView={subView} />,
    '관리자':   () => <ScreenAdmin dark={dark} accent={accent} subView={subView} />,
    '추가기능': () => (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <PageHeader dark={dark} accent={accent} title="추가기능" />
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
            {[
              { icon: 'calendar', label: '공유 캘린더' },
              { icon: 'map', label: 'ESL 관리' },
              { icon: 'check', label: 'OP 체크' },
              { icon: 'users', label: '로스터' },
              { icon: 'barChart', label: '통계' },
              { icon: 'fileText', label: '공문서' },
            ].map((item, i) => (
              <button key={i} style={{
                background: t.card, border: `1px solid ${t.border}`, borderRadius: 12,
                padding: '20px 16px', cursor: 'pointer', textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                transition: 'all 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = `0 4px 12px ${accent}18`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 12, background: `${accent}12`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name={item.icon} size={20} color={accent} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: t.fg }}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    ),
  };

  const Screen = screens[mainMenu];
  if (Screen) return <Screen />;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: t.fgMuted, flexDirection: 'column', gap: 10 }}>
      <Icon name="info" size={32} color={t.fgMuted} />
      <span style={{ fontSize: 14 }}>{mainMenu} — 준비 중</span>
    </div>
  );
};

Object.assign(window, { ContentScreen });
