'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function PopupManager() {
  const [popups, setPopups] = useState<any[]>([]);
  const [inputType, setInputType] = useState<'link' | 'file'>('link'); 
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [newPopup, setNewPopup] = useState({ 
    title: '', media_url: '', media_type: 'image', width: 400, height: 500 
  });

  const loadPopups = async () => {
    const { data } = await supabase.from('popups').select('*').order('created_at', { ascending: false });
    setPopups(data || []);
  };

  useEffect(() => { loadPopups(); }, []);

  const getPreviewUrl = () => {
    if (inputType === 'file' && selectedFile) return URL.createObjectURL(selectedFile);
    return newPopup.media_url;
  };

  const handleAddPopup = async () => {
    if (!newPopup.title) return alert("팝업 제목을 입력해주세요.");
    let finalUrl = newPopup.media_url;

    if (inputType === 'file' && selectedFile) {
        const fileName = `${Date.now()}_${selectedFile.name}`;
        const { error } = await supabase.storage.from('popups').upload(fileName, selectedFile);
        if (error) return alert("파일 업로드에 실패했습니다.");
        const { data: urlData } = supabase.storage.from('popups').getPublicUrl(fileName);
        finalUrl = urlData.publicUrl;
    }

    const { error } = await supabase.from('popups').insert([{ ...newPopup, media_url: finalUrl, is_active: true }]);
    if (!error) {
        alert("새 팝업이 생성되었습니다.");
        loadPopups();
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div className="bg-white p-10 border border-gray-100 shadow-sm space-y-8">
        <div className="flex justify-between items-center border-b border-gray-50 pb-6">
          <h3 className="font-black text-xl text-gray-800 tracking-tighter">홈페이지 팝업 설정</h3>
          <div className="flex bg-gray-100 p-1 border border-gray-200">
            <button onClick={() => setInputType('link')} className={`px-5 py-2 text-[10px] font-black transition-all ${inputType==='link' ? 'bg-white shadow text-black' : 'text-gray-400'}`}>🔗 링크 입력</button>
            <button onClick={() => setInputType('file')} className={`px-5 py-2 text-[10px] font-black transition-all ${inputType==='file' ? 'bg-white shadow text-black' : 'text-gray-400'}`}>📁 파일 업로드</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">팝업 제목</label>
            <input className="w-full p-4 bg-gray-50 border border-gray-100 text-xs font-bold outline-none" placeholder="예: 박철홍정형외과 설날 진료 안내" value={newPopup.title} onChange={e=>setNewPopup({...newPopup, title:e.target.value})} />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">미디어 타입</label>
            <select className="w-full p-4 bg-gray-50 border border-gray-100 text-xs font-bold outline-none" value={newPopup.media_type} onChange={e=>setNewPopup({...newPopup, media_type:e.target.value})}>
                <option value="image">이미지 (JPG, PNG)</option>
                <option value="video">동영상 (MP4)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <button onClick={() => setShowPreview(true)} className="w-full py-5 bg-orange-50 text-orange-600 border border-orange-100 text-[11px] font-black shadow-sm uppercase tracking-widest">👁️ 홈페이지 실시간 시뮬레이션</button>
          <button onClick={handleAddPopup} className="w-full py-5 bg-gray-900 text-white text-[11px] font-black shadow-xl uppercase tracking-widest">팝업 즉시 생성</button>
        </div>
      </div>

      {/* 미리보기 모달 */}
      {showPreview && (
        <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-8 backdrop-blur-sm" onClick={() => setShowPreview(false)}>
            <div className="w-full h-full max-w-6xl bg-white border border-gray-900 shadow-2xl relative flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="bg-gray-100 p-2 border-b flex justify-between items-center px-4">
                    <div className="flex gap-1.5"><span className="w-3 h-3 bg-red-400"/><span className="w-3 h-3 bg-yellow-400"/><span className="w-3 h-3 bg-green-400"/></div>
                    <div className="text-[10px] font-bold text-gray-400 tracking-widest">사이트 미리보기: https://www.pchos.kr</div>
                    <button onClick={() => setShowPreview(false)} className="px-5 py-1.5 bg-black text-white text-[10px] font-black">닫기 X</button>
                </div>
                <div className="flex-1 relative bg-gray-50 overflow-hidden">
                    <iframe src="https://www.pchos.kr" className="w-full h-full border-0 pointer-events-none opacity-40" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white shadow-2xl border border-gray-900"
                         style={{ width: `${newPopup.width}px`, height: `${newPopup.height}px` }}>
                        <img src={getPreviewUrl()} alt="Popup" className="w-full h-full object-fill" />
                        <div className="absolute bottom-0 w-full h-8 bg-black text-white flex justify-between items-center px-3 text-[10px] font-black">
                            <span>오늘 하루 열지 않기</span><span>닫기 X</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}