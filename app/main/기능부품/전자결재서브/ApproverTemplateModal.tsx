import React, { useState } from 'react';
import { toast } from '@/lib/toast';
import type { StaffMember } from '@/types';
import type { ApproverTemplate, ApprovalCcUser } from '../전자결재-types';

interface ApproverTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  approverLine: StaffMember[];
  ccLine: ApprovalCcUser[];
  approverTemplates: ApproverTemplate[];
  setApproverTemplates: (tpls: ApproverTemplate[]) => void;
  persistApproverTemplates: (tpls: ApproverTemplate[]) => void;
}

export default function ApproverTemplateModal({
  isOpen,
  onClose,
  approverLine,
  ccLine,
  approverTemplates,
  setApproverTemplates,
  persistApproverTemplates,
}: ApproverTemplateModalProps) {
  const [templateNameInput, setTemplateNameInput] = useState('');

  React.useEffect(() => {
    if (isOpen) {
      setTemplateNameInput('');
    }
  }, [isOpen]);

  const saveCurrentApproverTemplate = () => {
    if (!templateNameInput.trim()) {
      toast('템플릿 이름을 입력하세요.', 'warning');
      return;
    }
    if (approverLine.length === 0) {
      toast('결재선을 먼저 지정해주세요.');
      return;
    }

    const newTpl: ApproverTemplate = {
      id: Date.now().toString(),
      name: templateNameInput.trim(),
      line: approverLine,
      ccLine,
    };
    const next = [...approverTemplates, newTpl];
    setApproverTemplates(next);
    persistApproverTemplates(next);
    onClose();
    toast(`"${newTpl.name}" 템플릿이 저장되었습니다.`, 'success');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-[var(--card)] rounded-[var(--radius-xl)] shadow-sm p-4 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-[var(--foreground)] mb-1">결재선 템플릿 저장</h3>
        <p className="text-xs text-[var(--toss-gray-3)] mb-4">
          현재 결재선 ({approverLine.length}명)과 참조자 ({ccLine.length}명)를 이름을 붙여 저장합니다.
        </p>
        {approverLine.length === 0 ? (
          <p className="text-xs text-red-500 mb-4">결재선을 먼저 지정해주세요.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {approverLine.map((a, i) => (
              <span key={i} className="px-2 py-1 bg-[var(--toss-blue-light)] text-[var(--accent)] rounded-[var(--radius-md)] text-[10px] font-semibold">
                {i + 1}. {a.name}
              </span>
            ))}
          </div>
        )}
        <input
          type="text"
          value={templateNameInput}
          onChange={e => setTemplateNameInput(e.target.value)}
          data-testid="approval-template-name-input"
          placeholder="템플릿 이름 (예: 연차 기본, 물품 신청)"
          className="w-full px-4 py-3 border border-[var(--border)] rounded-[var(--radius-md)] text-sm font-semibold bg-[var(--muted)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] mb-4"
          onKeyDown={e => { if (e.key === 'Enter') saveCurrentApproverTemplate(); }}
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] font-semibold text-sm">취소</button>
          <button
            data-testid="approval-template-save-confirm"
            onClick={saveCurrentApproverTemplate}
            className="flex-1 py-3 rounded-[var(--radius-md)] bg-[var(--accent)] text-white font-semibold text-sm"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
