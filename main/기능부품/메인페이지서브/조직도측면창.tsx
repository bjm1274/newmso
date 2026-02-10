'use client';

export default function Sidebar({ user, mainMenu, onMenuChange }: any) {
  const menus = [
    { id: '조직도', icon: '👤', label: '조직도' },
    { id: '채팅', icon: '✉️', label: '채팅' },
    { id: '게시판', icon: '📋', label: '게시판' },
    { id: '할일', icon: '✅', label: '할일' },
    { id: '전자결재', icon: '✍️', label: '전자결재' },
    { id: '인사관리', icon: '👥', label: '인사관리' },
    { id: '재고관리', icon: '📦', label: '재고관리' }
  ];

  return (
    <aside className="w-20 bg-[#F8F9FA] border-r border-gray-100 flex flex-col items-center py-8 space-y-4">
      <div className="w-14 h-14 border border-gray-100 bg-white mb-6 flex items-center justify-center">
        <img src="/logo.png" alt="로고" className="p-2 object-contain" />
      </div>
      {menus.map(m => (
        <button key={m.id} onClick={() => onMenuChange(m.id)} 
          className={`w-14 h-14 flex items-center justify-center border transition-all ${
            mainMenu === m.id ? 'bg-blue-600 text-white border-blue-600 shadow-inner' : 'text-gray-300 border-transparent hover:bg-gray-50'
          }`}
        >
          <span className="text-xl">{m.icon}</span>
        </button>
      ))}
    </aside>
  );
}