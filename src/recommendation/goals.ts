import type { ScoreWeights } from "../domain/types";

export interface CampaignGoalProfile {
  label: string;
  description: string;
  scoringNote: string;
  weightSummary: string;
  weights: ScoreWeights;
}

type CampaignGoalAnchor = "awareness" | "balanced" | "engagement";

export const CAMPAIGN_GOAL_MIN = 0;
export const CAMPAIGN_GOAL_BALANCED = 50;
export const CAMPAIGN_GOAL_MAX = 100;

export const CAMPAIGN_GOAL_PROFILES: Record<CampaignGoalAnchor, CampaignGoalProfile> = {
  awareness: {
    label: "노출 확대",
    description: "평균 조회수를 중심으로 실제 도달 가능성을 봐요.",
    scoringNote: "노출 목적에 맞춰 평균 조회수를 가장 크게 반영했어요.",
    weightSummary: "조회수 40% · 참여율 15%",
    weights: {
      engagement: 0.15,
      views: 0.4,
      rating: 0.2,
      experience: 0.15,
      budgetEfficiency: 0.1,
    },
  },
  balanced: {
    label: "균형 탐색",
    description: "성과·신뢰·비용을 고르게 비교해요.",
    scoringNote: "특정 지표에 치우치지 않도록 성과·신뢰·비용을 균형 있게 반영했어요.",
    weightSummary: "참여율 27.5% · 조회수 27.5%",
    weights: {
      engagement: 0.275,
      views: 0.275,
      rating: 0.2,
      experience: 0.15,
      budgetEfficiency: 0.1,
    },
  },
  engagement: {
    label: "참여 중심",
    description: "참여율을 중심으로 반응 가능성을 봐요.",
    scoringNote: "참여 중심 설정에 맞춰 참여율을 가장 크게 반영했어요.",
    weightSummary: "참여율 40% · 조회수 15%",
    weights: {
      engagement: 0.4,
      views: 0.15,
      rating: 0.2,
      experience: 0.15,
      budgetEfficiency: 0.1,
    },
  },
};

function interpolateWeights(
  from: ScoreWeights,
  to: ScoreWeights,
  progress: number,
): ScoreWeights {
  return {
    engagement: from.engagement + (to.engagement - from.engagement) * progress,
    views: from.views + (to.views - from.views) * progress,
    rating: from.rating + (to.rating - from.rating) * progress,
    experience: from.experience + (to.experience - from.experience) * progress,
    budgetEfficiency:
      from.budgetEfficiency + (to.budgetEfficiency - from.budgetEfficiency) * progress,
  };
}

function formatPercent(value: number): string {
  const percent = Math.round(value * 1_000) / 10;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;
}

function summarizeAdjustableWeights(weights: ScoreWeights): string {
  const entries = [
    { label: "참여율", value: weights.engagement },
    { label: "조회수", value: weights.views },
  ].sort((a, b) => b.value - a.value);

  return entries.map(({ label, value }) => `${label} ${formatPercent(value)}`).join(" · ");
}

export function getCampaignGoalProfile(position: number): CampaignGoalProfile {
  const clampedPosition = Math.min(CAMPAIGN_GOAL_MAX, Math.max(CAMPAIGN_GOAL_MIN, position));
  let weights: ScoreWeights;
  let label: string;
  let description: string;
  let scoringNote: string;

  if (clampedPosition < CAMPAIGN_GOAL_BALANCED) {
    weights = interpolateWeights(
      CAMPAIGN_GOAL_PROFILES.awareness.weights,
      CAMPAIGN_GOAL_PROFILES.balanced.weights,
      clampedPosition / CAMPAIGN_GOAL_BALANCED,
    );
    label = "노출 중심";
    description = "평균 조회수 비중을 높여 더 넓은 도달 가능성을 봐요.";
    scoringNote = "노출 쪽으로 조절한 수준에 맞춰 조회수 비중을 높였어요.";
  } else if (clampedPosition > CAMPAIGN_GOAL_BALANCED) {
    weights = interpolateWeights(
      CAMPAIGN_GOAL_PROFILES.balanced.weights,
      CAMPAIGN_GOAL_PROFILES.engagement.weights,
      (clampedPosition - CAMPAIGN_GOAL_BALANCED) / CAMPAIGN_GOAL_BALANCED,
    );
    label = "참여 중심";
    description = "참여율 비중을 높여 더 적극적인 반응 가능성을 봐요.";
    scoringNote = "참여 쪽으로 조절한 수준에 맞춰 참여율 비중을 높였어요.";
  } else {
    weights = CAMPAIGN_GOAL_PROFILES.balanced.weights;
    label = CAMPAIGN_GOAL_PROFILES.balanced.label;
    description = CAMPAIGN_GOAL_PROFILES.balanced.description;
    scoringNote = CAMPAIGN_GOAL_PROFILES.balanced.scoringNote;
  }

  return {
    label,
    description,
    scoringNote,
    weightSummary: summarizeAdjustableWeights(weights),
    weights,
  };
}
