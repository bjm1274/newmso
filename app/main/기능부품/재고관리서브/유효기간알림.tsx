'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function ExpirationAlert() {
  const [expiringItems, setExpiringItems] = useState<any[]>([]);
  const [expiredItems, setExpiredItems] = useState<any[]>([]);
  const [alertsSent, setAlertsSent] = useState(0);
  const [lastCheckTime, setLastCheckTime] = useState<string | null>(null);

  useEffect(() => {
    checkExpirationStatus();
    // 매일 자동 확인
    const interval = setInterval(checkExpirationStatus, 24 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const checkExpirationStatus = async () => {
    const today = new Date();
    const sixMonthsLater = new Date(today.getTime() + 6 * 30 * 24 * 60 * 60 * 1000);

    // 유효기간 6개월 미만 제품
    const { data: expiring } = await supabase
      .from('inventory')
      .select('*')
      .lte('expiration_date', sixMonthsLater.toISOString().split('T')[0])
      .gte('expiration_date', today.toISOString().split('T')[0]);

    // 유효기간 만료 제품
    const { data: expired } = await supabase
      .from('inventory')
      .select('*')
      .lt('expiration_date', today.toISOString().split('T')[0]);

    setExpiringItems(expiring || []);
    setExpiredItems(expired || []);
    setLastCheckTime(new Date().toLocaleString('ko-KR'));

    // 행정팀에 알림 발송
    if ((expiring?.length || 0) > 0 || (expired?.length || 0) > 0) {
      sendAdminNotification(expiring || [], expired || []);
    }
  };

  const sendAdminNotification = async (expiring: any[], expired: any[]) => {
    const adminUsers = await supabase
      .from('staffs')
      .select('*')
      .eq('department', '행정팀');

    if (adminUsers.data) {
      const notifications = adminUsers.data.map((admin: any) => ({
        user_id: admin.id,
        type: 'expiration_alert',
        title: `⚠️ 유효기간 임박 제품 ${expiring.length}개, 만료 제품 ${expired.length}개`,
        body: `유효기간 6개월 미만: ${expiring.length}개 | 만료됨: ${expired.length}개`,
        is_read: false,
        created_at: new Date().toISOString(),
      }));

      await supabase.from('notifications').insert(notifications);
      setAlertsSent(notifications.length);
    }
  };

  const calculateDaysUntilExpiration = (expirationDate: string) => {
    const today = new Date();
    const expDate = new Date(expirationDate);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getAlertColor = (daysLeft: number) => {
    if (daysLeft < 0) return 'bg-red-50 border-red-200';
    if (daysLeft < 30) return 'bg-red-50 border-red-200';
    if (daysLeft < 90) return 'bg-orange-50 border-orange-200';
    return 'bg-yellow-50 border-yellow-200';
  };

  const getAlertBadge = (daysLeft: number) => {
    if (daysLeft < 0) return { text: '만료됨', color: 'bg-red-100 text-red-600' };
    if (daysLeft < 30) return { text: '긴급', color: 'bg-red-100 text-red-600' };
    if (daysLeft < 90) return { text: '주의', color: 'bg-orange-100 text-orange-600' };
    return { text: '경고', color: 'bg-yellow-100 text-yellow-600' };
  };

  const downloadExpirationReport = () => {
    const allItems = [...expiringItems, ...expiredItems];
    const csv = [
      ['품목명', '수량', '유효기간', '남은일수', '상태', '공급처'].join(','),
      ...allItems.map(item => [
        item.name,
        item.stock,
        item.expiration_date,
        calculateDaysUntilExpiration(item.expiration_date),
        calculateDaysUntilExpiration(item.expiration_date) < 0 ? '만료' : '임박',
        item.supplier,
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `유효기간알림_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* 상단 통계 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-yellow-50 p-6 rounded-xl border border-yellow-200">
          <p className="text-xs font-bold text-yellow-600 mb-2">⚠️ 임박 제품</p>
          <p className="text-2xl font-semibold text-yellow-800">{expiringItems.length}개</p>
          <p className="text-xs text-yellow-600 mt-2">6개월 이내 만료</p>
        </div>
        <div className="bg-red-50 p-6 rounded-xl border border-red-200">
          <p className="text-xs font-bold text-red-600 mb-2">🚨 만료됨</p>
          <p className="text-2xl font-semibold text-red-800">{expiredItems.length}개</p>
          <p className="text-xs text-red-600 mt-2">즉시 폐기 필요</p>
        </div>
        <div className="bg-blue-50 p-6 rounded-xl border border-blue-200">
          <p className="text-xs font-bold text-blue-600 mb-2">📢 알림 발송</p>
          <p className="text-2xl font-semibold text-blue-800">{alertsSent}건</p>
          <p className="text-xs text-blue-600 mt-2">행정팀에 알림 완료</p>
        </div>
        <div className="bg-green-50 p-6 rounded-xl border border-green-200">
          <p className="text-xs font-bold text-green-600 mb-2">🔄 마지막 확인</p>
          <p className="text-sm font-semibold text-green-800">{lastCheckTime || '확인 대기중'}</p>
          <p className="text-xs text-green-600 mt-2">24시간마다 자동 확인</p>
        </div>
      </div>

      {/* 유효기간 임박 제품 */}
      <div className="bg-white border border-gray-100 shadow-sm rounded-xl overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-800">⏰ 유효기간 6개월 이내 제품</h3>
          <button
            onClick={downloadExpirationReport}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-semibold hover:bg-gray-700 transition-all"
          >
            📥 보고서 다운로드
          </button>
        </div>

        {expiringItems.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">품목명</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">현재고</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">유효기간</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">남은 일수</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">상태</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">공급처</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">조치</th>
                </tr>
              </thead>
              <tbody>
                {expiringItems.map((item) => {
                  const daysLeft = calculateDaysUntilExpiration(item.expiration_date);
                  const badge = getAlertBadge(daysLeft);
                  return (
                    <tr key={item.id} className={`border-b border-gray-100 ${getAlertColor(daysLeft)}`}>
                      <td className="px-6 py-4 font-bold text-gray-800">{item.name}</td>
                      <td className="px-6 py-4 text-center font-bold text-gray-800">{item.stock}개</td>
                      <td className="px-6 py-4 text-center font-bold text-gray-800">
                        {new Date(item.expiration_date).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-6 py-4 text-center font-semibold text-red-600">
                        {daysLeft < 0 ? '만료' : `${daysLeft}일`}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badge.color}`}>
                          {badge.text}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-left text-gray-600">{item.supplier}</td>
                      <td className="px-6 py-4 text-center">
                        <button className="px-3 py-1 bg-red-100 text-red-600 rounded text-xs font-semibold hover:bg-red-200">
                          폐기
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <p className="text-gray-500 font-bold">✓ 유효기간 6개월 이내 제품이 없습니다.</p>
          </div>
        )}
      </div>

      {/* 만료된 제품 */}
      {expiredItems.length > 0 && (
        <div className="bg-white border border-red-200 shadow-sm rounded-xl overflow-hidden">
          <div className="p-6 border-b border-red-200 bg-red-50">
            <h3 className="text-lg font-semibold text-red-800">🚨 유효기간 만료 제품 (즉시 폐기)</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-red-50 border-b border-red-200">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-red-700">품목명</th>
                  <th className="px-6 py-3 text-center font-semibold text-red-700">현재고</th>
                  <th className="px-6 py-3 text-center font-semibold text-red-700">만료일</th>
                  <th className="px-6 py-3 text-center font-semibold text-red-700">경과일</th>
                  <th className="px-6 py-3 text-left font-semibold text-red-700">공급처</th>
                  <th className="px-6 py-3 text-center font-semibold text-red-700">폐기</th>
                </tr>
              </thead>
              <tbody>
                {expiredItems.map((item) => {
                  const daysExpired = Math.abs(calculateDaysUntilExpiration(item.expiration_date));
                  return (
                    <tr key={item.id} className="border-b border-red-100 hover:bg-red-50">
                      <td className="px-6 py-4 font-bold text-red-800">{item.name}</td>
                      <td className="px-6 py-4 text-center font-bold text-red-800">{item.stock}개</td>
                      <td className="px-6 py-4 text-center font-bold text-red-800">
                        {new Date(item.expiration_date).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-6 py-4 text-center font-semibold text-red-600">{daysExpired}일 경과</td>
                      <td className="px-6 py-4 text-left text-red-600">{item.supplier}</td>
                      <td className="px-6 py-4 text-center">
                        <button className="px-3 py-1 bg-red-600 text-white rounded text-xs font-semibold hover:bg-red-700">
                          폐기 처리
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 알림 설정 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h4 className="font-semibold text-blue-800 mb-4">🔔 알림 설정</h4>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" defaultChecked className="w-5 h-5" />
            <span className="text-sm font-bold text-blue-700">6개월 이내 제품 → 행정팀 알림</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" defaultChecked className="w-5 h-5" />
            <span className="text-sm font-bold text-blue-700">만료 제품 → 즉시 알림</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" defaultChecked className="w-5 h-5" />
            <span className="text-sm font-bold text-blue-700">매일 자동 확인 (오전 8시)</span>
          </label>
        </div>
      </div>
    </div>
  );
}
