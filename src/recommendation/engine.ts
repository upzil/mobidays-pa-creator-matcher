import type {
  Creator,
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
import {
  CAMPAIGN_GOAL_MAX,
  CAMPAIGN_GOAL_MIN,
  getCampaignGoalProfile,
} from "./goals";

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
  budgetPercentiles: ReadonlyMap<string, number>;
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
  const knownBudgets = segmentCreators.filter(
    (creator): creator is Creator & { avgCampaignBudgetKrw: number } =>
      creator.avgCampaignBudgetKrw !== null,
  );
  const budgetPopulation = knownBudgets.map(
    (creator) => creator.avgCampaignBudgetKrw,
  );
  const budgetPercentiles = new Map(
    knownBudgets.map((creator) => [
      creator.creatorId,
      averageRankPercentile(creator.avgCampaignBudgetKrw, budgetPopulation),
    ]),
  );

  return { segmentCreators, globalRatingMean, ratingPercentiles, budgetPercentiles };
}

function makeBreakdown(
  creator: Creator,
  totalBudgetKrw: number | null,
  context: ScoreContext,
  goalPosition: number,
): { breakdown: ScoreBreakdown; adjustedRating: number | null } {
  const weights = getCampaignGoalProfile(goalPosition).weights;
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
    totalBudgetKrw === null || creator.avgCampaignBudgetKrw === null
      ? 0.5
      : 1 - (context.budgetPercentiles.get(creator.creatorId) ?? 0.5);

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
        message: "선택된 조합의 예상 협업비 합계가 총예산 안에 들어와요.",
      });
    }
  } else if (tier === "exploration") {
    reasons.push({
      code: "missing-history",
      message: "신규 탐색 후보로 협업비와 만족도 확인이 필요해요.",
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
  totalBudgetKrw: number | null,
  context: ScoreContext,
  requestedSegment: FollowerSegment | null,
  goalPosition: number,
  hasCategoryFilter: boolean,
): RecommendedCreator {
  const { breakdown, adjustedRating } = makeBreakdown(
    creator,
    totalBudgetKrw,
    context,
    goalPosition,
  );
  const scoreRaw = Object.values(breakdown).reduce(
    (sum, scoreComponent) => sum + scoreComponent.contribution,
    0,
  );
  const warnings: string[] = [];

  if (creator.totalCampaignCount === 0) {
    warnings.push(
      "캠페인 이력이 없어 평균 협업비와 광고주 평점을 직접 확인해야 해요.",
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
      hasCategoryFilter,
      totalBudgetKrw !== null,
    ),
    warnings,
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

interface CombinationState {
  costKrw: number;
  score: number;
  items: RecommendedCreator[];
  key: string;
}

const SCORE_EPSILON = 1e-9;

function isBetterCombination(
  candidate: CombinationState,
  current: CombinationState | undefined,
): boolean {
  if (!current) return true;
  if (candidate.score > current.score + SCORE_EPSILON) return true;
  if (current.score > candidate.score + SCORE_EPSILON) return false;
  if (candidate.costKrw !== current.costKrw) {
    return candidate.costKrw < current.costKrw;
  }
  return candidate.key.localeCompare(current.key) < 0;
}

function pruneDominatedStates(
  states: ReadonlyMap<number, CombinationState>,
): Map<number, CombinationState> {
  const ordered = [...states.values()].sort(
    (a, b) => a.costKrw - b.costKrw || b.score - a.score || a.key.localeCompare(b.key),
  );
  const frontier = new Map<number, CombinationState>();
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const state of ordered) {
    if (state.score <= bestScore + SCORE_EPSILON) continue;
    frontier.set(state.costKrw, state);
    bestScore = state.score;
  }

  return frontier;
}

function bestCombination(
  states: ReadonlyMap<number, CombinationState>,
): CombinationState | undefined {
  let best: CombinationState | undefined;
  for (const state of states.values()) {
    if (isBetterCombination(state, best)) best = state;
  }
  return best;
}

function selectOptimalCombination(
  candidates: readonly RecommendedCreator[],
  totalBudgetKrw: number | null,
  desiredCreatorCount: number | null,
): RecommendedCreator[] {
  const ordered = [...candidates].sort((a, b) =>
    a.creator.creatorId.localeCompare(b.creator.creatorId),
  );
  if (ordered.length === 0) return [];

  if (totalBudgetKrw === null) {
    const limit = desiredCreatorCount ?? ordered.length;
    return sortRecommendations(ordered, "recommended").slice(0, limit);
  }

  const priced = ordered.filter(
    (item): item is RecommendedCreator & {
      creator: Creator & { avgCampaignBudgetKrw: number };
    } => item.creator.avgCampaignBudgetKrw !== null,
  );
  if (priced.length === 0) return [];

  const targetCount = desiredCreatorCount === null
    ? priced.length
    : desiredCreatorCount;
  const frontiers = Array.from(
    { length: targetCount + 1 },
    () => new Map<number, CombinationState>(),
  );
  frontiers[0].set(0, { costKrw: 0, score: 0, items: [], key: "" });

  for (const item of priced) {
    const itemCost = item.creator.avgCampaignBudgetKrw;
    for (let count = targetCount; count >= 1; count -= 1) {
      const next = new Map(frontiers[count]);
      for (const state of frontiers[count - 1].values()) {
        const costKrw = state.costKrw + itemCost;
        if (costKrw > totalBudgetKrw) continue;
        const items = [...state.items, item];
        const candidate: CombinationState = {
          costKrw,
          score: state.score + item.scoreRaw,
          items,
          key: items.map(({ creator }) => creator.creatorId).join("|"),
        };
        const current = next.get(costKrw);
        if (isBetterCombination(candidate, current)) next.set(costKrw, candidate);
      }
      frontiers[count] = pruneDominatedStates(next);
    }
  }

  let selected: CombinationState | undefined;
  if (desiredCreatorCount !== null) {
    selected = bestCombination(frontiers[targetCount]);
  } else {
    for (let count = 1; count <= targetCount; count += 1) {
      const candidate = bestCombination(frontiers[count]);
      if (candidate && isBetterCombination(candidate, selected)) selected = candidate;
    }
  }

  return selected ? sortRecommendations(selected.items, "recommended") : [];
}

function assertQuery(query: RecommendationQuery): void {
  if (
    query.totalBudgetKrw !== null &&
    (!Number.isSafeInteger(query.totalBudgetKrw) || query.totalBudgetKrw <= 0)
  ) {
    throw new RangeError("totalBudgetKrw는 null이거나 0보다 큰 안전한 정수여야 합니다.");
  }
  if (
    query.platform !== null &&
    !["유튜브", "인스타그램"].includes(query.platform)
  ) {
    throw new RangeError("지원하지 않는 플랫폼입니다.");
  }
  if (
    query.segment !== null &&
    !["nano", "micro", "macro"].includes(query.segment)
  ) {
    throw new RangeError("지원하지 않는 팔로워 규모입니다.");
  }
  if (
    !Number.isFinite(query.goalPosition) ||
    query.goalPosition < CAMPAIGN_GOAL_MIN ||
    query.goalPosition > CAMPAIGN_GOAL_MAX
  ) {
    throw new RangeError("goalPosition은 0 이상 100 이하의 숫자여야 합니다.");
  }
  if (
    query.desiredCreatorCount !== null &&
    (!Number.isSafeInteger(query.desiredCreatorCount) ||
      query.desiredCreatorCount < 1 ||
      query.desiredCreatorCount > 20)
  ) {
    throw new RangeError("desiredCreatorCount는 null이거나 1 이상 20 이하의 안전한 정수여야 합니다.");
  }
  if (query.totalBudgetKrw === null && query.desiredCreatorCount === null) {
    throw new RangeError("totalBudgetKrw와 desiredCreatorCount 중 하나는 필수입니다.");
  }
}

export function recommendCreators(
  creators: readonly Creator[],
  query: RecommendationQuery,
): RecommendationResult {
  assertQuery(query);
  const appliedQuery: RecommendationQuery = {
    totalBudgetKrw: query.totalBudgetKrw,
    categories: [...query.categories],
    platform: query.platform,
    segment: query.segment,
    goalPosition: query.goalPosition,
    desiredCreatorCount: query.desiredCreatorCount,
  };
  const categories = new Set(query.categories);
  const platformPool = query.platform === null
    ? [...creators]
    : creators.filter((creator) => creator.platform === query.platform);
  const relevant = query.categories.length === 0
    ? platformPool
    : platformPool.filter((creator) => categories.has(creator.category));
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
      query.totalBudgetKrw,
      contextFor(creator.segment),
      query.segment,
      query.goalPosition,
      query.categories.length > 0,
    );
  const makeSection = (
    tier: MatchTier,
    items: readonly RecommendedCreator[],
    segment?: FollowerSegment,
  ): RecommendationSection => ({
    tier,
    ...(segment ? { segment } : {}),
    items: sortRecommendations(items, "recommended"),
  });
  const exactPool = query.totalBudgetKrw === null
    ? sameSegment
    : sameSegment.filter((creator) => creator.avgCampaignBudgetKrw !== null);
  const exact = selectOptimalCombination(
    exactPool.map((creator) => score(creator, "exact")),
    query.totalBudgetKrw,
    query.desiredCreatorCount,
  );

  if (exact.length > 0) {
    return {
      appliedQuery,
      outcome: "exact",
      sections: [makeSection("exact", exact, query.segment ?? undefined)],
      attemptedRelaxations: [],
      diagnostics: [],
    };
  }

  const adjacent = query.segment === null ? [] : adjacentSegments(query.segment);
  const adjacentPool = relevant.filter(
    (creator) =>
      adjacent.includes(creator.segment) &&
      (query.totalBudgetKrw === null || creator.avgCampaignBudgetKrw !== null),
  );
  const segmentSelection = selectOptimalCombination(
    adjacentPool.map((creator) => score(creator, "segment-relaxed")),
    query.totalBudgetKrw,
    query.desiredCreatorCount,
  );
  const segmentSections = adjacent.flatMap((segment) => {
    const items = segmentSelection.filter((item) => item.creator.segment === segment);
    return items.length > 0 ? [makeSection("segment-relaxed", items, segment)] : [];
  });
  if (segmentSections.length > 0) {
    return {
      appliedQuery,
      outcome: "segment-relaxed",
      sections: segmentSections,
      attemptedRelaxations: ["adjacent-segment"],
      diagnostics: [
        "요청한 규모에서 총예산을 지키는 조합이 없어 같은 카테고리의 인접 규모 대안을 보여드려요.",
      ],
    };
  }

  return {
    appliedQuery,
    outcome: "empty",
    sections: [],
    attemptedRelaxations: ["adjacent-segment"],
    diagnostics: [
      "선택한 플랫폼·카테고리·규모에서 비용이 확인되고 총예산을 지키는 조합을 찾지 못했어요. 총예산을 높이거나 추천 인원, 플랫폼, 규모 또는 카테고리를 변경해 주세요.",
    ],
  };
}
