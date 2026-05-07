import type { AttachmentItem, BoardPost, StaffMember } from '@/types';

export type GuideKind = 'education' | 'handover';
export type GuideAudience = 'new_hire' | 'current_staff' | 'all_staff';
export type GuideTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type GuideMetaPayload = {
  kind?: GuideKind;
  audience?: GuideAudience;
  department?: string;
  teamName?: string;
  divisionName?: string;
  companyName?: string;
  keywords?: string[];
};

export type GuideTaskMetaPayload = {
  teamName?: string;
  divisionName?: string;
  companyName?: string;
  dueDate?: string;
  priority?: GuideTaskPriority;
  isDone?: boolean;
  completedAt?: string;
  completedById?: string;
  completedByName?: string;
};

export type GuideRow = BoardPost & {
  board_type?: string | null;
  attachments?: AttachmentItem[] | null;
  updated_at?: string | null;
  company_id?: string | null;
};

export type GuideResource = GuideRow & {
  description: string;
  attachments: AttachmentItem[];
  kind: GuideKind;
  audience: GuideAudience;
  teamName: string;
  divisionName: string;
  companyName: string;
  keywords: string[];
};

export type GuideTask = GuideRow & {
  note: string;
  teamName: string;
  divisionName: string;
  companyName: string;
  dueDate: string;
  priority: GuideTaskPriority;
  isDone: boolean;
  completedAt: string;
  completedById: string;
  completedByName: string;
};

export type OrgTeamRow = {
  id?: string | null;
  company_name?: string | null;
  division?: string | null;
  team_name?: string | null;
  sort_order?: number | null;
};

export type OrgStaffRow = {
  id?: string | null;
  company?: string | null;
  company_id?: string | null;
  department?: string | null;
  status?: string | null;
};

export type TeamScope = {
  key: string;
  companyName: string;
  companyId: string;
  divisionName: string;
  teamName: string;
  memberCount: number;
};

export type CompanyScope = {
  companyName: string;
  companyId: string;
  divisions: Array<{
    name: string;
    teams: TeamScope[];
  }>;
};

export type GuideLibraryProps = {
  user?: StaffMember | null;
  selectedCo?: string | null;
  selectedCompanyId?: string | null;
};
