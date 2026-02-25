'use client';
import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

export default function LicenseTracking({ staffs, selectedCo }: any) {
    const [searchTerm, setSearchTerm] = useState('');

    // 가상의 자격증 데이터 (실제로는 staff_members의 면허/자격 필드나 별도 테이블 연동)
    const mockLicenses = useMemo(() => {
        const list: any[] = [];
        const filtered = selectedCo === '전체' ? staffs : staffs?.filter((s: any) => s.company === selectedCo);

        filtered?.forEach((staff: any) => {
            // 병원/의원 직원일 때 면허증 추가
            if (staff.company?.includes('의원') || staff.company?.includes('외과')) {
                let type = '보건의료인 자격증';
                if (staff.position === '원장' || staff.position === '병원장') type = '의사면허';
                if (staff.position?.includes('간호') || staff.department?.includes('간호')) type = '간호사면허';
                if (staff.position?.includes('물리치료')) type = '물리치료사면허';
                if (staff.position?.includes('방사선')) type = '방사선사면허';

                const isExpired = Math.random() > 0.8; // 20% 확률로 만료 위험
                const expDate = new Date();
                expDate.setDate(expDate.getDate() + (isExpired ? Math.floor(Math.random() * 30) : 100 + Math.floor(Math.random() * 300)));

                list.push({
                    id: staff.id,
                    name: staff.name,
                    department: staff.department,
                    company: staff.company,
                    licenseName: type,
                    licenseNumber: `LC-${Math.floor(Math.random() * -10000000).toString().substring(1)}`,
                    expirationDate: expDate.toISOString().split('T')[0],
                    status: isExpired ? '갱신요망(30일내)' : '정상'
                });
            } else {
                // 일반 기업 직원일 때
                if (Math.random() > 0.5) {
                    const expDate = new Date();
                    expDate.setDate(expDate.getDate() + 200);
                    list.push({
                        id: staff.id,
                        name: staff.name,
                        department: staff.department,
                        company: staff.company,
                        licenseName: '정보처리기사',
                        licenseNumber: `IT-${Math.floor(Math.random() * 100000)}`,
                        expirationDate: expDate.toISOString().split('T')[0],
                        status: '정상'
                    });
                }
            }
        });
        return list;
    }, [staffs, selectedCo]);

    const filtered = mockLicenses.filter(l =>
        l.name.includes(searchTerm) || l.licenseName.includes(searchTerm)
    );

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-5">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h3 className="text-sm font-black text-slate-800">자격 및 면허 갱신 대상 트래커</h3>
                    <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Certification & License Lifecycle</p>
                </div>

                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder="이름/자격명 검색..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="px-4 py-2 bg-white rounded-xl text-xs font-bold border border-slate-200 outline-none focus:ring-2 focus:ring-primary/20 w-48"
                    />
                    <button className="px-4 py-2 bg-white text-primary text-xs font-black rounded-xl border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors">
                        엑셀 다운로드
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">총 등록 자격증</p>
                        <p className="text-2xl font-black text-slate-800">{mockLicenses.length}건</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-xl">📜</div>
                </div>
                <div className="bg-danger/5 p-6 rounded-2xl border border-danger/10 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black text-danger/60 uppercase tracking-widest mb-1">갱신 임박 (30일 이내)</p>
                        <p className="text-2xl font-black text-danger">{mockLicenses.filter(l => l.status.includes('갱신요망')).length}명</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center text-xl">⚠️</div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">정상 유지중</p>
                        <p className="text-2xl font-black text-slate-800">{mockLicenses.filter(l => l.status === '정상').length}건</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-xl">✅</div>
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200/60">
                        <tr>
                            <th className="p-4 text-[11px] font-black text-slate-500 uppercase tracking-widest">직원 정보</th>
                            <th className="p-4 text-[11px] font-black text-slate-500 uppercase tracking-widest">자격/면허명</th>
                            <th className="p-4 text-[11px] font-black text-slate-500 uppercase tracking-widest">자격 번호</th>
                            <th className="p-4 text-[11px] font-black text-slate-500 uppercase tracking-widest">만료(갱신) 예정일</th>
                            <th className="p-4 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">상태</th>
                            <th className="p-4 text-[11px] font-black text-slate-500 uppercase tracking-widest text-right">관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((item, idx) => (
                            <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                                <td className="p-4">
                                    <p className="text-xs font-black text-slate-800">{item.name}</p>
                                    <p className="text-[10px] font-bold text-slate-400">{item.company} | {item.department}</p>
                                </td>
                                <td className="p-4 text-xs font-bold text-slate-700">{item.licenseName}</td>
                                <td className="p-4 text-[11px] font-mono text-slate-500 font-bold">{item.licenseNumber}</td>
                                <td className="p-4 text-xs font-bold text-slate-700">{item.expirationDate}</td>
                                <td className="p-4 text-center">
                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest ${item.status.includes('정상') ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger animate-pulse'
                                        }`}>
                                        {item.status}
                                    </span>
                                </td>
                                <td className="p-4 text-right">
                                    <button className="text-[11px] font-black text-primary hover:underline transition-all">사본 보기</button>
                                    {item.status.includes('갱신') && (
                                        <button className="ml-3 text-[11px] font-black text-white bg-primary px-3 py-1.5 rounded-lg shadow-sm hover:scale-105 active:scale-95 transition-all">알림톡</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={6} className="p-10 text-center text-xs font-bold text-slate-400">데이터가 없습니다.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
