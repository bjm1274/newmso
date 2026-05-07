'use client';

import RosterWizardRuleSafetySection from './RosterWizardRuleSafetySection';
import RosterWizardRuleSetupSection from './RosterWizardRuleSetupSection';
import RosterWizardRuleSummarySection from './RosterWizardRuleSummarySection';

type RosterWizardRuleStepProps = Record<string, any>;

export default function RosterWizardRuleStep(props: RosterWizardRuleStepProps) {
  return (
    <div className="space-y-4" data-testid="roster-wizard-step-3">
      <RosterWizardRuleSetupSection {...props} />
      <RosterWizardRuleSafetySection {...props} />
      <RosterWizardRuleSummarySection {...props} />
    </div>
  );
}
