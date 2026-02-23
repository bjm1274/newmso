'use client';
import { useState } from 'react';
import AdvancedInventoryManagement from './재고관리_고도화';
import InventoryScanModule from './재고관리_스캔모듈';

export default function IntegratedInventorySystem({ user, staffs }: any) {
  const [activeModule, setActiveModule] = useState('관리');

  return (
    <div className="flex flex-col h-full bg-gray-50/30 overflow-hidden">
      {/* 헤더 */}
      <div className="p-8 border-b border-gray-100 bg-white shadow-sm">
        <h2 className="text-2xl font-semibold text-gray-800 tracking-tighter italic">재고관리 시스템</h2>
        <p className="text-xs text-gray-400 font-bold uppercase mt-1">UDI, 명세서, 발주, 스캔 통합</p>
      </div>

      {/* 모듈 선택 탭 */}
      <div className="flex gap-2 p-6 bg-white border-b border-gray-100 overflow-x-auto">
        <button
          onClick={() => setActiveModule('관리')}
          className={`px-6 py-3 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
            activeModule === '관리'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
          }`}
        >
          📊 재고 관리
        </button>
        <button
          onClick={() => setActiveModule('스캔')}
          className={`px-6 py-3 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
            activeModule === '스캔'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
          }`}
        >
          📱 스캔 입고
        </button>
      </div>

      {/* 모듈 콘텐츠 */}
      <div className="flex-1 overflow-hidden">
        {activeModule === '관리' && <AdvancedInventoryManagement user={user} />}
        {activeModule === '스캔' && <InventoryScanModule user={user} />}
      </div>
    </div>
  );
}
