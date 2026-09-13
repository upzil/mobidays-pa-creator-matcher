import type {
  Creator,
  CampaignGoal,
  FollowerSegment,
  MatchTier,
  RecommendedCreator,
  RecommendationQuery,
  RecommendationReason,
  RecommendationResult,
  RecommendationSection,
  ScoreBreakdown,
  ScoreComponent,
  SortMode,
} from "../domain/types";
import { CAMPAIGN_GOAL_PROFILES, CAMPAIGN_GOALS } from "./goals";

const RATING_PRIOR_STRENGTH = 5;
const SEGMENT_LABELS: Record<FollowerSegment, string> = {
  nano: "나노",
  micro: "마이크로",
  macro: "매크로",
};

export function getFollowerSegment(followers: number): FollowerSegment {
  if (followers < 10_000) return "nano";
  if (followers < 100_000) return "micro";
  return "macro";
}

function averageRankPercentile(value: number, population: readonly number[]): number {
  if (population.length === 1) return 0.5;

  let lower = 0;
  let equal = 0;
  for (const candidate of population) {
    if (candidate < value) lower += 1;
    else if (candidate === value) equal += 1;
  }

  const averageRank = lower + (equal + 1) / 2;
  return (averageRank - 1) / (population.length - 1);
}

function component(
  sourceValue: number | null,
  normalizedValue: number,
  weight: number,
  status: ScoreComponent["status"],
): ScoreComponent {
  return {
    sourceValue,
    normalizedValue,
    weight,
    contribution: 100 * normalizedValue * weight,
    status,
  };
}

interface ScoreContext {
  segmentCreators: readonly Creator[];
  globalRatingMean: number;
  ratingPercentiles: ReadonlyMap<string, number>;
}

function buildScoreContext(
  creators: readonly Creator[],
  segment: FollowerSegment,
  globalRatingMean: number,
): ScoreContext {
  const segmentCreators = creators.filter((creator) => creator.segment === segment);
  const adjustedRatings = segmentCreators
    .filter(
      (creator): creator is Creator & { advertiserRating: number } =>
        creator.advertiserRating !== null,
    )
    .map((creator) => ({
      creatorId: creator.creatorId,
      value:
        (creator.totalCampaignCount * creator.advertiserRating +
          RATING_PRIOR_STRENGTH * globalRatingMean) /
        (creator.totalCampaignCount + RATING_PRIOR_STRENGTH),
    }));
  const population = adjustedRatings.map(({ value }) => value);
  const ratingPercentiles = new Map(
    adjustedRatings.map(({ creatorId, value }) => [
      creatorId,
      averageRankPercentile(value, population),
    ]),
  );

  return { segmentCreators, globalRatingMean, ratingPercentiles };
}

function makeBreakdown(
  creator: Creator,
  budgetKrw: number | null,
  context: ScoreContext,
  goal: CampaignGoal,
): { breakdown: ScoreBreakdown; adjustedRating: number | null } {
  const weights = CAMPAIGN_GOAL_PROFILES[goal].weights;
  const engagementPercentile = averageRankPercentile(
    creator.engagementRate,
    context.segmentCreators.map((item) => item.engagementRate),
  );
  const viewPercentile = averageRankPercentile(
    creator.avgViewCount,
    context.segmentCreators.map((item) => item.avgViewCount),
  );
  const segmentMaxCampaignCount = Math.max(
    0,
    ...context.segmentCreators.map((item) => item.totalCampaignCount),
  );
  const experience =
    segmentMaxCampaignCount === 0
      ? 0
      : Math.log1p(creator.totalCampaignCount) /
        Math.log1p(segmentMaxCampaignCount);
  const adjustedRating =
    creator.advertiserRating === null
      ? null
      : (creator.totalCampaignCount * creator.advertiserRating +
          RATING_PRIOR_STRENGTH * context.globalRatingMean) /
        (creator.totalCampaignCount + RATING_PRIOR_STRENGTH);
  const ratingPercentile =
    creator.advertiserRating === null
      ? 0.5
      : (context.ratingPercentiles.get(creator.creatorId) ?? 0.5);
  const budgetEfficiency =
    budgetKrw === null || creator.avgCampaignBudgetKrw === null
      ? 0.5
      : budgetKrw / (budgetKrw + creator.avgCampaignBudgetKrw);

  return {
    adjustedRating,
    breakdown: {
      engagement: component(
        creator.engagementRate,
        engagementPercentile,
        weights.engagement,
        "observed",
      ),
      views: component(
        creator.avgViewCount,
        viewPercentile,
        weights.views,
        "observed",
      ),
      rating: component(
        creator.advertiserRating,
        ratingPercentile,
        weights.rating,
        creator.advertiserRating === null
          ? "missing-neutral"
          : "bayesian-adjusted",
      ),
      experience: component(
        creator.totalCampaignCount,
        experience,
        weights.experience,
        "observed",
      ),
      budgetEfficiency: component(
        creator.avgCampaignBudgetKrw,
        budgetEfficiency,
        weights.budgetEfficiency,
        creator.avgCampaignBudgetKrw === null
          ? "missing-neutral"
          : "observed",
      ),
    },
  };
}

