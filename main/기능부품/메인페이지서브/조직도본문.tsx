'use client';
import OrgChart from '../조직도서브/조직도그림';
import ChatView from '../메신저';
import BoardView from '../게시판';
import TaskView from '../할일';
import ApprovalView from '../전자결재';
import HRView from '../인사관리';
import InventoryView from '../재고관리';
import AdminView from '../관리자전용';

export default function MainContent({ user, mainMenu, data, subView, setSubView, selectedCo, setSelectedCo, onRefresh }: any) {
  return (
    <div className="flex-1 flex overflow-hidden relative bg-[#FDFDFD]">
      {/* 1. 조직도 (명칭 변경 반영됨) */}
      {mainMenu === '조직도' && (
        <OrgChart 
          user={user} staffs={data.staffs} depts={data.depts} 
          selectedCo={selectedCo} setSelectedCo={setSelectedCo} onRefresh={onRefresh} 
        />
      )}
      
      {/* 2. 채팅 (ID 일치 확인) */}
      {mainMenu === '채팅' && (
        <div className="absolute inset-0 bg-white z-20 animate-in slide-in-from-right duration-300">
          <ChatView user={user} onRefresh={onRefresh} />
        </div>
      )}

      {/* 3. 게시판 */}
      {mainMenu === '게시판' && (
        <BoardView user={user} posts={data.posts.filter((p:any) => p.board_type === subView)} 
          subView={subView} setSubView={setSubView} surgeries={data.surgeries} mris={data.mris} onRefresh={onRefresh} />
      )}

      {/* 4. 할일 */}
      {mainMenu === '할일' && <TaskView user={user} tasks={data.tasks} subView={subView} setSubView={setSubView} onRefresh={onRefresh} />}

      {/* 5. 전자결재 */}
      {mainMenu === '전자결재' && <ApprovalView user={user} staffs={data.staffs} subView={subView} setSubView={setSubView} />}

      {/* 6. 인사관리 */}
      {mainMenu === '인사관리' && <HRView user={user} staffs={data.staffs} depts={data.depts} selectedCo={selectedCo} onRefresh={onRefresh} />}

      {/* 7. 재고관리 */}
      {mainMenu === '재고관리' && <InventoryView user={user} depts={data.depts} onRefresh={onRefresh} />}

      {/* 8. 관리자 센터 */}
      {mainMenu === '관리자' && <AdminView user={user} staffs={data.staffs} depts={data.depts} onRefresh={onRefresh} />}
    </div>
  );
}