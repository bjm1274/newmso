'use client';

import type { CompanyScope, GuideAudience, GuideKind, GuideResource, TeamScope } from './guide-types';
import { formatDate, getGuideAudienceLabel, getGuideKindLabel } from './guide-utils';

type GuideSidebarProps = {
  activeTeam: TeamScope | null;
  canWrite: boolean;
  companyFilter: string;
  companyOptions: string[];
  companyTeams: TeamScope[];
  selectedCompany: CompanyScope | null;
  selectedTeamKey: string;
  search: string;
  kindFilter: 'all' | GuideKind;
  audienceFilter: 'all' | GuideAudience;
  filteredResources: GuideResource[];
  selectedResourceId: string | null;
  loading: boolean;
  onCompanyFilterChange: (value: string) => void;
  onSelectedTeamKeyChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onKindFilterChange: (value: 'all' | GuideKind) => void;
  onAudienceFilterChange: (value: 'all' | GuideAudience) => void;
  onSelectResource: (resourceId: string) => void;
  onOpenCompose: () => void;
};

export default function GuideSidebar({
  activeTeam,
  canWrite,
  companyFilter,
  companyOptions,
  companyTeams,
  selectedCompany,
  selectedTeamKey,
  search,
  kindFilter,
  audienceFilter,
  filteredResources,
  selectedResourceId,
  loading,
  onCompanyFilterChange,
  onSelectedTeamKeyChange,
  onSearchChange,
  onKindFilterChange,
  onAudienceFilterChange,
  onSelectResource,
  onOpenCompose,
}: GuideSidebarProps) {
  return (
    <div className="space-y-3">
      <div
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm"
        data-testid="guide-team-menu"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-bold text-[var(--foreground)]">회사 / 팀</p>
            {canWrite ? (
              <button
                type="button"
                data-testid="guide-open-compose"
                onClick={onOpenCompose}
                className="btn-premium-primary !px-2.5 !py-1 !text-[11px]"
              >
                {activeTeam ? `+ ${activeTeam.teamName}` : '+ 게시글'}
              </button>
            ) : null}
          </div>

          <div className="grid gap-2">
            <select
              data-testid="guide-company-select"
              value={companyFilter}
              onChange={(event) => onCompanyFilterChange(event.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 text-[13px] font-semibold outline-none focus:border-[var(--accent)]"
            >
              {companyOptions.map((companyName) => (
                <option key={companyName} value={companyName}>
                  {companyName}
                </option>
              ))}
            </select>

            <select
              data-testid="guide-team-filter-select"
              value={selectedTeamKey}
              onChange={(event) => onSelectedTeamKeyChange(event.target.value)}
              disabled={!companyTeams.length}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 text-[13px] font-semibold outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:bg-[var(--muted)]"
            >
              <option value="">{companyTeams.length ? '팀 선택' : '등록된 팀 없음'}</option>
              {selectedCompany?.divisions.map((division) => (
                <optgroup key={division.name} label={division.name}>
                  {division.teams.map((team) => (
                    <option key={team.key} value={team.key}>
                      {division.name} / {team.teamName}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {!activeTeam ? <div className="empty-state">조직도에 등록된 팀이 없습니다.</div> : null}
        </div>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm">
        <div className="space-y-2.5">
          <input
            data-testid="guide-search-input"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="제목, 팀, 키워드 검색"
            className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[13px] font-semibold outline-none focus:border-[var(--accent)]"
          />

          <div className="flex flex-wrap gap-1.5">
            {(['all', 'education', 'handover'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onKindFilterChange(value)}
                className={`rounded-[var(--radius-md)] px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                  kindFilter === value
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {value === 'all' ? '전체' : value === 'education' ? '업무자료' : '인수인계'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(['all', 'new_hire', 'current_staff', 'all_staff'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onAudienceFilterChange(value)}
                className={`rounded-[var(--radius-md)] px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                  audienceFilter === value
                    ? 'bg-[var(--foreground)] text-[var(--card)]'
                    : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:text-[var(--foreground)]'
                }`}
              >
                {value === 'all' ? '전체 대상' : getGuideAudienceLabel(value)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-bold text-[var(--toss-gray-4)]">
            {activeTeam ? `${activeTeam.teamName} 자료` : '자료 목록'}
          </p>
          <span className="badge badge-gray">{filteredResources.length}건</span>
        </div>

        {loading ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-6 text-center text-[13px] font-semibold text-[var(--toss-gray-4)]">
            불러오는 중...
          </div>
        ) : filteredResources.length === 0 ? (
          <div className="empty-state">
            <p className="text-[13px] font-bold text-[var(--foreground)]">등록된 자료가 없습니다</p>
            <p className="mt-1 text-xs text-[var(--toss-gray-4)]">
              {activeTeam ? `${activeTeam.teamName} 팀의 첫 자료를 등록해 보세요.` : '팀을 선택해 주세요.'}
            </p>
          </div>
        ) : (
          filteredResources.map((resource) => (
            <button
              key={resource.id}
              type="button"
              data-testid={`guide-card-${resource.id}`}
              onClick={() => onSelectResource(resource.id)}
              className={`w-full rounded-[var(--radius-lg)] border p-3 text-left transition-colors ${
                selectedResourceId === resource.id
                  ? 'border-[var(--accent)] bg-[var(--accent-light)]'
                  : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/40'
              }`}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="badge badge-blue">{getGuideKindLabel(resource.kind)}</span>
                <span className="badge badge-gray">{getGuideAudienceLabel(resource.audience)}</span>
              </div>
              <p className="mt-2 text-[13px] font-bold text-[var(--foreground)]">{resource.title}</p>
              <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[var(--toss-gray-4)]">
                {resource.description || '설명 없음'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-[var(--toss-gray-4)]">
                <span>{resource.author_name || '작성자 미상'}</span>
                <span>{formatDate(resource.updated_at || resource.created_at)}</span>
                {resource.attachments.length > 0 ? <span>첨부 {resource.attachments.length}</span> : null}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
