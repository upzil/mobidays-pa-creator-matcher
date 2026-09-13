import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseCreatorsCsv } from "../data/creatorCsv";
import type { CampaignGoal, Category, Creator, FollowerSegment } from "../domain/types";
import { CAMPAIGN_GOAL_PROFILES } from "./goals";
import {
  getFollowerSegment,
  recommendCreators,
  sortRecommendations,
} from "./engine";

function creator(
  id: string,
  overrides: Partial<Creator> = {},
): Creator {
  const followers = overrides.followers ?? 8_000;
  return {
    creatorId: id,
    creatorName: `크리에이터 ${id}`,
    category: "게임",
    platform: "유튜브",
    followers,
    segment: getFollowerSegment(followers),
    avgViewCount: 2_000,
    engagementRate: 7,
    totalCampaignCount: 5,
    totalCampaignBudgetKrw: 1_500_000,
    avgCampaignBudgetKrw: 300_000,
    advertiserRating: 4.5,
    ...overrides,
  };
}

function query(
  budgetKrw: number | null,
  categories: Category[] = ["게임"],
  segment: FollowerSegment | null = "nano",
  goal: CampaignGoal = "balanced",
  desiredCreatorCount = 5,
) {
  return { budgetKrw, categories, segment, goal, desiredCreatorCount } as const;
}

describe("getFollowerSegment", () => {
  it.each([
    [9_999, "nano"],
    [10_000, "micro"],
    [99_999, "micro"],
    [100_000, "macro"],
  ] as const)("%i명을 %s로 분류한다", (followers, expected) => {
    expect(getFollowerSegment(followers)).toBe(expected);
  });
});

