// MSO redesign — shell (1차 사이드바 + 2차 사이드바 + 메인 컨텐츠 영역)

const PRIMARY_MENUS = [
  { id: 'mypage',  label: '내정보',   icon: 'user' },
  { id: 'addon',   label: '추가기능', icon: 'plusBox' },
  { id: 'chat',    label: '채팅',     icon: 'chat' },
  { id: 'board',   label: '게시판',   icon: 'board' },
  { id: 'approval',label: '전자결재', icon: 'approval' },
  { id: 'hr',      label: '인사관리', icon: 'hr' },
  { id: 'stock',   label: '재고관리', icon: 'inventory' },
  { id: 'admin',   label: '관리자',   icon: 'shield' },
];

const Sidebar1 = ({ active, onPick }) => (
  <aside className="sidebar1">
    <div className="brand">SY</div>
    <div className="s1-bell"><Icon name="bell" size={20}/></div>
    {PRIMARY_MENUS.map(m => (
      <div
        key={m.id}
        className={'s1-item' + (active === m.id ? ' on' : '')}
        onClick={() => onPick(m.id)}
      >
        <Icon name={m.icon} size={20}/>
        <span className="lbl">{m.label}</span>
      </div>
    ))}
    <div className="s1-foot"><div className="s1-avatar">백</div></div>
  </aside>
);

const PageHeader = ({ crumb, title, badges, right, sub }) => (
  <div className="pageheader">
    <div>
      {crumb && (
        <div className="crumb">
          {crumb.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="sep">›</span>}
              <span>{c}</span>
            </React.Fragment>
          ))}
        </div>
      )}
      <div className="h1-row">
        <div className="h1">{title}</div>
        {(badges || []).map((b, i) => (
          <span key={i} className={'chip ' + (b.tone || '')}>{b.label}</span>
        ))}
      </div>
      {sub && <div className="sub">{sub}</div>}
    </div>
    {right && <div className="ph-right">{right}</div>}
  </div>
);

const Tabs = ({ tabs, active, onPick, right }) => (
  <div className="tabs">
    {tabs.map(t => (
      <button
        key={t.id}
        className={'tab' + (active === t.id ? ' on' : '')}
        onClick={() => onPick && onPick(t.id)}
      >
        {t.icon && <Icon name={t.icon} size={16}/>}
        <span>{t.label}</span>
      </button>
    ))}
    {right && <><div className="tab-spacer"/>{right}</>}
  </div>
);

const Btn = ({ children, variant, size, icon, onClick }) => (
  <button className={'btn ' + (variant || '') + (size ? ' ' + size : '')} onClick={onClick}>
    {icon && <Icon name={icon} size={14}/>}
    {children}
  </button>
);

const Chip = ({ tone, children }) => <span className={'chip ' + (tone || '')}>{children}</span>;

const Spark = ({ values = [], color = '#2563EB' }) => {
  const w = 120, h = 28, pad = 2;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = (max - min) || 1;
  const stepX = (w - pad * 2) / (values.length - 1 || 1);
  const points = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (h - pad * 2) * (1 - (v - min) / range);
    return `${x},${y}`;
  }).join(' ');
  const lastX = pad + (values.length - 1) * stepX;
  const lastY = pad + (h - pad * 2) * (1 - (values[values.length - 1] - min) / range);
  return (
    <svg className="kpi-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height={h}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" points={points}/>
      <circle cx={lastX} cy={lastY} r="2.5" fill={color}/>
    </svg>
  );
};

const Notes = ({ kicker, title, points }) => (
  <div className="notes">
    <div>
      <h3>{kicker}</h3>
      <h2>{title}</h2>
    </div>
    <div className="nbody">
      {points.map((p, i) => {
        const t = typeof p === 'string' ? '' : p.t;
        const b = typeof p === 'string' ? p : p.b;
        return (
          <div className="pt" key={i}>
            <div className="num">{String(i + 1).padStart(2, '0')}</div>
            {t && <h4>{t}</h4>}
            <p>{b}</p>
          </div>
        );
      })}
    </div>
  </div>
);

Object.assign(window, { Sidebar1, PageHeader, Tabs, Btn, Chip, Spark, Notes, PRIMARY_MENUS });