function topPercentLabel(percentile: number): number {
  return Math.max(1, Math.ceil((1 - percentile) * 100));
}

function performanceReason(
  creator: Creator,
  breakdown: ScoreBreakdown,
): RecommendationReason | null {
  const candidates: Array<{
    contribution: number;
    reason: RecommendationReason;
  }> = [];

  if (breakdown.engagement.normalizedValue >= 0.75) {
    candidates.push({
      contribution: breakdown.engagement.contribution,
      reason: {
        code: "high-engagement",
        message: `참여율이 동일 규모 상위 ${topPercentLabel(breakdown.engagement.normalizedValue)}%예요.`,
      },
    });
  }
  if (breakdown.views.normalizedValue >= 0.75) {
    candidates.push({
      contribution: breakdown.views.contribution,
      reason: {
        code: "high-views",
        message: `평균 조회수가 동일 규모 상위 ${topPercentLabel(breakdown.views.normalizedValue)}%예요.`,
      },
    });
  }
  if (creator.advertiserRating !== null && creator.advertiserRating >= 4.5) {
    candidates.push({
      contribution: breakdown.rating.contribution,
      reason: {
        code: "strong-rating",
        message: `광고주 평점이 ${creator.advertiserRating.toFixed(1)}점으로 높아요.`,
      },
    });
  }
  if (breakdown.experience.normalizedValue >= 0.75) {
    candidates.push({
      contribution: breakdown.experience.contribution,
      reason: {
        code: "campaign-experience",
        message: `캠페인 ${creator.totalCampaignCount.toLocaleString("ko-KR")}건의 협업 이력이 있어요.`,
      },
    });
  }

  return candidates.sort((a, b) => b.contribution - a.contribution)[0]?.reason ?? null;
}

function makeReasons(
  creator: Creator,
  tier: MatchTier,
  breakdown: ScoreBreakdown,
  budgetOverageRate: number | null,
  hasCategoryFilter: boolean,
  hasBudgetFilter: boolean,
): RecommendationReason[] {
  const reasons: RecommendationReason[] = [];

  if (hasCategoryFilter) {
    reasons.push({
      code: "category-match",
      message: `선택한 ${creator.category} 카테고리와 일치해요.`,
    });
  }

  if (tier === "exact") {
    if (hasBudgetFilter) {
      reasons.push({
        code: "within-budget",
        message: "평균 협업비가 입력 예산 안에 들어와요.",
      });
    }
  } else if (tier === "exploration") {
    reasons.push({
      code: "missing-history",
      message: "신규 탐색 후보로 협업비와 만족도 확인이 필요해요.",
    });
  } else if (tier === "budget-relaxed") {
    reasons.push({
      code: "budget-relaxed",
      message: `입력 예산보다 ${(100 * (budgetOverageRate ?? 0)).toFixed(1)}% 높지만 20% 이내의 대안이에요.`,
    });
  } else {
    reasons.push({
      code: "segment-relaxed",
      message: `요청 규모와 인접한 ${SEGMENT_LABELS[creator.segment]} 크리에이터예요.`,
    });
  }

  const performance = performanceReason(creator, breakdown);
  if (performance) reasons.push(performance);
  if (reasons.length === 0) {
    reasons.push({
      code: "goal-fit",
      message: "선택한 캠페인 목적의 성과 지표를 종합한 추천이에요.",
    });
  }

  // Keep the explanation payload compact and derived from the score or selected tier.
  return reasons.slice(0, 3);
}

