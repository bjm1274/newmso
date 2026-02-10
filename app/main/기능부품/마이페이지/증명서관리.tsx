'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function MyCertificates({ user }: any) {
  const [approvedDocs, setApprovedDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchApprovedDocs = async () => {
      // 전자결재(approvals) 테이블에서 '내가 보낸 것' 중 '승인'된 것만 가져옴
      const { data } = await supabase
        .from('approvals')
        .select('*')
        .eq('sender_id', user.id)
        .eq('status', '승인') 
        .order('created_at', { ascending: false });

      if (data) setApprovedDocs(data);
      setLoading(false);
    };

    fetchApprovedDocs();
  }, [user]);

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
        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6">발급 가능 문서 (승인 완료)</h3>
        
        {loading ? (
          <div className="text-center py-10">로딩 중...</div>
        ) : approvedDocs.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            <span className="text-4xl mb-2 block">📂</span>
            <p className="font-bold text-gray-400 text-sm">승인된 결재 문서가 없습니다.</p>
            <p className="text-xs text-gray-300 mt-1">전자결재에서 승인이 완료되면 이곳에 자동 생성됩니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {approvedDocs.map((doc) => (
              <div key={doc.id} className="p-6 border border-gray-100 rounded-2xl hover:shadow-md transition-all flex flex-col justify-between bg-white group">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="px-2 py-1 bg-green-100 text-green-600 rounded text-[10px] font-black">승인완료</span>
                    <span className="text-[10px] text-gray-400">{new Date(doc.created_at).toLocaleDateString()}</span>
                  </div>
                  <h4 className="font-black text-gray-800 text-lg mb-2 truncate">{doc.title}</h4>
                  <p className="text-xs text-gray-500 line-clamp-2">{doc.content}</p>
                </div>
                
                <button 
                  onClick={() => handlePrint(doc)}
                  className="mt-6 w-full py-3 bg-gray-900 text-white rounded-xl text-xs font-black opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0"
                >
                  🖨️ 증명서 발급/인쇄
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}