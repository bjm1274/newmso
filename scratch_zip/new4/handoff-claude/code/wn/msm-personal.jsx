// MSO 모바일 — 내정보(개인) 상세 화면 본문
// ── 조회 공통 유틸 ──────────────────────────────────────────────
const PSN_TODAY = new Date(2026, 4, 12); // 오늘 = 2026.5.12
function psnDaysAgo(d) {
  const [y, m, day] = d.split('.').map(Number);
  return Math.round((PSN_TODAY - new Date(y, m - 1, day)) / 86400000);
}
function psnInPeriod(d, period) {
  if (period === 'all') return true;
  return psnDaysAgo(d) <= Number(period); // 미래일(결재중 신청) 포함, N일보다 오래된 건 제외
}
const PSN_PERIODS = [['30', '최근 30일'], ['90', '최근 90일'], ['all', '전체']];
const PSN_ST = {
  pending: { lbl: '결재중', tone: 'warn' },
  approved: { lbl: '승인', tone: 'success' },
  rejected: { lbl: '반려', tone: 'danger' },
};

// 조회 패널 — 세그먼트 + 기간칩 + 조회 버튼
function PsnQuery({ segs, seg, setSeg, period, setPeriod, onSearch, loading }) {
  return (
    <div className="msm-card" style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: 13 }}>
      {segs.length > 1 && (
        <div className="mm-seg">
          {segs.map(s => <button key={s.id} className={seg === s.id ? 'on' : ''} onClick={() => setSeg(s.id)}>{s.lbl}</button>)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 7 }}>
        {PSN_PERIODS.map(([id, lbl]) => (
          <button key={id} className={'glm-chip' + (period === id ? ' on' : '')}
            style={{ flex: 1, justifyContent: 'center', textAlign: 'center' }} onClick={() => setPeriod(id)}>{lbl}</button>
        ))}
      </div>
      <button className="msm-btn-lg accent" style={{ height: 46 }} onClick={onSearch} disabled={loading}>
        {loading ? <span className="psn-spin" /> : <Icon name="search" size={17} />}{loading ? ' 조회 중…' : ' 조회'}
      </button>
    </div>
  );
}

// 조회 결과 행 (신청 문서)
function PsnDocRow({ item, onApprove, leaving }) {
  const st = PSN_ST[item.status];
  const t = msmTone(st.tone);
  return (
    <div className="msm-row" style={{ cursor: 'default', alignItems: 'flex-start', opacity: leaving ? 0 : 1, transform: leaving ? 'translateX(16px)' : 'none', transition: 'opacity .3s ease, transform .3s ease' }}>
      <span className="lead" style={{ background: t.bg, color: t.fg }}><Icon name={item.icon || 'fileText'} size={18} /></span>
      <div className="main">
        <div className="nm" style={{ whiteSpace: 'normal' }}>{item.label}</div>
        <div className="sub" style={{ fontFeatureSettings: '"tnum"' }}>{item.date}{item.note ? ' · ' + item.note : ''}</div>
        {item.status === 'pending' && (
          <button className="msm-mini-btn" style={{ marginTop: 9, height: 32, color: '#047857', borderColor: '#A7F3D0', background: 'var(--success-soft)' }}
            onClick={() => onApprove(item.id)}><Icon name="checkCircle" size={13} /> 결재 승인 (시연)</button>
        )}
      </div>
      <div className="meta"><span className={'msm-badge ' + st.tone}>{st.lbl}</span>{item.step && <span className="time" style={{ fontFeatureSettings: '"tnum"' }}>{item.step}</span>}</div>
    </div>
  );
}

