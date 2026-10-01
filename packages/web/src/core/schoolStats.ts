/** The shape of `GET /api/stats/school` — shared by every School Life screen that reads it. */

export type SchoolTrend = 'rising' | 'falling' | 'steady' | 'unknown';

/** Shared across every School Life screen that shows a trend, so the wording never drifts between them. */
export const SCHOOL_TREND_LABEL: Record<SchoolTrend, string> = {
  rising: 'Improving',
  falling: 'Slipping',
  steady: 'Steady',
  unknown: 'Not enough data yet',
};

export interface SchoolGradeCategoryStat {
  id: string;
  name: string;
  weight: number;
  average: number | null;
  count: number;
}

export interface SchoolClassStat {
  classId: string;
  name: string;
  color: string | null;
  icon: string | null;
  subject: string | null;
  credits: number;
  gradedCount: number;
  uncategorizedCount: number;
  currentPercentage: number | null;
  letter: string | null;
  gpaPoints: number | null;
  trend: SchoolTrend;
  categories: SchoolGradeCategoryStat[];
}

export interface SchoolNeedsAttentionItem {
  classId: string;
  name: string;
  color: string | null;
  currentPercentage: number;
  trend: SchoolTrend;
  percentagePointsBelowAverage: number;
}

export interface SchoolBucket {
  key: string;
  label: string;
  value: number;
  count: number;
}

export interface SchoolStats {
  rangeDays: number;
  averagePercentage: number | null;
  gpa: number | null;
  gradingScale: { bands: { id: string; minPercent: number; letter: string; gpaPoints: number }[] };
  trend: SchoolTrend;
  byClass: SchoolClassStat[];
  needsAttention: SchoolNeedsAttentionItem[];
  completion: { total: number; completed: number; late: number; missing: number };
  testAverage: number | null;
  byWeek: SchoolBucket[];
}
