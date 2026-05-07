'use client';

export type StructuralStaffingGap = {
  availableHeadcount: number;
  isShortage: boolean;
  requiredHeadcount: number;
  shortageCount: number;
};

export type FairnessScoreboardRow = {
  diversityScore: number;
  fairnessScore: number;
  holidayWorkCount: number;
  longestSameBandStreak: number;
  maxConsecutiveWorkDays: number;
  nightCount: number;
  note: string;
  staffId: string;
  staffName: string;
  weekendWorkCount: number;
};

export type FairnessScoreboard = {
  averageConsecutive: number;
  averageDiversity: number;
  averageHoliday: number;
  averageNight: number;
  averageWeekend: number;
  holidayCount: number;
  rows: FairnessScoreboardRow[];
};

export type RosterPreviewSummary = {
  enabledCount: number;
  manualCount: number;
  shiftCount: number;
  staffCount: number;
};