function scoreCreator(
  creator: Creator,
  tier: MatchTier,
  budgetKrw: number | null,
  context: ScoreContext,
  requestedSegment: FollowerSegment | null,
  goal: CampaignGoal,
  hasCategoryFilter: boolean,
): RecommendedCreator {
  const { breakdown, adjustedRating } = makeBreakdown(
    creator,
    budgetKrw,
    context,
    goal,
  );
  const scoreRaw = Object.values(breakdown).reduce(
    (sum, scoreComponent) => sum + scoreComponent.contribution,
    0,
  );
  const budgetOverageRate =
    budgetKrw === null || creator.avgCampaignBudgetKrw === null
      ? null
      : Math.max(0, creator.avgCampaignBudgetKrw / budgetKrw - 1);
  const warnings: string[] = [];

  if (creator.totalCampaignCount === 0) {
    warnings.push(
      "캠페인 이력이 없어 평균 협업비와 광고주 평점을 직접 확인해야 해요.",
    );
  }
  if (tier === "budget-relaxed" && budgetOverageRate !== null) {
    warnings.push(
      `평균 협업비가 입력 예산보다 ${(budgetOverageRate * 100).toFixed(1)}% 높아요.`,
    );
  }
  if (tier === "segment-relaxed" && requestedSegment !== null) {
    warnings.push(
      `요청한 ${SEGMENT_LABELS[requestedSegment]} 규모 대신 ${SEGMENT_LABELS[creator.segment]} 규모를 제안해요.`,
    );
  }

  return {
    creator,
    tier,
    scoreRaw,
    score: Math.round(scoreRaw * 10) / 10,
    adjustedRating,
    breakdown,
    reasons: makeReasons(
      creator,
      tier,
      breakdown,
      budgetOverageRate,
      hasCategoryFilter,
      budgetKrw !== null,
    ),
    warnings,
    budgetOverageRate,
  };
}

function compareRecommended(a: RecommendedCreator, b: RecommendedCreator): number {
  return (
    b.scoreRaw - a.scoreRaw ||
    b.creator.engagementRate - a.creator.engagementRate ||
    b.creator.avgViewCount - a.creator.avgViewCount ||
    a.creator.creatorId.localeCompare(b.creator.creatorId)
  );
}

export function sortRecommendations(
  items: readonly RecommendedCreator[],
  sortMode: SortMode,
): RecommendedCreator[] {
  return [...items].sort((a, b) => {
    if (sortMode === "engagement") {
      return (
        b.creator.engagementRate - a.creator.engagementRate ||
        compareRecommended(a, b)
      );
    }
    if (sortMode === "views") {
      return b.creator.avgViewCount - a.creator.avgViewCount || compareRecommended(a, b);
    }
    if (sortMode === "rating") {
      if (a.creator.advertiserRating === null && b.creator.advertiserRating !== null)
        return 1;
      if (a.creator.advertiserRating !== null && b.creator.advertiserRating === null)
        return -1;
      return (
        (b.creator.advertiserRating ?? 0) -
          (a.creator.advertiserRating ?? 0) || compareRecommended(a, b)
      );
    }
    if (sortMode === "budget") {
      if (a.creator.avgCampaignBudgetKrw === null && b.creator.avgCampaignBudgetKrw !== null)
        return 1;
      if (a.creator.avgCampaignBudgetKrw !== null && b.creator.avgCampaignBudgetKrw === null)
        return -1;
      return (
        (a.creator.avgCampaignBudgetKrw ?? 0) -
          (b.creator.avgCampaignBudgetKrw ?? 0) || compareRecommended(a, b)
      );
    }
    return compareRecommended(a, b);
  });
}

function adjacentSegments(segment: FollowerSegment): FollowerSegment[] {
  if (segment === "nano") return ["micro"];
  if (segment === "macro") return ["micro"];
  return ["nano", "macro"];
}

function assertQuery(query: RecommendationQuery): void {
  if (
    query.budgetKrw !== null &&
    (!Number.isSafeInteger(query.budgetKrw) || query.budgetKrw <= 0)
  ) {
    throw new RangeError("budgetKrw는 null이거나 0보다 큰 안전한 정수여야 합니다.");
  }
  if (
    query.segment !== null &&
    !["nano", "micro", "macro"].includes(query.segment)
  ) {
    throw new RangeError("지원하지 않는 팔로워 규모입니다.");
  }
  if (!CAMPAIGN_GOALS.includes(query.goal)) {
    throw new RangeError("지원하지 않는 캠페인 목적입니다.");
  }
  if (
    !Number.isSafeInteger(query.desiredCreatorCount) ||
    query.desiredCreatorCount < 1 ||
    query.desiredCreatorCount > 20
  ) {
    throw new RangeError("desiredCreatorCount는 1 이상 20 이하의 안전한 정수여야 합니다.");
  }
}