// 조회 결과 영역 — 진행 중 / 처리 완료 분리, 90일 등 기간 필터 적용
function PsnDocResults({ queried, loading, items, period, onApprove, leavingId, emptyHint }) {
  if (loading) return <div className="msm-empty"><span className="psn-spin lg" />조회 중…</div>;
  if (!queried) return <div className="msm-empty"><Icon name="search" size={26} />{emptyHint || '조회 버튼을 눌러 내역을 확인하세요.'}</div>;
  const filtered = items.filter(it => psnInPeriod(it.date, period));
  const pending = filtered.filter(it => it.status === 'pending');
  const done = filtered.filter(it => it.status !== 'pending');
  const lbl = period === 'all' ? '전체 기간' : '최근 ' + period + '일';
  if (filtered.length === 0) return <div className="msm-empty"><Icon name="fileText" size={26} />{lbl} 내역이 없습니다.</div>;
  return (
    <>
      {pending.length > 0 && (
        <>
          <div className="msm-sec"><span className="msm-sec-t">진행 중</span><span className="msm-sec-more" style={{ color: 'var(--z-400)' }}>{pending.length}건</span></div>
          <div className="msm-list">{pending.map(it => <PsnDocRow key={it.id} item={it} onApprove={onApprove} leaving={leavingId === it.id} />)}</div>
        </>
      )}
      <div className="msm-sec"><span className="msm-sec-t">처리 완료</span><span className="msm-sec-more" style={{ color: 'var(--z-400)' }}>{lbl} · {done.length}건</span></div>
      {done.length === 0
        ? <div className="msm-empty" style={{ padding: 22 }}>완료된 내역이 없습니다.</div>
        : <div className="msm-list">{done.map(it => <PsnDocRow key={it.id} item={it} />)}</div>}
    </>
  );
}

// 신청→승인 시 진행 중 목록에서 사라지는 공통 로직
function usePsnApprove() {
  const [removed, setRemoved] = useMsmState([]);
  const [leavingId, setLeavingId] = useMsmState(null);
  const approve = (id) => { setLeavingId(id); setTimeout(() => { setRemoved(r => [...r, id]); setLeavingId(null); }, 320); };
  return { removed, leavingId, approve };
}

// ── 출퇴근 / 출결정정 ──────────────────────────────────────────
const PSN_ATTLOG = [
  { d: '5/11 (월)', date: '2026.5.11', in: '08:52', out: '18:10', state: '정상', tone: 'success' },
  { d: '5/8 (금)', date: '2026.5.08', in: '08:47', out: '18:32', state: '정상', tone: 'success' },
  { d: '5/7 (목)', date: '2026.5.07', in: '09:06', out: '18:05', state: '지각', tone: 'warn' },
  { d: '5/6 (수)', date: '2026.5.06', in: '08:40', out: '18:20', state: '정상', tone: 'success' },
  { d: '5/2 (금)', date: '2026.5.02', in: '08:55', out: '18:00', state: '정상', tone: 'success' },
  { d: '4/24 (목)', date: '2026.4.24', in: '08:50', out: '18:12', state: '정상', tone: 'success' },
  { d: '4/10 (금)', date: '2026.4.10', in: '09:02', out: '18:30', state: '지각', tone: 'warn' },
  { d: '3/20 (금)', date: '2026.3.20', in: '08:45', out: '18:05', state: '정상', tone: 'success' },
  { d: '2/14 (금)', date: '2026.2.14', in: '08:58', out: '18:22', state: '정상', tone: 'success' },
  { d: '1/30 (금)', date: '2026.1.30', in: '08:51', out: '18:15', state: '정상', tone: 'success' },
];
const PSN_ATTFIX = [
  { id: 'af1', date: '2026.5.07', label: '5/7(목) 출근 09:06 → 08:55 정정', note: '지문 인식 오류', status: 'pending', step: '1/2' },
  { id: 'af2', date: '2026.5.02', label: '5/2(금) 출근 09:00 → 08:30 정정', note: '외근 후 복귀', status: 'approved' },
  { id: 'af3', date: '2026.3.18', label: '3/18(수) 퇴근 기록 누락 정정', status: 'approved' },
  { id: 'af4', date: '2026.1.22', label: '1/22(목) 출근 정정', note: '증빙 부족', status: 'rejected' },
];

