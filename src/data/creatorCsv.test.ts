import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseCreatorsCsv } from "./creatorCsv";

const headers = [
  "creator_id",
  "creator_name",
  "category",
  "platform",
  "followers",
  "avg_view_count",
  "engagement_rate",
  "total_campaign_count",
  "total_campaign_budget_krw",
  "avg_campaign_budget_krw",
  "advertiser_rating",
].join(",");

const validRow = "C9001,테스트채널,게임,유튜브,9999,1200,7.5,3,900000,300000,4.7";

describe("parseCreatorsCsv", () => {
  it("BOM과 CRLF가 있는 원본 200행을 손실 없이 파싱한다", () => {
    const csv = readFileSync("public/data/dummy_creators.csv", "utf8");
    const result = parseCreatorsCsv(csv);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(result.creators).toHaveLength(200);
    expect(result.diagnostics).toEqual([]);
    expect(result.creators[0]).toMatchObject({
      creatorId: "C0001",
      creatorName: "시우로그1",
      category: "뷰티",
      segment: "micro",
    });
  });

  it("캠페인 이력이 없는 0원과 공란을 null로 변환한다", () => {
    const csv = `\uFEFF${headers}\r\nC9002,신규채널,패션,인스타그램,5646,1486,7.5,0,0,0,\r\n`;
    const [creator] = parseCreatorsCsv(csv).creators;

    expect(creator.avgCampaignBudgetKrw).toBeNull();
    expect(creator.advertiserRating).toBeNull();
  });

  it("잘못된 행과 후속 중복 ID를 격리하고 최초 유효 행을 유지한다", () => {
    const invalidRow = "C9002,오류채널,게임,유튜브,-1,1200,7.5,3,900000,300000,4.7";
    const duplicateRow = "C9001,중복채널,게임,유튜브,12000,1200,7.5,3,900000,300000,4.7";
    const result = parseCreatorsCsv(
      [headers, validRow, invalidRow, duplicateRow].join("\n"),
    );

    expect(result.creators.map(({ creatorId }) => creatorId)).toEqual(["C9001"]);
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "invalid-row",
      "duplicate-creator-id",
    ]);
  });

  it("필수 헤더 누락과 유효 행 0건은 치명적 오류로 처리한다", () => {
    expect(() => parseCreatorsCsv("creator_id,creator_name\nC1,이름")).toThrow(
      "필수 헤더",
    );
    expect(() =>
      parseCreatorsCsv([headers, validRow.replace(",9999,", ",-1,")].join("\n")),
    ).toThrow("유효한 데이터 행이 없습니다");
  });
});
