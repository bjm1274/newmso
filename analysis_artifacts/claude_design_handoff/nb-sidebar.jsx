// MSO Redesigned Sidebar + Submenu

const MAIN_MENUS = [
  { id: '내정보',   icon: 'user',      label: '내정보' },
  { id: '추가기능', icon: 'plus',      label: '추가기능' },
  { id: '채팅',    icon: 'chat',      label: '채팅',    badge: 3 },
  { id: '게시판',  icon: 'board',     label: '게시판' },
  { id: '전자결재', icon: 'approval',  label: '결재' },
  { id: '인사관리', icon: 'hr',        label: '인사' },
  { id: '재고관리', icon: 'inventory', label: '재고' },
  { id: '관리자',  icon: 'admin',     label: '관리자' },
];

const SUB_MENUS = {
  재고관리: [
    { id: '현황',     label: '현황',        icon: 'barChart',  group: '조회' },
    { id: '이력',     label: '이력',        icon: 'clock',     group: '조회' },
    { id: '수요예측', label: '수요예측',    icon: 'trending',  group: '조회' },
    { id: '내부서재고',label: '내 부서 재고', icon: 'package',   group: '조회' },
    { id: '등록',     label: '등록',        icon: 'edit',      group: '입출고' },
    { id: '스캔',     label: '스캔',        icon: 'search',    group: '입출고' },
    { id: '재고실사', label: '재고실사',    icon: 'check',     group: '입출고' },
    { id: '이관',     label: '이관',        icon: 'refresh',   group: '입출고' },
    { id: '발주',     label: '발주',        icon: 'package',   group: '발주문서' },
    { id: '납품확인서',label: '납품확인서', icon: 'fileText',  group: '발주문서' },
    { id: 'UDI',      label: 'UDI',         icon: 'shield',    group: '발주문서' },
    { id: '자산',     label: '자산',        icon: 'star',      group: '설정' },
    { id: '비품대여설정',label: '비품대여', icon: 'settings',  group: '설정' },
    { id: '거래처',   label: '거래처',      icon: 'users',     group: '설정' },
    { id: '카테고리', label: '카테고리',    icon: 'filter',    group: '설정' },
    { id: '월마감',   label: '월마감',      icon: 'lock',      group: '설정' },
  ],
  게시판: [
    { id: '공지사항',  label: '공지사항',  icon: 'bell' },
    { id: '자유게시판', label: '자유게시판', icon: 'chat' },
    { id: '경조사',    label: '경조사',    icon: 'heart' },
    { id: '수술일정',  label: '수술일정',  icon: 'calendar' },
    { id: 'MRI일정',   label: 'MRI일정',   icon: 'pieChart' },
    { id: '업무가이드', label: '업무공유', icon: 'fileText' },
  ],
  전자결재: [
    { id: '기안함',     label: '기안함',     icon: 'edit' },
    { id: '결재함',     label: '결재함',     icon: 'check' },
    { id: '참조 문서함', label: '참조 문서함', icon: 'fileText' },
    { id: '작성하기',   label: '작성하기',   icon: 'approval' },
  ],
  인사관리: [
    { id: '구성원',      label: '구성원',      icon: 'users',    group: '인력관리' },
    { id: '인사변동',    label: '인사변동',    icon: 'refresh',  group: '인력관리' },
    { id: '입퇴사·교육센터', label: '입퇴사·교육', icon: 'calendar', group: '인력관리' },
    { id: '근태',        label: '근태',        icon: 'clock',    group: '근태/급여' },
    { id: '교대근무',    label: '교대근무',    icon: 'refresh',  group: '근태/급여' },
    { id: '연차/휴가',   label: '연차/휴가',   icon: 'calendar', group: '근태/급여' },
    { id: '급여',        label: '급여',        icon: 'dollarSign', group: '근태/급여' },
    { id: '경조사',      label: '경조사',      icon: 'heart',    group: '복무/복지' },
    { id: '자격·안전센터', label: '자격·안전', icon: 'shield',   group: '복무/복지' },
    { id: '계약',        label: '계약',        icon: 'fileText', group: '문서/기타' },
    { id: '문서센터',    label: '문서센터',    icon: 'database', group: '문서/기타' },
    { id: '캘린더',      label: '캘린더',      icon: 'calendar', group: '문서/기타' },
  ],
  관리자: [
    { id: '경영분석',   label: '경영 분석',     icon: 'trending',  group: '경영 분석' },
    { id: '회사관리',   label: '회사 / 조직',   icon: 'home',      group: '조직 / 권한' },
    { id: '직원권한',   label: '직원 권한',     icon: 'lock',      group: '조직 / 권한' },
    { id: '운영설정',   label: '운영 설정',     icon: 'settings',  group: '시스템 설정' },
    { id: '문서양식',   label: '문서 양식',     icon: 'fileText',  group: '시스템 설정' },
    { id: '엑셀등록',   label: '엑셀 일괄 등록', icon: 'upload',   group: '데이터 관리' },
    { id: '데이터백업', label: '백업 / 복원',   icon: 'database',  group: '데이터 관리' },
    { id: '데이터초기화',label: '데이터 초기화', icon: 'trash',    group: '데이터 관리' },
    { id: '감사센터',   label: '감사 센터',     icon: 'eye',       group: '감사 센터' },
    { id: '시스템마스터센터', label: '시스템 마스터', icon: 'shield', group: '시스템 마스터' },
  ],
};

