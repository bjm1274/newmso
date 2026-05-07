import { useCallback, useEffect, useState } from 'react';
import {
  normalizePatternProfile,
  readCachedPatternProfiles,
  ROSTER_PATTERN_PROFILE_STORAGE_KEY,
  type RosterPatternProfile,
  writeCachedPatternProfiles,
} from '@/lib/roster-pattern-profiles';
import {
  normalizeGenerationRule,
  readCachedGenerationRules,
  ROSTER_GENERATION_RULE_STORAGE_KEY,
  type RosterGenerationRule,
  writeCachedGenerationRules,
} from '@/lib/roster-generation-rules';
import {
  loadRosterPolicyStorageRecords,
  upsertRosterPolicyStorageRecord,
} from '@/lib/roster-policy-storage';
import {
  mergeRosterItemsByRecency,
  parseRosterUpdatedAt,
} from '../근무표자동편성-types';
import {
  loadStoredGenerationRules,
  loadStoredPatternProfiles,
} from '../근무표자동편성-engine';

type UseRosterPolicySyncParams = {
  canManageRosterPolicies: boolean;
  companyIdByName: Map<string, string>;
  userId: string | null;
};

export function useRosterPolicySync({
  canManageRosterPolicies,
  companyIdByName,
  userId,
}: UseRosterPolicySyncParams) {
  const [savedPatternProfiles, setSavedPatternProfiles] = useState<RosterPatternProfile[]>(
    () => readCachedPatternProfiles()
  );
  const [savedGenerationRules, setSavedGenerationRules] = useState<RosterGenerationRule[]>(
    () => readCachedGenerationRules()
  );

  const resolvePolicyCompanyId = useCallback(
    (companyName?: string, explicitCompanyId?: string | null) => {
      const normalizedExplicit = String(explicitCompanyId || '').trim();
      if (normalizedExplicit) return normalizedExplicit;

      const normalizedCompanyName = String(companyName || '').trim();
      if (!normalizedCompanyName) return null;

      return companyIdByName.get(normalizedCompanyName) || null;
    },
    [companyIdByName]
  );

  const buildPatternProfileStorageRecord = useCallback(
    (profile: RosterPatternProfile) => {
      const companyName = String(profile.companyName || '').trim() || '전체';
      const companyId = resolvePolicyCompanyId(companyName, profile.companyId);

      return {
        ...profile,
        companyName,
        companyId,
        updatedAt: profile.updatedAt || new Date().toISOString(),
      };
    },
    [resolvePolicyCompanyId]
  );

  const buildGenerationRuleStorageRecord = useCallback(
    (rule: RosterGenerationRule) => {
      const companyName = String(rule.companyName || '').trim() || '전체';
      const companyId = resolvePolicyCompanyId(companyName, rule.companyId);

      return {
        ...rule,
        companyName,
        companyId,
        updatedAt: rule.updatedAt || new Date().toISOString(),
      };
    },
    [resolvePolicyCompanyId]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(ROSTER_PATTERN_PROFILE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const normalizedProfiles = parsed
        .map((profile) => normalizePatternProfile(profile))
        .filter((profile): profile is RosterPatternProfile => profile !== null);
      setSavedPatternProfiles(normalizedProfiles);
      writeCachedPatternProfiles(normalizedProfiles);
    } catch (error) {
      console.error('근무표 패턴 프로필 로드 실패:', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(ROSTER_GENERATION_RULE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const normalizedRules = parsed
        .map((rule) => normalizeGenerationRule(rule))
        .filter((rule): rule is RosterGenerationRule => rule !== null);
      setSavedGenerationRules(normalizedRules);
      writeCachedGenerationRules(normalizedRules);
    } catch (error) {
      console.error('근무표 생성규칙 로드 실패:', error);
    }
  }, []);

  useEffect(() => {
    const localProfiles = mergeRosterItemsByRecency(
      readCachedPatternProfiles(),
      loadStoredPatternProfiles()
    );
    if (localProfiles.length > 0) {
      setSavedPatternProfiles(localProfiles);
      writeCachedPatternProfiles(localProfiles);
    }

    const localRules = mergeRosterItemsByRecency(
      readCachedGenerationRules(),
      loadStoredGenerationRules()
    );
    if (localRules.length > 0) {
      setSavedGenerationRules(localRules);
      writeCachedGenerationRules(localRules);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const hydrateSharedPolicies = async () => {
      try {
        const [patternResult, ruleResult] = await Promise.all([
          loadRosterPolicyStorageRecords('pattern_profile'),
          loadRosterPolicyStorageRecords('generation_rule'),
        ]);
        if (cancelled) return;

        const remoteProfiles = patternResult.records
          .map((record) => {
            const payload = record.payload || {};
            return normalizePatternProfile({
              ...payload,
              id: record.policyId,
              name: record.name,
              companyName: record.companyName,
              companyId: record.companyId,
              updatedAt: record.updatedAt || String((payload as Record<string, unknown>).updatedAt || ''),
            });
          })
          .filter((profile): profile is RosterPatternProfile => profile !== null);
        const remoteRules = ruleResult.records
          .map((record) => {
            const payload = record.payload || {};
            return normalizeGenerationRule({
              ...payload,
              id: record.policyId,
              name: record.name,
              companyName: record.companyName,
              companyId: record.companyId,
              updatedAt: record.updatedAt || String((payload as Record<string, unknown>).updatedAt || ''),
            });
          })
          .filter((rule): rule is RosterGenerationRule => rule !== null);

        const mergedProfiles = mergeRosterItemsByRecency(
          readCachedPatternProfiles(),
          loadStoredPatternProfiles(),
          remoteProfiles
        );
        const mergedRules = mergeRosterItemsByRecency(
          readCachedGenerationRules(),
          loadStoredGenerationRules(),
          remoteRules
        );

        setSavedPatternProfiles(mergedProfiles);
        setSavedGenerationRules(mergedRules);
        writeCachedPatternProfiles(mergedProfiles);
        writeCachedGenerationRules(mergedRules);

        if (canManageRosterPolicies && patternResult.storageAvailable) {
          const remoteProfilesById = new Map(remoteProfiles.map((profile) => [profile.id, profile]));
          const profilesToSync = mergedProfiles
            .map((profile) => buildPatternProfileStorageRecord(profile))
            .filter((profile) => {
              const remoteProfile = remoteProfilesById.get(profile.id);
              return (
                !remoteProfile ||
                parseRosterUpdatedAt(profile.updatedAt) > parseRosterUpdatedAt(remoteProfile.updatedAt)
              );
            });

          await Promise.all(
            profilesToSync.map((profile) =>
              upsertRosterPolicyStorageRecord({
                policyType: 'pattern_profile',
                policyId: profile.id,
                companyId: profile.companyId,
                companyName: profile.companyName,
                name: profile.name,
                payload: profile as unknown as Record<string, unknown>,
                createdBy: userId,
                updatedBy: userId,
                updatedAt: profile.updatedAt,
              })
            )
          );
        }

        if (canManageRosterPolicies && ruleResult.storageAvailable) {
          const remoteRulesById = new Map(remoteRules.map((rule) => [rule.id, rule]));
          const rulesToSync = mergedRules
            .map((rule) => buildGenerationRuleStorageRecord(rule))
            .filter((rule) => {
              const remoteRule = remoteRulesById.get(rule.id);
              return !remoteRule || parseRosterUpdatedAt(rule.updatedAt) > parseRosterUpdatedAt(remoteRule.updatedAt);
            });

          await Promise.all(
            rulesToSync.map((rule) =>
              upsertRosterPolicyStorageRecord({
                policyType: 'generation_rule',
                policyId: rule.id,
                companyId: rule.companyId,
                companyName: rule.companyName,
                name: rule.name,
                payload: rule as unknown as Record<string, unknown>,
                createdBy: userId,
                updatedBy: userId,
                updatedAt: rule.updatedAt,
              })
            )
          );
        }
      } catch (error) {
        console.error('근무표 공용 정책 저장소 읽기 실패:', error);
      }
    };

    void hydrateSharedPolicies();

    return () => {
      cancelled = true;
    };
  }, [
    buildGenerationRuleStorageRecord,
    buildPatternProfileStorageRecord,
    canManageRosterPolicies,
    userId,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        ROSTER_PATTERN_PROFILE_STORAGE_KEY,
        JSON.stringify(savedPatternProfiles)
      );
      writeCachedPatternProfiles(savedPatternProfiles);
    } catch (error) {
      console.error('근무표 패턴 프로필 저장 실패:', error);
    }
  }, [savedPatternProfiles]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        ROSTER_GENERATION_RULE_STORAGE_KEY,
        JSON.stringify(savedGenerationRules)
      );
      writeCachedGenerationRules(savedGenerationRules);
    } catch (error) {
      console.error('근무표 생성규칙 저장 실패:', error);
    }
  }, [savedGenerationRules]);

  const persistPatternProfiles = useCallback((nextProfiles: RosterPatternProfile[]) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        ROSTER_PATTERN_PROFILE_STORAGE_KEY,
        JSON.stringify(nextProfiles)
      );
      writeCachedPatternProfiles(nextProfiles);
    } catch (error) {
      console.error('근무표 패턴 프로필 저장 실패:', error);
    }
  }, []);

  const persistGenerationRules = useCallback((nextRules: RosterGenerationRule[]) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        ROSTER_GENERATION_RULE_STORAGE_KEY,
        JSON.stringify(nextRules)
      );
      writeCachedGenerationRules(nextRules);
    } catch (error) {
      console.error('근무표 생성규칙 저장 실패:', error);
    }
  }, []);

  const syncPatternProfileToSharedStorage = useCallback(
    async (profile: RosterPatternProfile) => {
      const record = buildPatternProfileStorageRecord(profile);

      const result = await upsertRosterPolicyStorageRecord({
        policyType: 'pattern_profile',
        policyId: record.id,
        companyId: record.companyId,
        companyName: record.companyName || '전체',
        name: record.name,
        payload: record as unknown as Record<string, unknown>,
        createdBy: userId,
        updatedBy: userId,
        updatedAt: record.updatedAt,
      });

      return result.storageAvailable;
    },
    [buildPatternProfileStorageRecord, userId]
  );

  const syncGenerationRuleToSharedStorage = useCallback(
    async (rule: RosterGenerationRule) => {
      const record = buildGenerationRuleStorageRecord(rule);

      const result = await upsertRosterPolicyStorageRecord({
        policyType: 'generation_rule',
        policyId: record.id,
        companyId: record.companyId,
        companyName: record.companyName || '전체',
        name: record.name,
        payload: record as unknown as Record<string, unknown>,
        createdBy: userId,
        updatedBy: userId,
        updatedAt: record.updatedAt,
      });

      return result.storageAvailable;
    },
    [buildGenerationRuleStorageRecord, userId]
  );

  return {
    persistGenerationRules,
    persistPatternProfiles,
    savedGenerationRules,
    savedPatternProfiles,
    setSavedGenerationRules,
    setSavedPatternProfiles,
    syncGenerationRuleToSharedStorage,
    syncPatternProfileToSharedStorage,
  };
}
