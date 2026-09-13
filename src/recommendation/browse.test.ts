import { describe, expect, it } from "vitest";

import type { Creator } from "../domain/types";
import { sortCreatorsForBrowse } from "./browse";

const creators: Creator[] = [
  {
    creatorId: "C2",
    creatorName: "둘",
    category: "게임",
    platform: "유튜브",
    followers: 20_000,
    segment: "micro",
    avgViewCount: 8_000,
    engagementRate: 4,
    totalCampaignCount: 0,
    totalCampaignBudgetKrw: 0,
    avgCampaignBudgetKrw: null,
    advertiserRating: null,
  },
  {
    creatorId: "C1",
    creatorName: "하나",
    category: "게임",
    platform: "인스타그램",
    followers: 10_000,
    segment: "micro",
    avgViewCount: 9_000,
    engagementRate: 8,
    totalCampaignCount: 4,
    totalCampaignBudgetKrw: 400_000,
    avgCampaignBudgetKrw: 100_000,
    advertiserRating: 4.8,
  },
];

describe("sortCreatorsForBrowse", () => {
  it("기본 지표로 전체 목록을 정렬하고 원본은 변경하지 않는다", () => {
    const originalOrder = creators.map((creator) => creator.creatorId);

    expect(sortCreatorsForBrowse(creators, "followers").map((creator) => creator.creatorId)).toEqual(["C2", "C1"]);
    expect(sortCreatorsForBrowse(creators, "views").map((creator) => creator.creatorId)).toEqual(["C1", "C2"]);
    expect(sortCreatorsForBrowse(creators, "engagement").map((creator) => creator.creatorId)).toEqual(["C1", "C2"]);
    expect(creators.map((creator) => creator.creatorId)).toEqual(originalOrder);
  });

  it("결측 평점과 협업비를 해당 정렬의 마지막에 둔다", () => {
    expect(sortCreatorsForBrowse(creators, "rating").map((creator) => creator.creatorId)).toEqual(["C1", "C2"]);
    expect(sortCreatorsForBrowse(creators, "budget").map((creator) => creator.creatorId)).toEqual(["C1", "C2"]);
  });
});