const GROUP_ICONS = {
  '조회': 'eye', '입출고': 'package', '발주문서': 'fileText', '설정': 'settings',
  '인력관리': 'users', '근태/급여': 'clock', '복무/복지': 'heart', '문서/기타': 'fileText',
  '경영 분석': 'trending', '조직 / 권한': 'lock', '시스템 설정': 'settings',
  '데이터 관리': 'database', '감사 센터': 'eye', '시스템 마스터': 'shield',
};

// ── Brand Logo ──────────────────────────────────────
const BrandLogo = ({ accent }) => (
  <div style={{
    width: 36, height: 36, borderRadius: 10,
    background: accent,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: `0 2px 8px ${accent}44`,
    flexShrink: 0,
  }}>
    <span style={{ color: '#fff', fontWeight: 800, fontSize: 13, letterSpacing: '-0.04em', fontFamily: 'inherit' }}>SY</span>
  </div>
);

// ── Desktop Sidebar ─────────────────────────────────
const DesktopSidebar = ({ mainMenu, onMenuChange, dark, accent, chatBadge = 3 }) => {
  const bg = dark ? '#111113' : '#ffffff';
  const border = dark ? '#27272a' : '#e9e9ec';
  const mutedFg = dark ? '#71717a' : '#9ca3af';
  const fg = dark ? '#f4f4f5' : '#18181b';
  const muted = dark ? '#18181b' : '#f4f4f5';
  const activeBg = accent;

  return (
    <aside style={{
      width: 72, minWidth: 72, height: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', background: bg, borderRight: `1px solid ${border}`,
      padding: '14px 0', gap: 0, position: 'sticky', top: 0, zIndex: 240, flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 18, padding: '0 10px', width: '100%', display: 'flex', justifyContent: 'center' }}>
        <BrandLogo accent={accent} />
      </div>

      {/* Notification Bell */}
      <button style={{
        width: 44, height: 44, borderRadius: 10, border: 'none', background: 'transparent',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: mutedFg, marginBottom: 8, position: 'relative',
        transition: 'background 0.15s',
      }}
        onMouseEnter={e => e.currentTarget.style.background = muted}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <Icon name="bell" size={18} />
        <span style={{
          position: 'absolute', top: 6, right: 6, width: 8, height: 8,
          borderRadius: '50%', background: '#ef4444', border: `2px solid ${bg}`,
        }} />
      </button>

      <div style={{ width: '100%', height: 1, background: border, margin: '4px 0 12px' }} />

      {/* Menu items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%', padding: '0 8px', flex: 1, overflowY: 'auto' }}>
        {MAIN_MENUS.map(menu => {
          const isActive = mainMenu === menu.id;
          return (
            <button key={menu.id} onClick={() => onMenuChange(menu.id)} style={{
              width: '100%', border: 'none', borderRadius: 10,
              padding: '8px 4px 6px',
              background: isActive ? activeBg : 'transparent',
              color: isActive ? '#fff' : mutedFg,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              cursor: 'pointer', transition: 'all 0.15s', position: 'relative',
              boxShadow: isActive ? `0 2px 8px ${accent}33` : 'none',
            }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = muted; e.currentTarget.style.color = fg; } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = mutedFg; } }}
            >
              <span style={{ position: 'relative', display: 'flex' }}>
                <Icon name={menu.icon} size={18} strokeWidth={isActive ? 2 : 1.6} />
                {menu.id === '채팅' && chatBadge > 0 && (
                  <span style={{
                    position: 'absolute', top: -5, right: -7,
                    minWidth: 16, height: 16, borderRadius: 8,
                    background: '#ef4444', color: '#fff',
                    fontSize: 9, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 3px', border: `2px solid ${bg}`,
                  }}>{chatBadge > 99 ? '99+' : chatBadge}</span>
                )}
              </span>
              <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                {menu.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bottom: Theme + User */}
      <div style={{ width: '100%', padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
        <div style={{ height: 1, background: border, marginBottom: 6 }} />
        {/* User Avatar */}
        <button style={{
          width: '100%', border: 'none', borderRadius: 10,
          padding: '8px 4px 6px',
          background: 'transparent', color: mutedFg,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          cursor: 'pointer',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: `${accent}22`, border: `1.5px solid ${accent}44`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: accent,
          }}>박</div>
        </button>
      </div>
    </aside>
  );
};

// ── Submenu Panel ───────────────────────────────────
const SubmenuPanel = ({ mainMenu, subView, onSubViewChange, dark, accent }) => {
  const subs = SUB_MENUS[mainMenu] || [];
  if (!subs.length) return null;

  const bg = dark ? '#111113' : '#ffffff';
  const border = dark ? '#27272a' : '#e9e9ec';
  const mutedFg = dark ? '#71717a' : '#9ca3af';
  const fg = dark ? '#f4f4f5' : '#18181b';
  const muted = dark ? '#1c1c1f' : '#f4f4f5';
  const groupLabelColor = dark ? '#52525b' : '#a1a1aa';

  // check if grouped
  const hasGroups = subs.some(s => s.group);
  const groups = hasGroups
    ? [...new Set(subs.map(s => s.group).filter(Boolean))]
    : null;

  const renderItem = (sub) => {
    const isActive = subView === sub.id;
    return (
      <button key={sub.id} onClick={() => onSubViewChange(sub.id)} style={{
        width: '100%', border: 'none', borderRadius: 7,
        padding: '7px 10px',
        background: isActive ? accent : 'transparent',
        color: isActive ? '#fff' : mutedFg,
        display: 'flex', alignItems: 'center', gap: 8,
        cursor: 'pointer', transition: 'all 0.12s',
        fontSize: 12, fontWeight: isActive ? 600 : 500,
        textAlign: 'left', letterSpacing: '-0.01em',
      }}
        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = muted; e.currentTarget.style.color = fg; } }}
        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = mutedFg; } }}
      >
        {sub.icon && (
          <Icon name={sub.icon} size={13} strokeWidth={isActive ? 2 : 1.6}
            color={isActive ? '#fff' : mutedFg} />
        )}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.label}</span>
      </button>
    );
  };

  return (
    <aside style={{
      width: 192, minWidth: 192, height: '100dvh',
      display: 'flex', flexDirection: 'column',
      background: bg, borderRight: `1px solid ${border}`,
      overflowY: 'auto', overflowX: 'hidden',
      padding: '14px 8px', gap: 0,
      position: 'sticky', top: 0, flexShrink: 0,
    }} className="no-scrollbar">
      {/* Panel title */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: groupLabelColor,
        letterSpacing: '0.04em', textTransform: 'uppercase',
        padding: '2px 6px 10px', borderBottom: `1px solid ${border}`,
        marginBottom: 8,
      }}>{mainMenu}</div>

      {hasGroups ? groups.map(group => (
        <div key={group} style={{ marginBottom: 4 }}>
          <div style={{
            fontSize: 10, fontWeight: 600, color: groupLabelColor,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            padding: '8px 10px 4px', display: 'flex', alignItems: 'center', gap: 5,
          }}>
            {GROUP_ICONS[group] && <Icon name={GROUP_ICONS[group]} size={10} color={groupLabelColor} />}
            {group}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {subs.filter(s => s.group === group).map(renderItem)}
          </div>
        </div>
      )) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {subs.map(renderItem)}
        </div>
      )}
    </aside>
  );
};

