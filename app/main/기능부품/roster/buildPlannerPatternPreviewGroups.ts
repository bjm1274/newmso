import { resolvePlannerPatternGroup } from '../\uADFC\uBB34\uD45C\uC790\uB3D9\uD3B8\uC131-engine';

type BuildPlannerPatternPreviewGroupsParams = Record<string, any>;

export function buildPlannerPatternPreviewGroups({
  defaultPlannerMode,
  enabledTargetStaffs,
  selectedPlannerShifts,
  selectedPatternProfile,
  workShifts,
}: BuildPlannerPatternPreviewGroupsParams) {
  if (enabledTargetStaffs.length === 0) return [];

  const groups = new Map();
  enabledTargetStaffs.forEach((staff: { id: string; name: string; company: string; [k: string]: any }) => {
    const resolvedGroup = resolvePlannerPatternGroup({
      staff,
      patternProfile: selectedPatternProfile,
      availableShifts: selectedPlannerShifts,
      allShifts: workShifts,
    });

    const previewGroup = resolvedGroup
      ? {
          key: resolvedGroup.key,
          label: resolvedGroup.label,
          mode: resolvedGroup.mode,
          source: resolvedGroup.source,
        }
      : {
          key: `default-${defaultPlannerMode}`,
          label:
            defaultPlannerMode === 'rotation'
              ? '\uC21C\uD658\uADFC\uBB34'
              : '\uACE0\uC815\uADFC\uBB34',
          mode: defaultPlannerMode,
          source: 'default',
        };

    const existing = groups.get(previewGroup.key);
    if (existing) {
      existing.count += 1;
      return;
    }

    groups.set(previewGroup.key, {
      ...previewGroup,
      count: 1,
    });
  });

  return Array.from(groups.values());
}