describe("recommendCreators", () => {
  it("필터를 모두 비우면 전체 후보에서 기본 인원만 추천한다", () => {
    const candidates = Array.from({ length: 8 }, (_, index) =>
      creator(`C${index + 1}`, {
        category: index % 2 === 0 ? "게임" : "교육",
        followers: index % 3 === 0 ? 20_000 : 8_000,
        segment: index % 3 === 0 ? "micro" : "nano",
      }),
    );

    const result = recommendCreators(
      candidates,
      query(null, [], null, "balanced", 5),
    );

    expect(result.outcome).toBe("exact");
    expect(result.sections.flatMap(({ items }) => items)).toHaveLength(5);
    expect(result.appliedQuery).toMatchObject({
      budgetKrw: null,
      categories: [],
      segment: null,
      desiredCreatorCount: 5,
    });
  });

  it("추천 인원은 우선순위가 높은 섹션부터 전체 합계로 제한한다", () => {
    const result = recommendCreators(
      [
        creator("KNOWN-1"),
        creator("KNOWN-2"),
        creator("NEW", {
          totalCampaignCount: 0,
          totalCampaignBudgetKrw: 0,
          avgCampaignBudgetKrw: null,
          advertiserRating: null,
        }),
      ],
      query(300_000, ["게임"], "nano", "balanced", 2),
    );

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].tier).toBe("exact");
    expect(result.sections[0].items).toHaveLength(2);
  });

  it("캠페인 목적에 따라 가중치와 추천 순위가 달라진다", () => {
    const candidates = [
      creator("REACH", {
        avgViewCount: 10_000,
        engagementRate: 2,
        advertiserRating: 3.5,
      }),
      creator("CONVERT", {
        avgViewCount: 1_000,
        engagementRate: 10,
        advertiserRating: 5,
      }),
    ];

    const awareness = recommendCreators(
      candidates,
      query(300_000, ["게임"], "nano", "awareness"),
    );
    const conversion = recommendCreators(
      candidates,
      query(300_000, ["게임"], "nano", "conversion"),
    );

    expect(awareness.sections[0].items[0].creator.creatorId).toBe("REACH");
    expect(conversion.sections[0].items[0].creator.creatorId).toBe("CONVERT");
    expect(awareness.sections[0].items[0].breakdown.views.weight).toBe(0.45);
    expect(conversion.sections[0].items[0].breakdown.rating.weight).toBe(0.3);
  });

  it("모든 캠페인 목적의 가중치 합이 100%다", () => {
    for (const profile of Object.values(CAMPAIGN_GOAL_PROFILES)) {
      expect(Object.values(profile.weights).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
    }
  });

  it("예산 equality와 복수 카테고리 OR를 정확 일치로 처리한다", () => {
    const creators = [
      creator("C1", { avgCampaignBudgetKrw: 300_000 }),
      creator("C2", { category: "뷰티", avgCampaignBudgetKrw: 300_000 }),
      creator("C3", { category: "여행", avgCampaignBudgetKrw: 100_000 }),
    ];
    const result = recommendCreators(creators, query(300_000, ["게임", "뷰티"]));

    expect(result.outcome).toBe("exact");
    expect(result.sections[0].items.map(({ creator }) => creator.creatorId).sort()).toEqual([
      "C1",
      "C2",
    ]);
  });

  it("정확 후보와 비용 미상 후보를 서로 다른 섹션으로 반환한다", () => {
    const result = recommendCreators(
      [
        creator("KNOWN"),
        creator("NEW", {
          totalCampaignCount: 0,
          totalCampaignBudgetKrw: 0,
          avgCampaignBudgetKrw: null,
          advertiserRating: null,
        }),
      ],
      query(300_000),
    );

    expect(result.sections.map(({ tier }) => tier)).toEqual(["exact", "exploration"]);
    const exploration = result.sections[1].items[0];
    expect(exploration.breakdown.rating.normalizedValue).toBe(0.5);
    expect(exploration.breakdown.budgetEfficiency.normalizedValue).toBe(0.5);
    expect(exploration.warnings.join(" ")).toContain("직접 확인");
  });

  it("예산 120% 경계를 포함하고 1원 초과 후보는 제외한다", () => {
    const result = recommendCreators(
      [
        creator("IN", { avgCampaignBudgetKrw: 120 }),
        creator("OUT", { avgCampaignBudgetKrw: 121 }),
      ],
      query(100),
    );

    expect(result.outcome).toBe("budget-relaxed");
    expect(result.sections[0].items.map(({ creator }) => creator.creatorId)).toEqual(["IN"]);
  });

  it("예산 완화가 없으면 인접 규모를 사용하고 카테고리를 유지한다", () => {
    const result = recommendCreators(
      [
        creator("NANO", { followers: 8_000, segment: "nano", avgCampaignBudgetKrw: 500_000 }),
        creator("MACRO", { followers: 100_000, segment: "macro", avgCampaignBudgetKrw: 500_000 }),
        creator("OTHER", { category: "여행", followers: 8_000, segment: "nano", avgCampaignBudgetKrw: 100_000 }),
      ],
      query(500_000, ["게임"], "micro"),
    );

    expect(result.outcome).toBe("segment-relaxed");
    expect(result.sections.map(({ segment }) => segment)).toEqual(["nano", "macro"]);
    expect(result.sections.flatMap(({ items }) => items).map(({ creator }) => creator.creatorId)).not.toContain("OTHER");
    expect(result.sections[0].items[0].warnings[0]).toContain("마이크로 규모 대신 나노");
  });

  it("모든 fallback이 없으면 empty를 반환한다", () => {
    const result = recommendCreators(
      [creator("TRAVEL", { category: "여행" })],
      query(1, ["게임"]),
    );

    expect(result.outcome).toBe("empty");
    expect(result.sections).toEqual([]);
    expect(result.attemptedRelaxations).toHaveLength(3);
  });

  it("입력 순서와 반복 실행에 무관하며 원본을 변경하지 않는다", () => {
    const creators = [creator("C2", { engagementRate: 8 }), creator("C1", { engagementRate: 8 })];
    const snapshot = structuredClone(creators);
    const forward = recommendCreators(creators, query(300_000));
    const reverse = recommendCreators([...creators].reverse(), query(300_000));

    expect(forward.sections[0].items.map(({ creator }) => creator.creatorId)).toEqual([
      "C1",
      "C2",
    ]);
    expect(reverse.sections[0].items.map(({ creator }) => creator.creatorId)).toEqual([
      "C1",
      "C2",
    ]);
    expect(creators).toEqual(snapshot);
  });

  it("실제 CSV worked example 결과를 재현한다", () => {
    const creators = parseCreatorsCsv(
      readFileSync("public/data/dummy_creators.csv", "utf8"),
    ).creators;

    const exact = recommendCreators(creators, query(300_000));
    expect(exact.sections[0].items.slice(0, 3).map((item) => [item.creator.creatorId, item.score])).toEqual([
      ["C0071", 78.9],
      ["C0080", 65.2],
      ["C0165", 46.2],
    ]);

    const exploration = recommendCreators(creators, query(100_000, ["패션"]));
    expect(exploration.outcome).toBe("exploration");
    expect(exploration.sections[0].items[0]).toMatchObject({
      creator: { creatorId: "C0011" },
      score: 45.7,
    });

    const relaxed = recommendCreators(creators, query(600_000, ["게임"], "macro"));
    expect(relaxed.outcome).toBe("segment-relaxed");
    expect(relaxed.sections[0].items.slice(0, 2).map((item) => [item.creator.creatorId, item.score])).toEqual([
      ["C0002", 52.4],
      ["C0014", 48],
    ]);
  });
});

describe("sortRecommendations", () => {
  it("평점과 비용 미상은 해당 정렬의 마지막에 두고 입력 배열을 변경하지 않는다", () => {
    const result = recommendCreators(
      [
        creator("KNOWN"),
        creator("NEW", {
          totalCampaignCount: 0,
          totalCampaignBudgetKrw: 0,
          avgCampaignBudgetKrw: null,
          advertiserRating: null,
        }),
      ],
      query(300_000),
    );
    const items = result.sections.flatMap(({ items }) => items);
    const original = [...items];

    expect(sortRecommendations(items, "rating").at(-1)?.creator.creatorId).toBe("NEW");
    expect(sortRecommendations(items, "budget").at(-1)?.creator.creatorId).toBe("NEW");
    expect(items).toEqual(original);
  });
});