export function recommendCreators(
  creators: readonly Creator[],
  query: RecommendationQuery,
): RecommendationResult {
  assertQuery(query);
  const appliedQuery: RecommendationQuery = {
    budgetKrw: query.budgetKrw,
    categories: [...query.categories],
    segment: query.segment,
    goal: query.goal,
    desiredCreatorCount: query.desiredCreatorCount,
  };
  const categories = new Set(query.categories);
  const relevant = query.categories.length === 0
    ? [...creators]
    : creators.filter((creator) => categories.has(creator.category));
  const sameSegment = query.segment === null
    ? relevant
    : relevant.filter((creator) => creator.segment === query.segment);
  const knownRatings = creators.flatMap((creator) =>
    creator.advertiserRating === null ? [] : [creator.advertiserRating],
  );
  const globalRatingMean =
    knownRatings.length === 0
      ? 3
      : knownRatings.reduce((sum, rating) => sum + rating, 0) / knownRatings.length;
  const contexts = new Map<FollowerSegment, ScoreContext>();
  const contextFor = (segment: FollowerSegment): ScoreContext => {
    const existing = contexts.get(segment);
    if (existing) return existing;
    const built = buildScoreContext(creators, segment, globalRatingMean);
    contexts.set(segment, built);
    return built;
  };
  const score = (creator: Creator, tier: MatchTier) =>
    scoreCreator(
      creator,
      tier,
      query.budgetKrw,
      contextFor(creator.segment),
      query.segment,
      query.goal,
      query.categories.length > 0,
    );
  const makeSection = (
    tier: MatchTier,
    candidates: readonly Creator[],
    segment?: FollowerSegment,
  ): RecommendationSection => ({
    tier,
    ...(segment ? { segment } : {}),
    items: sortRecommendations(
      candidates.map((creator) => score(creator, tier)),
      "recommended",
    ),
  });

  const limitSections = (
    sections: readonly RecommendationSection[],
  ): RecommendationSection[] => {
    let remaining = query.desiredCreatorCount;
    return sections.flatMap((section) => {
      if (remaining === 0) return [];
      const items = section.items.slice(0, remaining);
      remaining -= items.length;
      return items.length > 0 ? [{ ...section, items }] : [];
    });
  };

  const exact = sameSegment.filter(
    (creator) =>
      query.budgetKrw === null ||
      (creator.avgCampaignBudgetKrw !== null &&
        creator.avgCampaignBudgetKrw <= query.budgetKrw),
  );
  const exploration = sameSegment.filter(
    (creator) => query.budgetKrw !== null && creator.avgCampaignBudgetKrw === null,
  );

  if (exact.length > 0) {
    const sections = [makeSection("exact", exact, query.segment ?? undefined)];
    if (exploration.length > 0) {
      sections.push(makeSection("exploration", exploration, query.segment ?? undefined));
    }
    return {
      appliedQuery,
      outcome: "exact",
      sections: limitSections(sections),
      attemptedRelaxations: [],
      diagnostics: [],
    };
  }

  const budgetKrw = query.budgetKrw;
  const budgetRelaxed = budgetKrw === null ? [] : sameSegment.filter((creator) => {
    const cost = creator.avgCampaignBudgetKrw;
    return (
      cost !== null &&
      cost > budgetKrw &&
      cost * 5 <= budgetKrw * 6
    );
  });
  if (budgetRelaxed.length > 0) {
    return {
      appliedQuery,
      outcome: "budget-relaxed",
      sections: limitSections([
        makeSection("budget-relaxed", budgetRelaxed, query.segment ?? undefined),
      ]),
      attemptedRelaxations: ["budget-20-percent"],
      diagnostics: [
        "정확히 일치하는 후보가 없어 같은 카테고리와 규모에서 예산을 최대 20%까지 완화했어요.",
      ],
    };
  }

  const adjacent = query.segment === null ? [] : adjacentSegments(query.segment);
  const segmentSections = adjacent.flatMap((segment) => {
    const candidates = relevant.filter(
      (creator) =>
        creator.segment === segment &&
        budgetKrw !== null &&
        creator.avgCampaignBudgetKrw !== null &&
        creator.avgCampaignBudgetKrw <= budgetKrw,
    );
    return candidates.length > 0
      ? [makeSection("segment-relaxed", candidates, segment)]
      : [];
  });
  if (segmentSections.length > 0) {
    return {
      appliedQuery,
      outcome: "segment-relaxed",
      sections: limitSections(segmentSections),
      attemptedRelaxations: ["budget-20-percent", "adjacent-segment"],
      diagnostics: [
        "정확한 예산·규모 후보가 없어 같은 카테고리의 인접 규모 대안을 보여드려요.",
      ],
    };
  }

  if (exploration.length > 0) {
    return {
      appliedQuery,
      outcome: "exploration",
      sections: limitSections([
        makeSection("exploration", exploration, query.segment ?? undefined),
      ]),
      attemptedRelaxations: [
        "budget-20-percent",
        "adjacent-segment",
        "unknown-cost",
      ],
      diagnostics: [
        "예산이 확인된 후보가 없어 협업비와 만족도를 확인해야 하는 탐색 후보를 보여드려요.",
      ],
    };
  }

  return {
    appliedQuery,
    outcome: "empty",
    sections: [],
    attemptedRelaxations: [
      "budget-20-percent",
      "adjacent-segment",
      "unknown-cost",
    ],
    diagnostics: [
      "선택한 카테고리·규모·예산과 가까운 후보를 찾지 못했어요. 예산을 높이거나 규모 또는 카테고리를 변경해 주세요.",
    ],
  };
}
