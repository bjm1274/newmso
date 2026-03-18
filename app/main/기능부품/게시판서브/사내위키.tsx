'use client';
import { useState } from 'react';

const mockWikiData: any[] = [];

export default function WikiDashboard() {
    const [nodes, setNodes] = useState(mockWikiData);
    const [selectedDoc, setSelectedDoc] = useState<any>(mockWikiData[0].children[0]);
    const [searchTerm, setSearchTerm] = useState('');

    const toggleFolder = (folderId: string) => {
        setNodes(prev => prev.map(node => node.id === folderId ? { ...node, isOpen: !node.isOpen } : node));
    };

    return (
        <div className="m-4 flex min-h-[calc(100dvh-140px)] flex-col animate-in overflow-hidden rounded-2xl border border-[var(--border)]/60 bg-[var(--card)] shadow-sm fade-in duration-500 md:flex-row">
            {/* Sidebar Tree (노션 스타일) */}
            <div className="flex w-full shrink-0 flex-col border-b border-[var(--border-subtle)] bg-[var(--tab-bg)]/50 md:w-80 md:border-r md:border-b-0">
                <div className="p-4 border-b border-[var(--border-subtle)]">
                    <h3 className="text-sm font-black text-[var(--foreground)] mb-3 tracking-tight">SY Knowledge Base</h3>
                    <input
                        type="text"
                        placeholder="위키 문서 검색..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full bg-[var(--card)] p-2 rounded-[var(--radius-md)] border border-[var(--border)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20 text-xs font-bold"
                    />
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1.5">
                    {nodes.map(folder => (
                        <div key={folder.id}>
                            <button
                                onClick={() => toggleFolder(folder.id)}
                                className="w-full flex items-center gap-2 p-2 rounded-[var(--radius-md)] hover:bg-[var(--tab-bg)]/80 transition-colors text-left group"
                            >
                                <span className={`text-[10px] text-[var(--toss-gray-3)] font-mono transition-transform ${folder.isOpen ? 'rotate-90' : ''}`}>▶</span>
                                <span className="text-[13px] font-black text-[var(--toss-gray-5)] tracking-tight">{folder.name}</span>
                            </button>
                            {folder.isOpen && (
                                <div className="ml-4 mt-1 pl-2 border-l border-[var(--border)] space-y-1">
                                    {folder.children.map((doc: any) => (
                                        <button
                                            key={doc.id}
                                            onClick={() => setSelectedDoc(doc)}
                                            className={`w-full text-left p-2 rounded-[var(--radius-md)] text-xs font-bold transition-all ${selectedDoc?.id === doc.id ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'text-[var(--toss-gray-4)] hover:text-[var(--foreground)] hover:bg-[var(--tab-bg)]'}`}
                                        >
                                            {doc.name}
                                        </button>
                                    ))}
                                    <button className="w-full text-left p-2 rounded-[var(--radius-md)] text-[11px] font-black text-[var(--toss-gray-3)] hover:bg-[var(--tab-bg)] hover:text-[var(--accent)] transition-all">
                                        + 새 문서 추가
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Editor / Reader Area */}
            <div className="relative flex-1 overflow-y-auto bg-[var(--card)]">
                <header className="sticky top-0 z-10 flex min-h-12 w-full flex-col gap-2 border-b border-[var(--border-subtle)]/50 bg-[var(--card)]/80 px-4 py-3 backdrop-blur-sm md:h-12 md:flex-row md:items-center md:justify-between md:px-5 md:py-0">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-[var(--toss-gray-3)] tracking-widest uppercase">
                        <span>Knowledge Base</span>
                        <span>/</span>
                        <span className="text-[var(--accent)]">{selectedDoc?.name || '문서 선택'}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button className="px-3 py-1.5 text-[10px] font-black tracking-widest bg-[var(--tab-bg)] text-[var(--toss-gray-4)] rounded-[var(--radius-md)] hover:bg-[var(--tab-bg)] transition-colors">공유하기</button>
                        <button className="px-3 py-1.5 text-[10px] font-black tracking-widest bg-[var(--accent)] text-white rounded-[var(--radius-md)] shadow-sm hover:opacity-90 transition-opacity">문서 편집기능 (Editor)</button>
                    </div>
                </header>

                <div className="mx-auto max-w-4xl space-y-4 p-4 pb-24 md:p-5">
                    {selectedDoc ? (
                        <>
                            <h1 className="text-3xl md:text-4xl font-black text-[var(--foreground)] tracking-tight leading-tight mb-4">
                                {selectedDoc.name}
                            </h1>
                            {/* Dummy markdown renderer approach handling new lines */}
                            <div className="space-y-4 text-[var(--toss-gray-5)] font-medium leading-relaxed">
                                {selectedDoc.content.split('\n').map((line: string, i: number) => {
                                    if (line.startsWith('# ')) return <h1 key={i} className="text-2xl font-black text-[var(--foreground)] mt-5 mb-4">{line.replace('# ', '')}</h1>;
                                    if (line.startsWith('### ')) return <h3 key={i} className="text-lg font-black text-[var(--foreground)] mt-4 mb-3">{line.replace('### ', '')}</h3>;
                                    if (line.startsWith('- ')) return <li key={i} className="ml-4 font-bold">{line.replace('- ', '')}</li>;
                                    if (line.includes('`')) {
                                        const parts = line.split('`');
                                        return (
                                            <p key={i}>
                                                {parts.map((p, idx) => idx % 2 === 1 ? <code key={idx} className="bg-[var(--tab-bg)] text-[var(--accent)] px-2 py-1 rounded-md text-[13px] font-black font-mono">{p}</code> : p)}
                                            </p>
                                        );
                                    }
                                    if (line === '') return <br key={i} />;
                                    return <p key={i}>{line}</p>;
                                })}
                            </div>

                            <div className="mt-16 pt-8 border-t border-[var(--border-subtle)] flex items-center justify-between">
                                <p className="text-[10px] font-black text-[var(--toss-gray-3)]">마지막 수정: 오늘 오전 10:15</p>
                                <div className="flex items-center gap-2">
                                    <p className="text-[10px] font-black text-[var(--toss-gray-3)]">도움이 되셨나요?</p>
                                    <button className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--tab-bg)] border border-[var(--border)] flex items-center justify-center hover:bg-[var(--accent)]/5 hover:border-[var(--accent)]/20 transition-colors">👍</button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-40">
                            <span className="text-4xl opacity-20 block mb-4">📖</span>
                            <p className="text-[13px] font-black text-[var(--toss-gray-3)] uppercase tracking-widest">좌측 트리에서 문서를 선택해주세요</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
