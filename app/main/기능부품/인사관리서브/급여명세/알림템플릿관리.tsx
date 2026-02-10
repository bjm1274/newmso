'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function NotificationTemplatesPanel({ companyName }: { companyName?: string }) {
  const [list, setList] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('notification_templates').select('*').eq('company_name', companyName || '전체').order('template_type');
      setList(data || []);
    })();
  }, [companyName]);

  if (list.length === 0) {
    return (
      <div className="border border-gray-200 p-6 bg-white rounded-[1.75rem]">
        <h3 className="text-[11px] font-black text-gray-600 uppercase tracking-widest mb-4">알림톡/메일 템플릿</h3>
        <p className="text-xs text-gray-500">등록된 템플릿이 없습니다. tax_free_settings 마이그레이션 후 notification_templates 테이블이 생성됩니다.</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 p-6 bg-white rounded-[1.75rem]">
      <h3 className="text-[11px] font-black text-gray-600 uppercase tracking-widest mb-4">알림톡/메일 템플릿</h3>
      <div className="space-y-3">
        {list.map((t) => (
          <div key={t.id} className="p-4 bg-gray-50 rounded-xl">
            <p className="text-xs font-black text-gray-800">{t.template_type} - {t.name}</p>
            <p className="text-[11px] text-gray-600 mt-1 truncate">{t.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
