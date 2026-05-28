import type { StaffMember } from '@/types';

export type ProfileCardUser = Partial<StaffMember> &
  Record<string, unknown> & {
    permissions?: Record<string, unknown> | null;
  };

export type ProfileCardProps = {
  user?: ProfileCardUser | null;
  onOpenApproval?: (options?: Record<string, unknown>) => void;
  hideHeader?: boolean;
  hideActionBar?: boolean;
  showSecret?: boolean;
  setShowSecret?: (nextValue: boolean) => void;
  isEditing?: boolean;
  setIsEditing?: (nextValue: boolean) => void;
};


