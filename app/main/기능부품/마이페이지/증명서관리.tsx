'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function MyCertificates({ user }: any) {
  const [approvedDocs, setApprovedDocs] = useState<any[]>([]);
  const [issuedCerts, setIssuedCerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const approvalRes = await supabase.from('approvals').select('*').eq('sender_id', user.id).eq('status', '승인').eq('type', '양식신청').order('created_at', { ascending: false });
      setApprovedDocs(approvalRes.data || []);
      const certRes = await supabase.from('certificate_issuances').select('*, staff_members(name)').eq('staff_id', user.id).order('issued_at', { ascending: false }).limit(20);
      setIssuedCerts(certRes.error ? [] : (certRes.data || []));
      setLoading(false);
    };

    fetchData();
  }, [user?.id]);

  // 간단한 인쇄 기능 (브라우저 기본 인쇄창 호출)
  const handlePrint = (doc: any) => {
    const printWindow = window.open('', '', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>${doc.title}</title>
            <style>
              body { font-family: sans-serif; padding: 40px; }
              h1 { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; }
              .content { margin-top: 40px; white-space: pre-wrap; line-height: 1.6; }
              .footer { margin-top: 100px; text-align: center; font-weight: bold; }
            </style>
          </head>
          <body>
            <h1>${doc.title}</h1>
            <div class="content">${doc.content}</div>
            <div class="footer">
              <p>위와 같이 증명(승인)합니다.</p>
              <p>${new Date().toLocaleDateString()}</p>
              <p>박철홍정형외과 대표원장 (인)</p>
            </div>
            <script>window.print();</script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 border border-gray-100 shadow-sm rounded-[2rem]">
        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6">발급된 증명서</h3>
        
        {loading ? (
          <div className="text-center py-10">로딩 중...</div>
        ) : issuedCerts.length === 0 && approvedDocs.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            <span className="text-4xl mb-2 block">📂</span>
            <p className="font-bold text-gray-400 text-sm">발급된 증명서가 없습니다.</p>
            <p className="text-xs text-gray-300 mt-1">전자결재 양식신청 후 승인되면, 또는 인사관리 증명서에서 발급하세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {issuedCerts.map((c) => (
              <div key={c.id} className="p-6 border border-gray-100 rounded-2xl hover:shadow-md transition-all flex flex-col justify-between bg-white group">
                <div>
                  <span className="px-2 py-1 bg-blue-100 text-blue-600 rounded text-[10px] font-black">발급완료</span>
                  <h4 className="font-black text-gray-800 text-lg mt-2 mb-1">{c.cert_type}</h4>
                  <p className="text-xs text-gray-500">{c.serial_no} · {new Date(c.issued_at).toLocaleDateString()}</p>
                </div>
                <button onClick={() => handlePrint({ title: c.cert_type, content: `${c.staff_members?.name || ''} ${c.cert_type}\n발급번호: ${c.serial_no}\n용도: ${c.purpose || ''}` })} className="mt-4 w-full py-3 bg-gray-900 text-white rounded-xl text-xs font-black">🖨️ 인쇄</button>
              </div>
            ))}
            {approvedDocs.filter((d: any) => d.meta_data?.target_staff !== user?.id).map((doc) => (
              <div key={doc.id} className="p-6 border border-gray-100 rounded-2xl hover:shadow-md transition-all flex flex-col justify-between bg-white group">
                <div>
                  <span className="px-2 py-1 bg-green-100 text-green-600 rounded text-[10px] font-black">승인완료</span>
                  <h4 className="font-black text-gray-800 text-lg mt-2 mb-1 truncate">{doc.title}</h4>
                  <p className="text-xs text-gray-500 line-clamp-2">{doc.content}</p>
                </div>
                <button onClick={() => handlePrint(doc)} className="mt-4 w-full py-3 bg-gray-900 text-white rounded-xl text-xs font-black">🖨️ 인쇄</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}