function AttendBody() {
  const [seg, setSeg] = useMsmState('log'); // 'log' | 'fix'
  const [period, setPeriod] = useMsmState('90');
  const [queried, setQueried] = useMsmState(false);
  const [loading, setLoading] = useMsmState(false);
  const { removed, leavingId, approve } = usePsnApprove();
  const search = () => { setLoading(true); setTimeout(() => { setLoading(false); setQueried(true); }, 420); };

  const logRows = PSN_ATTLOG.filter(r => psnInPeriod(r.date, period));
  const fixRows = PSN_ATTFIX.filter(r => !removed.includes(r.id));
  const lbl = period === 'all' ? '전체 기간' : '최근 ' + period + '일';

  return (
    <>
      <div className="msm-hero" style={{ background: 'linear-gradient(135deg,#1D4ED8,#2563EB)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>오늘 · 5월 12일 (화)</div>
        <div style={{ display: 'flex', gap: 20, marginTop: 12, position: 'relative', zIndex: 1 }}>
          <div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>출근</div><div style={{ fontSize: 24, fontWeight: 800, fontFeatureSettings: '"tnum"' }}>08:49</div></div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.2)' }} />
          <div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>퇴근</div><div style={{ fontSize: 24, fontWeight: 800, color: 'rgba(255,255,255,0.55)' }}>근무 중</div></div>
        </div>
      </div>
      <button className="msm-btn-lg accent"><Icon name="clock" size={18} /> 퇴근 체크</button>
      <div className="msm-stat2">
        <div className="msm-statcard"><div className="v">21일</div><div className="l">이번 달 출근</div></div>
        <div className="msm-statcard"><div className="v" style={{ color: '#B45309' }}>1회</div><div className="l">지각</div></div>
      </div>

      <div className="msm-sec"><span className="msm-sec-t">조회</span></div>
      <PsnQuery
        segs={[{ id: 'log', lbl: '출근 기록' }, { id: 'fix', lbl: '출결정정' }]}
        seg={seg} setSeg={setSeg} period={period} setPeriod={setPeriod} onSearch={search} loading={loading} />

      {seg === 'log' ? (
        loading ? <div className="msm-empty"><span className="psn-spin lg" />조회 중…</div>
          : !queried ? <div className="msm-empty"><Icon name="search" size={26} />조회 버튼을 눌러 출근 기록을 확인하세요.</div>
            : (
              <>
                <div className="msm-sec"><span className="msm-sec-t">출근 기록</span><span className="msm-sec-more" style={{ color: 'var(--z-400)' }}>{lbl} · {logRows.length}일</span></div>
                {logRows.length === 0 ? <div className="msm-empty"><Icon name="clock" size={26} />{lbl} 기록이 없습니다.</div>
                  : (
                    <div className="msm-list">
                      {logRows.map((w, i) => (
                        <div key={i} className="msm-row" style={{ cursor: 'default' }}>
                          <span className="lead" style={{ background: 'var(--accent-soft)', color: 'var(--accent-700)' }}><Icon name="clock" size={18} /></span>
                          <div className="main"><div className="nm">{w.d}</div><div className="sub" style={{ fontFeatureSettings: '"tnum"' }}>{w.in} – {w.out}</div></div>
                          <div className="meta"><span className={'msm-badge ' + w.tone}>{w.state}</span></div>
                        </div>
                      ))}
                    </div>
                  )}
              </>
            )
      ) : (
        <PsnDocResults queried={queried} loading={loading} items={fixRows} period={period}
          onApprove={approve} leavingId={leavingId} emptyHint="조회 버튼을 눌러 출결정정 신청 내역을 확인하세요." />
      )}
    </>
  );
}

// ── 연차신청 / 연차계획 ────────────────────────────────────────
const PSN_LEAVE_REQ = [
  { id: 'lr1', date: '2026.5.20', label: '연차신청 · 2일 (5/20~21)', note: '가족 여행', status: 'pending', step: '2/3' },
  { id: 'lr2', date: '2026.5.13', label: '연차신청 · 1일', note: '개인 사유', status: 'approved' },
  { id: 'lr3', date: '2026.4.30', label: '연차신청 · 반차(오후) 0.5일', note: '병원 진료', status: 'approved' },
  { id: 'lr4', date: '2026.3.14', label: '연차신청 · 1일', status: 'approved' },
  { id: 'lr5', date: '2026.2.27', label: '연차신청 · 1일', status: 'approved' },
  { id: 'lr6', date: '2026.1.09', label: '연차신청 · 1일', note: '인원 부족', status: 'rejected' },
];
const PSN_LEAVE_PLAN = [
  { id: 'lp1', date: '2026.5.08', label: '2026 상반기 연차계획서', note: '제출 완료', status: 'approved' },
  { id: 'lp2', date: '2026.5.02', label: '7월 가족여행 3일 계획', note: '승인 대기', status: 'pending', step: '1/2' },
  { id: 'lp3', date: '2026.2.20', label: '2026 연간 연차계획서', status: 'approved' },
];

function LeaveBody() {
  const [seg, setSeg] = useMsmState('req'); // 'req' | 'plan'
  const [period, setPeriod] = useMsmState('90');
  const [queried, setQueried] = useMsmState(false);
  const [loading, setLoading] = useMsmState(false);
  const { removed, leavingId, approve } = usePsnApprove();
  const search = () => { setLoading(true); setTimeout(() => { setLoading(false); setQueried(true); }, 420); };

  const base = seg === 'req' ? PSN_LEAVE_REQ : PSN_LEAVE_PLAN;
  const items = base.filter(it => !removed.includes(it.id));

  return (
    <>
      <div className="msm-hero" style={{ background: 'linear-gradient(135deg,#047857,#10B981)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>2026년 잔여 연차</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6, position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 38, fontWeight: 800, fontFeatureSettings: '"tnum"' }}>11</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>/ 15일</div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>사용 4일 · 소진율 27%</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="msm-btn-lg accent" style={{ flex: 1 }}><Icon name="plus" size={17} /> 연차신청</button>
        <button className="msm-btn-lg" style={{ flex: 1 }}><Icon name="calendar" size={17} /> 연차계획서</button>
      </div>

      <div className="msm-sec"><span className="msm-sec-t">조회</span></div>
      <PsnQuery
        segs={[{ id: 'req', lbl: '연차신청' }, { id: 'plan', lbl: '연차계획' }]}
        seg={seg} setSeg={setSeg} period={period} setPeriod={setPeriod} onSearch={search} loading={loading} />
      <PsnDocResults queried={queried} loading={loading} items={items} period={period}
        onApprove={approve} leavingId={leavingId}
        emptyHint={'조회 버튼을 눌러 ' + (seg === 'req' ? '연차신청' : '연차계획') + ' 내역을 확인하세요.'} />
    </>
  );
}

function PayslipBody() {
  const rows = [
    { l: '기본급', v: '3,200,000' }, { l: '직책수당', v: '400,000' }, { l: '식대', v: '200,000' }, { l: '야간수당', v: '128,000' },
  ];
  const deduct = [
    { l: '국민연금', v: '-162,000' }, { l: '건강보험', v: '-128,400' }, { l: '소득세', v: '-184,300' }, { l: '주민세', v: '-18,430' },
  ];
  return (
    <>
      <div className="msm-hero" style={{ background: 'linear-gradient(135deg,#0B0B0E,#1A1A21)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>2026년 4월 급여명세</div>
        <div style={{ marginTop: 8, position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>실수령액</div>
          <div style={{ fontSize: 26, fontWeight: 800, fontFeatureSettings: '"tnum"' }}>3,436,470<span style={{ fontSize: 14 }}>원</span></div>
        </div>
      </div>
      <div className="msm-card">
        <div className="msm-sec" style={{ padding: 0, marginBottom: 8 }}><span className="msm-sec-t">지급</span></div>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13.5, fontWeight: 600, color: 'var(--z-700)', borderBottom: i < rows.length - 1 ? '1px solid var(--z-100)' : 'none' }}>
            <span>{r.l}</span><span style={{ fontFeatureSettings: '"tnum"' }}>{r.v}</span>
          </div>
        ))}
      </div>
      <div className="msm-card">
        <div className="msm-sec" style={{ padding: 0, marginBottom: 8 }}><span className="msm-sec-t">공제</span></div>
        {deduct.map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13.5, fontWeight: 600, color: 'var(--danger)', borderBottom: i < deduct.length - 1 ? '1px solid var(--z-100)' : 'none' }}>
            <span style={{ color: 'var(--z-700)' }}>{r.l}</span><span style={{ fontFeatureSettings: '"tnum"' }}>{r.v}</span>
          </div>
        ))}
      </div>
      <button className="msm-btn-lg"><Icon name="arrowDown" size={17} /> 명세서 PDF 다운로드</button>
    </>
  );
}

