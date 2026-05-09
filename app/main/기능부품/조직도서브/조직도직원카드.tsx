'use client';
import ProfilePhotoThumbnail from '@/app/components/ProfilePhotoThumbnail';
import { useActionDialog } from '@/app/components/useActionDialog';
import { getProfilePhotoUrl } from '@/lib/profile-photo';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import type { StaffMember } from '@/types';
import { toSafeText } from './org-chart-types';

export interface StaffCardRowProps {
  staff: StaffMember;
  onClick?: () => void;
  isEditMode: boolean;
  setDraggedStaff: (staff: StaffMember | null) => void;
  draggedStaff: StaffMember | null;
  onMoveStaff?: (staff: StaffMember, direction: 'up' | 'down') => void;
}

/** 직원 카드: 사진 좌측, 이름·직책 우측 가로 배치 */
export function StaffCardRow({ staff, onClick, isEditMode, setDraggedStaff, draggedStaff, onMoveStaff }: StaffCardRowProps) {
  const { dialog, openConfirm } = useActionDialog();
  const isAdmin = staff.role === 'admin' || staff.permissions?.mso === true;
  const photoUrl = getProfilePhotoUrl(staff);

  return (
    <div
      onClick={onClick}
      draggable={isEditMode}
      onDragStart={isEditMode ? () => {
        setDraggedStaff(staff);
      } : undefined}
      onDragOver={isEditMode ? (e) => e.preventDefault() : undefined}
      onDrop={isEditMode ? async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!draggedStaff || draggedStaff.id === staff.id) return;
        const confirmed = await openConfirm({
          title: '직원 순서 변경',
          description: `${draggedStaff.name}님과 ${staff.name}님의 순서를 바꿉니다.`,
          confirmText: '변경',
          tone: 'accent',
        });
        if (confirmed) {
          // Swap logic using employee_no (acting as sort index)
          const tempNo1 = staff.employee_no;
          const tempNo2 = draggedStaff.employee_no;
          await supabase.from('staff_members').update({ employee_no: tempNo2 }).eq('id', staff.id);
          await supabase.from('staff_members').update({ employee_no: tempNo1 }).eq('id', draggedStaff.id);
          toast('변경되었습니다.');
          window.location.reload();
        }
      } : undefined}
      className={`
        relative flex flex-row items-center gap-3.5 p-2.5 pr-4 bg-[var(--card)] border rounded-[var(--radius-lg)] transition-all group min-w-0
        border-[var(--border)] shadow-sm hover:shadow-sm hover:border-[var(--accent)] hover:-translate-y-0.5
        ${isAdmin ? 'border-l-4 border-l-[var(--toss-danger)]' : ''}
        ${isEditMode ? 'cursor-grab active:cursor-grabbing hover:bg-[var(--tab-bg)]' : 'cursor-pointer'}
      `}
    >
      {dialog}
      <div className={`w-[42px] h-[42px] shrink-0 rounded-[var(--radius-md)] flex items-center justify-center text-base overflow-hidden ${isAdmin ? 'bg-red-500/10 text-red-400' : 'bg-[var(--muted)] text-[var(--toss-gray-3)] group-hover:bg-[var(--toss-blue-light)] group-hover:text-[var(--accent)]'}`}>
        {photoUrl ? (
          <ProfilePhotoThumbnail src={photoUrl} name={staff.name} className="w-full h-full object-cover rounded-[var(--radius-md)]" previewDisabled={isEditMode} />
        ) : (
          <span className="text-sm">印</span>
        )}
      </div>
      <div className="flex flex-col justify-center min-w-0 text-left pointer-events-none">
        <p className="font-semibold text-[var(--foreground)] text-sm truncate">{toSafeText(staff.name, '직원')}</p>
        <p className="text-xs font-bold text-[var(--toss-gray-3)] truncate">{toSafeText(staff.position, '-')}</p>
      </div>
      {isEditMode && (
        <div className="flex flex-col gap-1 ml-auto pointer-events-auto">
          <button
            title="위로 이동"
            onClick={(e) => { e.stopPropagation(); onMoveStaff?.(staff, 'up'); }}
            className="w-8 h-8 flex items-center justify-center bg-[var(--tab-bg)] rounded-[var(--radius-md)] hover:bg-[var(--accent)] hover:text-white active:bg-[var(--accent)] active:text-white transition-colors text-[11px]"
          >
            ▲
          </button>
          <button
            title="아래로 이동"
            onClick={(e) => { e.stopPropagation(); onMoveStaff?.(staff, 'down'); }}
            className="w-8 h-8 flex items-center justify-center bg-[var(--tab-bg)] rounded-[var(--radius-md)] hover:bg-[var(--accent)] hover:text-white active:bg-[var(--accent)] active:text-white transition-colors text-[11px]"
          >
            ▼
          </button>
        </div>
      )}
      {isAdmin && !isEditMode && <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-[var(--toss-danger)] rounded-full"></span>}
    </div>
  );
}
