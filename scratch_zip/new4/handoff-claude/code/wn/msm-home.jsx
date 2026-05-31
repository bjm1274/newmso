// MSO 모바일 — 톤 헬퍼 + 홈(내정보) 화면
const { useState: useMsmState } = React;

const MSM_TONE = {
  accent: { bg: 'var(--accent-soft)', fg: 'var(--accent-700)' },
  success: { bg: '#ECFDF5', fg: '#047857' },
  warn: { bg: 'var(--warning-soft)', fg: '#B45309' },
  danger: { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
  muted: { bg: 'var(--z-100)', fg: 'var(--z-600)' },
};
function msmTone(t) { return MSM_TONE[t] || MSM_TONE.muted; }

function MsmAppbar({ eyebrow, title, topInset, actions }) {
  return (
    <div className="msm-appbar">
      <div className="msm-appbar-inner" style={{ paddingTop: topInset + 8 }}>
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <div className="title">{title}</div>
        </div>
        {actions && <div className="msm-appbar-actions">{actions}</div>}
      </div>
    </div>
  );
}

function HomeScreen({ topInset, bottomInset, onNav }) {
  const D = window.MSM;
  const [sub, setSub] = useMsmState(null); // 'attend'|'leave'|'payslip'|'cert'|'edit'
  const [pwGate, setPwGate] = useMsmState(null); // 비밀번호 확인 대상 sub id
  const [pw, setPw] = useMsmState('');
  const [pwErr, setPwErr] = useMsmState(false);

  const SUBS = {
    attend: { title: '출퇴근', body: <AttendBody /> },
    leave: { title: '연차', body: <LeaveBody /> },
    payslip: { title: '급여명세', body: <PayslipBody /> },
    cert: { title: '증명서', body: <CertBody /> },
    edit: { title: '정보 수정', body: <EditInfoBody /> },
  };

  const onQuick = (id) => {
    if (['payslip', 'cert'].includes(id)) { setPwGate(id); setPw(''); setPwErr(false); }
    else if (['attend', 'leave'].includes(id)) setSub(id);
    else if (id === 'approval') onNav && onNav('approval');
    else if (id === 'stock') onNav && onNav('stock');
    else onNav && onNav('addon'); // org / more / 기타
  };

  const submitPw = () => {
    if (pw.length < 4) { setPwErr(true); return; }
    const target = pwGate;
    setPwGate(null); setPw(''); setPwErr(false);
    setSub(target);
  };

  return (
    <div className="msm-scroll">
      <div className="msm-body" style={{ paddingTop: topInset + 12 }}>
          {/* 프로필 hero */}
          <div className="msm-hero">
            <button onClick={() => setSub('edit')} aria-label="정보 수정" style={{ position: 'absolute', top: 14, right: 14, zIndex: 2, width: 34, height: 34, borderRadius: 11, border: 'none', background: 'rgba(255,255,255,0.18)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <Icon name="edit" size={16} />
            </button>
            <div className="msm-hero-top">
              <div className="msm-hero-av">{D.me.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="msm-hero-nm">{D.me.name}</div>
                <div className="msm-hero-role">{D.me.role}</div>
                <div className="msm-hero-chips">
                  <span className="msm-hero-chip">재직중</span>
                  <span className="msm-hero-chip">정규직</span>
                  <span className="msm-hero-chip">입사 {D.me.tenure}</span>
                </div>
              </div>
            </div>
            <div className="msm-hero-stats">
              <div className="msm-hero-stat"><div className="v">1/4</div><div className="l">이번 달 지각</div></div>
              <div className="msm-hero-stat"><div className="v">11일</div><div className="l">잔여 연차</div></div>
              <div className="msm-hero-stat"><div className="v">0건</div><div className="l">미결재</div></div>
            </div>
          </div>

          {/* 빠른 메뉴 */}
          <div className="msm-card">
            <div className="msm-quick">
              {D.quick.map(q => {
                const t = msmTone(q.tone);
                return (
                  <button key={q.id} className="msm-quick-item" onClick={() => onQuick(q.id)}>
                    <span className={'msm-quick-ic' + (q.n ? ' msm-quick-badge' : '')} data-n={q.n} style={{ background: t.bg, color: t.fg }}>
                      <Icon name={q.icon} size={23} />
                    </span>
                    <span className="msm-quick-lbl">{q.lbl}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 설정 */}
          <div className="msm-sec"><span className="msm-sec-t">설정</span></div>
          <div className="msm-setlist">
            <button className="msm-setrow" onClick={() => setSub('edit')}>
              <span className="si" style={{ background: 'var(--accent-soft)', color: 'var(--accent-700)' }}><Icon name="user" size={17} /></span>
              <span className="st">정보 수정</span><Icon name="chevR" size={16} color="var(--z-300)" />
            </button>
            <button className="msm-setrow">
              <span className="si"><Icon name="bell" size={17} /></span>
              <span className="st">알림 설정</span><span className="sv">켜짐</span><Icon name="chevR" size={16} color="var(--z-300)" />
            </button>
            <button className="msm-setrow">
              <span className="si"><Icon name="shield" size={17} /></span>
              <span className="st">비밀번호 변경</span><Icon name="chevR" size={16} color="var(--z-300)" />
            </button>
          </div>

          {/* 로그아웃 */}
          <button className="msm-btn-lg danger"><Icon name="logout" size={17} /> 로그아웃</button>
          <div style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 600, color: 'var(--z-300)' }}>MSO · v2.4.1</div>
          <div style={{ height: bottomInset + 8 }} />
      </div>

      {/* 개인 상세 화면 */}
      {Object.keys(SUBS).map(k => (
        <MsmSubScreen key={k} open={sub === k} title={SUBS[k].title} backLabel="내정보"
          topInset={topInset} bottomInset={bottomInset} onClose={() => setSub(null)}>
          {sub === k ? SUBS[k].body : null}
        </MsmSubScreen>
      ))}

      {/* 비밀번호 확인 모달 (급여명세 · 증명서) */}
      <div className={'msm-pw-scrim' + (pwGate ? ' on' : '')} onClick={() => setPwGate(null)}>
        <div className="msm-pw" onClick={e => e.stopPropagation()}>
          <span className="msm-pw-ic"><Icon name="shield" size={26} /></span>
          <div className="msm-pw-t">보안 확인</div>
          <div className="msm-pw-s">{pwGate === 'payslip' ? '급여명세' : '증명서'}는 민감 정보입니다.<br />비밀번호를 입력해 주세요.</div>
          <input className={'msm-pw-input' + (pwErr ? ' invalid' : '')} type="password" inputMode="numeric"
            placeholder="••••" value={pw} autoFocus
            onChange={e => { setPw(e.target.value); setPwErr(false); }}
            onKeyDown={e => e.key === 'Enter' && submitPw()} />
          {pwErr && <div className="msm-pw-err">비밀번호 4자리 이상을 입력해 주세요.</div>}
          <div className="msm-pw-actions">
            <button onClick={() => setPwGate(null)}>취소</button>
            <button className="primary" onClick={submitPw}>확인</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 알림 화면
function NotifScreen({ topInset, bottomInset }) {
  const items = [
    { id: 'n1', ic: 'checkCircle', tone: 'accent', t: '결재 요청 도착', s: '박유진 · 연차 사용 신청 (5/20-21)', time: '방금', unread: true },
    { id: 'n2', ic: 'package', tone: 'danger', t: '재고 0 경고', s: '멸그루브 18cm · 외래팀 — 자동 발주 필요', time: '12분 전', unread: true },
    { id: 'n3', ic: 'chat', tone: 'success', t: 'SY INC. 경영지원', s: '박유진: 이력서 받으세요', time: '38분 전', unread: true },
    { id: 'n4', ic: 'bell', tone: 'warn', t: '공지사항', s: '신규 메신저 출·퇴근 기능 안내', time: '오늘 09:00', unread: false },
    { id: 'n5', ic: 'calendar', tone: 'accent', t: '연차 승인 완료', s: '5/13 연차가 승인되었습니다', time: '어제', unread: false },
    { id: 'n6', ic: 'won', tone: 'warn', t: '급여명세서 발행', s: '4월 급여명세서를 확인하세요', time: '5/10', unread: false },
  ];
  return (
    <div className="msm-scroll">
      <div className="msm-body" style={{ paddingTop: topInset + 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="title" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em' }}>알림</div>
          <button className="msm-sec-more" style={{ marginLeft: 'auto' }}>모두 읽음</button>
        </div>
        <div className="msm-list">
          {items.map(n => {
            const t = msmTone(n.tone);
            return (
              <button key={n.id} className="msm-row" style={{ background: n.unread ? 'var(--accent-tint)' : '#fff', borderColor: n.unread ? '#CADCFE' : 'var(--border)', alignItems: 'flex-start' }}>
                <span className="lead" style={{ background: t.bg, color: t.fg }}><Icon name={n.ic} size={18} /></span>
                <div className="main">
                  <div className="nm">{n.t}{n.unread && <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--accent)', display: 'inline-block' }} />}</div>
                  <div className="sub" style={{ whiteSpace: 'normal' }}>{n.s}</div>
                </div>
                <div className="meta"><span className="time">{n.time}</span></div>
              </button>
            );
          })}
        </div>
        <div style={{ height: bottomInset + 8 }} />
      </div>
    </div>
  );
}

Object.assign(window, { MSM_TONE, msmTone, MsmAppbar, HomeScreen, NotifScreen });