function CertBody() {
  const certs = [
    { t: '재직증명서', s: '발급 즉시 가능', ic: 'fileText', tone: 'accent' },
    { t: '경력증명서', s: '발급 즉시 가능', ic: 'fileText', tone: 'accent' },
    { t: '근로소득 원천징수영수증', s: '연 1회 발급', ic: 'won', tone: 'warn' },
    { t: '갑종근로소득 지급명세서', s: '관리자 승인 필요', ic: 'fileText', tone: 'muted' },
  ];
  return (
    <>
      <div className="msm-sec"><span className="msm-sec-t">발급 가능 서류</span></div>
      <div className="msm-list">
        {certs.map((c, i) => {
          const t = msmTone(c.tone);
          return (
            <button key={i} className="msm-row">
              <span className="lead" style={{ background: t.bg, color: t.fg }}><Icon name={c.ic} size={18} /></span>
              <div className="main"><div className="nm">{c.t}</div><div className="sub">{c.s}</div></div>
              <div className="meta"><span className="msm-badge accent">발급</span></div>
            </button>
          );
        })}
      </div>
      <div className="msm-sec"><span className="msm-sec-t">최근 발급</span></div>
      <div className="msm-list">
        <div className="msm-row" style={{ cursor: 'default' }}>
          <span className="lead" style={{ background: 'var(--z-100)', color: 'var(--z-600)' }}><Icon name="fileText" size={18} /></span>
          <div className="main"><div className="nm">재직증명서</div><div className="sub">2026.4.28 발급 · PDF</div></div>
          <div className="meta"><Icon name="arrowDown" size={17} color="var(--accent)" /></div>
        </div>
      </div>
    </>
  );
}

