// MSO 모바일 — 공통 컴포넌트
// React (globals) — load AFTER React + Babel.

// ─── Icon (lucide-like, reused from redesign/icons.jsx) ────────
const MIcon = ({ name, size = 20, color = 'currentColor', strokeWidth = 1.8, style }) => {
  const props = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round',
    style: { display: 'block', flexShrink: 0, ...style },
  };
  const P = {
    user:      <><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></>,
    users:     <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    chat:      <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
    board:     <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></>,
    approval:  <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 11 17 15 13"/></>,
    grid:      <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    hr:        <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2M8 7V5a2 2 0 0 0-4 0v2M12 12v4M10 14h4"/></>,
    inventory: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    shield:    <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    bell:      <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
    search:    <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    clock:     <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    check:     <><polyline points="20 6 9 17 4 12"/></>,
    checkCircle: <><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 16 9"/></>,
    send:      <><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    x:         <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    calendar:  <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    file:      <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
    fileText:  <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
    won:       <><path d="M4 6h16M4 11h16M9 4l3 16 3-16"/></>,
    badge:     <><circle cx="12" cy="9" r="6"/><path d="M9 14l-1 8 4-3 4 3-1-8"/></>,
    alertTri:  <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    alertCircle: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    arrowUp:   <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>,
    arrowDown: <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>,
    chevL:     <><polyline points="15 18 9 12 15 6"/></>,
    chevR:     <><polyline points="9 18 15 12 9 6"/></>,
    chevD:     <><polyline points="6 9 12 15 18 9"/></>,
    chevU:     <><polyline points="18 15 12 9 6 15"/></>,
    bookmark:  <><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></>,
    star:      <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    filter:    <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    moreH:     <><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></>,
    moreV:     <><circle cx="12" cy="5"  r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></>,
    out:       <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    edit:      <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    pie:       <><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></>,
    bar:       <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></>,
    trending:  <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    plus:      <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    minus:     <><line x1="5" y1="12" x2="19" y2="12"/></>,
    paperclip: <><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></>,
    smile:     <><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></>,
    pin:       <><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"/></>,
    download:  <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    share:     <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></>,
    mapPin:    <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></>,
    settings:  <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    qr:        <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="14" width="3" height="3"/><rect x="14" y="18" width="3" height="3"/></>,
    box:       <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    refresh:   <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>,
  };
  return <svg {...props}>{P[name] || P.alertCircle}</svg>;
};

// ─── Chip / Btn / Avatar / IconTile ────────────────────────────
const MChip = ({ tone, children, dot }) => (
  <span className={'m-chip ' + (tone || '') + (dot ? ' dot' : '')}>{children}</span>
);
const MBtn = ({ variant, size, block, icon, children, onClick, disabled }) => (
  <button
    className={'m-btn ' + (variant || '') + (size === 'lg' ? ' lg' : '') + (block ? ' block' : '')}
    onClick={onClick}
    disabled={disabled}
  >
    {icon && <MIcon name={icon} size={16}/>}
    {children}
  </button>
);
const MAvatar = ({ tone = 'blue', size, children }) => (
  <div className={'m-avatar tone-' + tone + (size ? ' ' + size : '')}>{children}</div>
);

// ─── Page header ───────────────────────────────────────────────
const MHeader = ({ back, title, sub, actions }) => (
  <div className="m-header">
    {back !== undefined && (
      <button className="back" onClick={back || (()=>{})}>
        <MIcon name="chevL" size={22}/>
      </button>
    )}
    <div style={{flex: 1, minWidth: 0}}>
      <div className="title" style={{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{title}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
    {actions && <div className="actions">{actions}</div>}
  </div>
);

// ─── Bottom tab ────────────────────────────────────────────────
const M_TABS = [
  { id:'home',  label:'내정보',  icon:'user' },
  { id:'chat',  label:'채팅',    icon:'chat' },
  { id:'board', label:'게시판',  icon:'board' },
  { id:'app',   label:'결재',    icon:'approval' },
  { id:'more',  label:'더보기',  icon:'grid' },
];
const MBottomTab = ({ active, badges = {}, onPick }) => (
  <div className="m-bottom-tab">
    {M_TABS.map(t => (
      <button key={t.id} className={t.id === active ? 'on' : ''} onClick={()=>onPick && onPick(t.id)}>
        <span className="ico-wrap">
          <MIcon name={t.icon} size={22} strokeWidth={t.id === active ? 2.1 : 1.7}/>
          {badges[t.id] && <span className="dot"/>}
        </span>
        <span className="lab">{t.label}</span>
      </button>
    ))}
  </div>
);

// ─── Card primitives ───────────────────────────────────────────
const MCard = ({ children, flush, style }) => (
  <div className={'m-card' + (flush ? ' flush' : '')} style={style}>{children}</div>
);
const MListRow = ({ icon, iconTone, label, sub, val, valUnit, right, onClick }) => (
  <div className="m-list-row" onClick={onClick}>
    {icon !== undefined && (
      typeof icon === 'string'
        ? <div className={'ico-tile ' + (iconTone ? 'tone-' + iconTone : '')}><MIcon name={icon} size={18}/></div>
        : icon
    )}
    {icon === undefined && <div style={{width:0}}/>}
    <div style={{minWidth: 0}}>
      <div className="lbl">{label}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
    <div style={{display:'flex', alignItems:'center', gap: 6}}>
      {val !== undefined && (
        <div className="val m-tnum">
          {val}{valUnit && <span className="u">{valUnit}</span>}
        </div>
      )}
      {right || <MIcon name="chevR" size={18} color="var(--z-400)"/>}
    </div>
  </div>
);

// ─── Bottom sheet (passive: not modal) ─────────────────────────
const MSheet = ({ title, children, onClose }) => (
  <div style={{
    position:'absolute', inset: 0, zIndex: 100,
    background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
  }} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} style={{
      background: 'var(--card)', borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: '14px 0 24px', maxHeight: '70%', display:'flex', flexDirection:'column',
    }}>
      <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--z-300)', margin: '0 auto 10px' }}/>
      {title && <div style={{ padding: '0 18px 12px', fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</div>}
      <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
    </div>
  </div>
);

Object.assign(window, {
  MIcon, MChip, MBtn, MAvatar, MHeader, MBottomTab, M_TABS,
  MCard, MListRow, MSheet,
});
