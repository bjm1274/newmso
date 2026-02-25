'use client';
import { useState } from 'react';

const mockWikiData = [
    {
        id: 'hr', name: '인사/총무 가이드', isFolder: true, isOpen: true, children: [
            { id: 'hr-1', name: '휴가 및 연차 규정', content: '# 연차 사용 가이드\n잔여 연차는 [마이페이지]에서 확인 가능하며, 반차/반반차 사용이 가능합니다.\n\n### 지각 및 결근 시\n- 지각 3회 누적 시 연차 1일 차감\n- 무단 결근 시 해당 일 급여 전액 차감 및 인사 위원회 회부' },
            { id: 'hr-2', name: '경조사 지원 기준', content: '# 경조사 지원\n결혼, 출산, 조의 등 경조사 발생 시 인사팀에 청첩장/부고장 사본을 제출해주세요.\n- 본인 결혼: 화환 및 축하금 100만원, 유급휴가 5일\n- 직계 가족 조의: 조화 및 조의금 50만원, 유급휴가 3일' }
        ]
    },
    {
        id: 'it', name: 'IT 인프라 / 헬프데스크', isFolder: true, isOpen: false, children: [
            { id: 'it-1', name: '와이파이 및 사내망 접속', content: '# Wi-Fi 접속 안내\n업무용 네트워크 대역은 사내 보안 규정에 따라 암호화됩니다.\n\n`SSID: SY_Office_5G`\n`Password: sy123456!@#`' },
            { id: 'it-2', name: '보안 프로그램 설치 가이드', content: '# 보안 프로그램 안내\n사무실 외부에서 ERP/EMR 접속 시 VPN을 반드시 켜야 합니다.' }
        ]
    },
    {
        id: 'onboard', name: '신규 입사자 온보딩', isFolder: true, isOpen: false, children: [
            { id: 'ob-1', name: 'Day 1 가이드', content: '# 환영합니다!\n첫 출근 시 부서장과 티타임을 가지고 웰컴 키트를 수령하세요.' }
        ]
    }
];

export default function WikiDashboard() {
    const [nodes, setNodes] = useState(mockWikiData);
    const [selectedDoc, setSelectedDoc] = useState<any>(mockWikiData[0].children[0]);
    const [searchTerm, setSearchTerm] = useState('');

    const toggleFolder = (folderId: string) => {
        setNodes(prev => prev.map(node => node.id === folderId ? { ...node, isOpen: !node.isOpen } : node));
    };

    return (
        <div className="flex h-[calc(100vh-140px)] animate-in fade-in duration-500 bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm m-4 md:m-8">
            {/* Sidebar Tree (노션 스타일) */}
            <div className="w-64 md:w-80 border-r border-slate-100 bg-slate-50/50 flex flex-col shrink-0">
                <div className="p-6 border-b border-slate-100">
                    <h3 className="text-sm font-black text-slate-800 mb-4 tracking-tight">📖 SY Knowledge Base</h3>
                    <input
                        type="text"
                        placeholder="위키 문서 검색..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full bg-white p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary/20 text-xs font-bold"
                    />
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                    {nodes.map(folder => (
                        <div key={folder.id}>
                            <button
                                onClick={() => toggleFolder(folder.id)}
                                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100/80 transition-colors text-left group"
                            >
                                <span className={`text-[10px] text-slate-400 font-mono transition-transform ${folder.isOpen ? 'rotate-90' : ''}`}>▶</span>
                                <span className="text-[13px] font-black text-slate-700 tracking-tight">{folder.name}</span>
                            </button>
                            {folder.isOpen && (
                                <div className="ml-4 mt-1 pl-2 border-l border-slate-200 space-y-1">
                                    {folder.children.map(doc => (
                                        <button
                                            key={doc.id}
                                            onClick={() => setSelectedDoc(doc)}
                                            className={`w-full text-left p-2 rounded-lg text-xs font-bold transition-all ${selectedDoc?.id === doc.id ? 'bg-primary/10 text-primary' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}
                                        >
                                            📄 {doc.name}
                                        </button>
                                    ))}
                                    <button className="w-full text-left p-2 rounded-lg text-[11px] font-black text-slate-400 hover:bg-slate-100 hover:text-primary transition-all">
                                        + 새 문서 추가
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Editor / Reader Area */}
            <div className="flex-1 overflow-y-auto bg-white relative">
                <header className="absolute top-0 w-full h-14 bg-white/80 backdrop-blur-sm border-b border-slate-100/50 flex items-center justify-between px-8 z-10 sticky">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 tracking-widest uppercase">
                        <span>Knowledge Base</span>
                        <span>/</span>
                        <span className="text-primary">{selectedDoc?.name || '문서 선택'}</span>
                    </div>
                    <div className="flex gap-2">
                        <button className="px-4 py-2 text-[10px] font-black tracking-widest bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-colors">공유하기</button>
                        <button className="px-4 py-2 text-[10px] font-black tracking-widest bg-primary text-white rounded-lg shadow-sm hover:scale-105 transition-transform">문서 편집기능 (Editor)</button>
                    </div>
                </header>

                <div className="p-10 md:p-16 max-w-4xl mx-auto space-y-8 pb-32">
                    {selectedDoc ? (
                        <>
                            <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight leading-tight mb-8">
                                {selectedDoc.name}
                            </h1>
                            {/* Dummy markdown renderer approach handling new lines */}
                            <div className="space-y-4 text-slate-700 font-medium leading-relaxed">
                                {selectedDoc.content.split('\n').map((line: string, i: number) => {
                                    if (line.startsWith('# ')) return <h1 key={i} className="text-2xl font-black text-slate-800 mt-8 mb-4">{line.replace('# ', '')}</h1>;
                                    if (line.startsWith('### ')) return <h3 key={i} className="text-lg font-black text-slate-800 mt-6 mb-3">{line.replace('### ', '')}</h3>;
                                    if (line.startsWith('- ')) return <li key={i} className="ml-4 font-bold">{line.replace('- ', '')}</li>;
                                    if (line.includes('`')) {
                                        const parts = line.split('`');
                                        return (
                                            <p key={i}>
                                                {parts.map((p, idx) => idx % 2 === 1 ? <code key={idx} className="bg-slate-100 text-primary px-2 py-1 rounded-md text-[13px] font-black font-mono">{p}</code> : p)}
                                            </p>
                                        );
                                    }
                                    if (line === '') return <br key={i} />;
                                    return <p key={i}>{line}</p>;
                                })}
                            </div>

                            <div className="mt-20 pt-10 border-t border-slate-100 flex items-center justify-between">
                                <p className="text-[10px] font-black text-slate-400">마지막 수정: 오늘 오전 10:15</p>
                                <div className="flex items-center gap-2">
                                    <p className="text-[10px] font-black text-slate-400">도움이 되셨나요?</p>
                                    <button className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-primary/5 hover:border-primary/20 transition-colors">👍</button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-40">
                            <span className="text-4xl opacity-20 block mb-4">📖</span>
                            <p className="text-[13px] font-black text-slate-400 uppercase tracking-widest">좌측 트리에서 문서를 선택해주세요</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
