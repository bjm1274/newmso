'use client';

import { useCallback } from 'react';
import { generateRosterPatternDraft } from './generateRosterPatternDraft';
import { runPartialRosterRegeneration } from './runPartialRosterRegeneration';

type UseRosterGenerationActionsParams = Record<string, any>;

export function useRosterGenerationActions(params: UseRosterGenerationActionsParams) {
  const generatePatternDraft = useCallback(async () => {
    await generateRosterPatternDraft(params);
  }, [params]);

  const handlePartialRegeneration = useCallback(async () => {
    await runPartialRosterRegeneration(params);
  }, [params]);

  return {
    generatePatternDraft,
    handlePartialRegeneration,
  };
}
