import type { CampaignGoal, ScoreWeights } from "../domain/types";

interface CampaignGoalProfile {
  label: string;
  description: string;
  scoringNote: string;
  weightSummary: string;
  weights: ScoreWeights;
}

export const CAMPAIGN_GOAL_PROFILES: Record<CampaignGoal, CampaignGoalProfile> = {
  awareness: {
    label: "노출 확대",
    description: "평균 조회수를 중심으로 실제 도달 가능성을 봐요.",
    scoringNote: "노출 목적에 맞춰 평균 조회수를 가장 크게 반영했어요.",
    weightSummary: "조회수 45% · 참여율 20% · 평점 15% · 경험 10% · 예산 10%",
    weights: {
      engagement: 0.2,
      views: 0.45,
      rating: 0.15,
      experience: 0.1,
      budgetEfficiency: 0.1,
    },
  },
  engagement: {
    label: "참여 유도",
    description: "참여율을 중심으로 반응 가능성을 봐요.",
    scoringNote: "참여 목적에 맞춰 참여율을 가장 크게 반영했어요.",
    weightSummary: "참여율 45% · 조회수 20% · 평점 15% · 경험 10% · 예산 10%",
    weights: {
      engagement: 0.45,
      views: 0.2,
      rating: 0.15,
      experience: 0.1,
      budgetEfficiency: 0.1,
    },
  },
  conversion: {
    label: "전환 중심",
    description: "평점·참여율·협업 경험을 전환 대리 지표로 봐요.",
    scoringNote: "직접 전환 데이터가 없어 평점·참여율·협업 경험을 대리 지표로 반영했어요.",
    weightSummary: "평점 30% · 참여율 25% · 경험 20% · 예산 15% · 조회수 10%",
    weights: {
      engagement: 0.25,
      views: 0.1,
      rating: 0.3,
      experience: 0.2,
      budgetEfficiency: 0.15,
    },
  },
  balanced: {
    label: "균형 탐색",
    description: "성과·신뢰·비용을 고르게 비교해요.",
    scoringNote: "특정 지표에 치우치지 않도록 성과·신뢰·비용을 균형 있게 반영했어요.",
    weightSummary: "참여율 30% · 조회수 25% · 평점 20% · 경험 15% · 예산 10%",
    weights: {
      engagement: 0.3,
      views: 0.25,
      rating: 0.2,
      experience: 0.15,
      budgetEfficiency: 0.1,
    },
  },
};

export const CAMPAIGN_GOALS = Object.keys(CAMPAIGN_GOAL_PROFILES) as CampaignGoal[];
