'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { setSelectedCompanyId as persistSelectedCompanyId, getSelectedCompanyId } from '@/lib/useCompany';

import Sidebar from './기능부품/조직도서브/조직도측면창';
import MainContent from './기능부품/조직도서브/조직도본문';
import NotificationSystem from './기능부품/알림시스템';

type ERPData = {
  staffs: any[];
  depts: any[];
  posts: any[];
  tasks: any[];
  surgeries: any[];
  mris: any[];
};

export default function MainPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<{ id: string; name: string; type: string }[]>([]);
  const [selectedCompanyId, setSelectedCompanyIdState] = useState<string | null>(null);

  // 초기 상태를 로컬 스토리지에서 시도
  const [mainMenu, setMainMenu] = useState('조직도');
  const [subView, setSubView] = useState('전체');
  const [selectedCo, setSelectedCo] = useState('전체');

  const [data, setData] = useState<ERPData>({
    staffs: [],
    depts: [],
    posts: [],
    tasks: [],
    surgeries: [],
    mris: []
  });

  // 1. 초기 로드 시 사용자 정보 및 이전 상태 복구
  useEffect(() => {
    const storedUser = localStorage.getItem('erp_user');
    if (!storedUser) {
      router.replace('/');
      return;
    }
    const parsedUser = JSON.parse(storedUser);
    setUser(parsedUser);

    // 이전 메뉴 상태 복구
    const savedMenu = localStorage.getItem('erp_last_menu');
    const savedSubView = localStorage.getItem('erp_last_subview');
    const savedCo = localStorage.getItem('erp_last_co');

    if (savedMenu) setMainMenu(savedMenu);
    if (savedSubView) setSubView(savedSubView);

    if (parsedUser.company !== '운영본부' && !parsedUser.permissions?.mso) {
      setSelectedCo(parsedUser.company);
    } else if (savedCo) {
      setSelectedCo(savedCo);
    }

    if (parsedUser?.company === '운영본부' || parsedUser?.permissions?.mso) {
      supabase.from('companies').select('id, name, type').eq('is_active', true).order('type').then(({ data: list }) => {
        setCompanies(list || []);
      });
      const savedId = getSelectedCompanyId();
      if (savedId) setSelectedCompanyIdState(savedId);
    }
    setSelectedCompanyIdState(getSelectedCompanyId());
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchERPData(user, selectedCompanyId);
  }, [user, selectedCompanyId]);

  // 2. 상태 변경 시마다 로컬 스토리지 업데이트
  useEffect(() => {
    if (user) {
      localStorage.setItem('erp_last_menu', mainMenu);
      localStorage.setItem('erp_last_subview', subView);
      localStorage.setItem('erp_last_co', selectedCo);
    }
  }, [mainMenu, subView, selectedCo, user]);

  const fetchERPData = async (currentUser?: any, companyIdFilter?: string | null) => {
    setLoading(true);
    const u = currentUser ?? user;
    try {
      const isMso = u?.company === '운영본부' || u?.permissions?.mso === true;
      const filterCompanyId = isMso ? companyIdFilter : u?.company_id;

      let staffQuery = supabase.from('staff_members').select('*').order('employee_no', { ascending: true });
      if (filterCompanyId) staffQuery = staffQuery.eq('company_id', filterCompanyId);
      const { data: staffData } = await staffQuery;

      let postQuery = supabase.from('board_posts').select('*').order('created_at', { ascending: false });
      if (filterCompanyId) {
        try { postQuery = postQuery.eq('company_id', filterCompanyId); } catch (_) { }
      }
      const { data: postData } = await postQuery;

      const uniqueDepts = Array.from(new Set(staffData?.map((s: any) => s.department)))
        .filter(Boolean)
        .map(d => ({ name: d }));

      setData({
        staffs: staffData || [],
        depts: uniqueDepts || [],
        posts: postData || [],
        tasks: [],
        surgeries: [],
        mris: []
      });
    } catch (error) {
      console.error("데이터 로딩 실패:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] p-6 text-center">
        <div className="relative w-20 h-20 mb-8">
          <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
        </div>
        <h2 className="text-xl font-black text-gray-900 mb-2 tracking-tighter italic">운영본부 통합 시스템</h2>
        <p className="text-xs font-bold text-gray-400 animate-pulse tracking-widest">데이터를 안전하게 동기화하고 있습니다...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-[#F5F6F8] overflow-hidden">
      {/* 전역 알림 시스템 */}
      <NotificationSystem user={user} />

      <Sidebar
        user={user}
        mainMenu={mainMenu}
        onMenuChange={(menu: string) => {
          setMainMenu(menu);
          // 메뉴 변경 시 서브뷰 초기화 (선택 사항)
          // setSubView('전체'); 
        }}
      />

      <div className="flex-1 flex flex-col overflow-hidden pb-[70px] md:pb-0">
        <MainContent
          user={user}
          mainMenu={mainMenu}
          data={data}
          subView={subView}
          setSubView={setSubView}
          selectedCo={selectedCo}
          setSelectedCo={setSelectedCo}
          companies={companies}
          selectedCompanyId={selectedCompanyId}
          setSelectedCompanyId={(id: string | null) => {
            persistSelectedCompanyId(id);
            setSelectedCompanyIdState(id);
          }}
          onRefresh={() => fetchERPData(user, selectedCompanyId)}
        />
      </div>
    </div>
  );
}