function EditInfoBody() {
  const D = window.MSM;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0 4px' }}>
        <div style={{ position: 'relative' }}>
          <div className="msm-hero-av" style={{ width: 80, height: 80, background: 'var(--accent)', fontSize: 30 }}>{D.me.initials}</div>
          <button style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 999, border: '2px solid #fff', background: 'var(--z-800)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon name="edit" size={13} /></button>
        </div>
      </div>
      <div className="glm-field"><span className="lbl">이름</span><input className="glm-input" defaultValue={D.me.name} /></div>
      <div className="glm-field"><span className="lbl">직책 / 부서</span><input className="glm-input" defaultValue={D.me.role} /></div>
      <div className="glm-field"><span className="lbl">휴대전화</span><input className="glm-input" defaultValue="010-2345-6789" /></div>
      <div className="glm-field"><span className="lbl">이메일</span><input className="glm-input" defaultValue="jm.baek@syinc.co.kr" /></div>
      <div className="glm-field"><span className="lbl">비상 연락처</span><input className="glm-input" placeholder="비상 연락처 입력" /></div>
      <button className="msm-btn-lg accent"><Icon name="check" size={17} /> 변경사항 저장</button>
    </>
  );
}

Object.assign(window, { AttendBody, LeaveBody, PayslipBody, CertBody, EditInfoBody });