// ── Mobile Bottom Tab Bar ───────────────────────────
const MobileTabBar = ({ mainMenu, onMenuChange, dark, accent, chatBadge = 3 }) => {
  const bg = dark ? '#111113' : '#ffffff';
  const border = dark ? '#27272a' : '#e9e9ec';
  const mutedFg = dark ? '#71717a' : '#9ca3af';

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: bg, borderTop: `1px solid ${border}`,
      padding: '6px 4px 8px', zIndex: 100,
      display: 'flex', alignItems: 'stretch',
    }}>
      {MAIN_MENUS.map(menu => {
        const isActive = mainMenu === menu.id;
        return (
          <button key={menu.id} onClick={() => onMenuChange(menu.id)} style={{
            flex: 1, border: 'none', background: 'transparent',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '6px 2px', cursor: 'pointer', minHeight: 52,
            color: isActive ? accent : mutedFg,
            position: 'relative',
          }}>
            <span style={{ position: 'relative' }}>
              <Icon name={menu.icon} size={20} strokeWidth={isActive ? 2 : 1.5} />
              {menu.id === '채팅' && chatBadge > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -6,
                  minWidth: 14, height: 14, borderRadius: 7,
                  background: '#ef4444', color: '#fff',
                  fontSize: 8, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 2px', border: `1.5px solid ${bg}`,
                }}>{chatBadge}</span>
              )}
            </span>
            <span style={{ fontSize: 9.5, fontWeight: isActive ? 700 : 500, whiteSpace: 'nowrap' }}>
              {menu.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};

Object.assign(window, { DesktopSidebar, SubmenuPanel, MobileTabBar, SUB_MENUS, MAIN_MENUS });
