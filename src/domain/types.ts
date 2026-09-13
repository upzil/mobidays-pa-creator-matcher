export const CATEGORIES = [
  "게임",
  "교육",
  "라이프스타일",
  "뷰티",
  "식품",
  "아웃도어",
  "여행",
  "테크",
  "패션",
  "피트니스",
] as const;

export type Category = (typeof CATEGORIES)[number];
export type Platform = "유튜브" | "인스타그램";
export type FollowerSegment = "nano" | "micro" | "macro";
export type CampaignGoal =
  | "awareness"
  | "engagement"
  | "conversion"
  | "balanced";
export type MatchTier =
  | "exact"
  | "exploration"
  | "segment-relaxed";
export type SortMode =
  | "recommended"
  | "engagement"
  | "views"
  | "rating"
  | "budget";
export type BrowseSortMode =
  | "followers"
  | "views"
  | "engagement"
  | "rating"
  | "budget";

export interface RawCreatorRow {
  creator_id: string;
  creator_name: string;
  category: string;
  platform: string;
  followers: string;
  avg_view_count: string;
  engagement_rate: string;
  total_campaign_count: string;
  total_campaign_budget_krw: string;
  avg_campaign_budget_krw: string;
  advertiser_rating: string;
}

export interface Creator {
  creatorId: string;
  creatorName: string;
  category: Category;
  platform: Platform;
  followers: number;
  segment: FollowerSegment;
  avgViewCount: number;
  engagementRate: number;
  totalCampaignCount: number;
  totalCampaignBudgetKrw: number;
  avgCampaignBudgetKrw: number | null;
  advertiserRating: number | null;
}

export interface ParseDiagnostic {
  row: number;
  code: string;
  message: string;
}

export interface ParsedCreators {
  creators: Creator[];
  diagnostics: ParseDiagnostic[];
}

export interface RecommendationQuery {
  totalBudgetKrw: number | null;
  categories: readonly Category[];
  segment: FollowerSegment | null;
  goal: CampaignGoal;
  desiredCreatorCount: number | null;
}

export interface ScoreWeights {
  engagement: number;
  views: number;
  rating: number;
  experience: number;
  budgetEfficiency: number;
}

export interface ScoreComponent {
  sourceValue: number | null;
  normalizedValue: number;
  weight: number;
  contribution: number;
  status: "observed" | "bayesian-adjusted" | "missing-neutral";
}

export interface ScoreBreakdown {
  engagement: ScoreComponent;
  views: ScoreComponent;
  rating: ScoreComponent;
  experience: ScoreComponent;
  budgetEfficiency: ScoreComponent;
}

export interface RecommendationReason {
  code:
    | "category-match"
    | "within-budget"
    | "high-engagement"
    | "high-views"
    | "strong-rating"
    | "campaign-experience"
    | "segment-relaxed"
    | "missing-history"
    | "goal-fit";
  message: string;
}

export interface RecommendedCreator {
  creator: Creator;
  tier: MatchTier;
  scoreRaw: number;
  score: number;
  adjustedRating: number | null;
  breakdown: ScoreBreakdown;
  reasons: RecommendationReason[];
  warnings: string[];
}

export interface RecommendationSection {
  tier: MatchTier;
  segment?: FollowerSegment;
  items: RecommendedCreator[];
}

export type RecommendationOutcome =
  | "exact"
  | "segment-relaxed"
  | "exploration"
  | "empty";

export interface RecommendationResult {
  appliedQuery: RecommendationQuery;
  outcome: RecommendationOutcome;
  sections: RecommendationSection[];
  attemptedRelaxations: Array<"adjacent-segment" | "unknown-cost">;
  diagnostics: string[];
}
