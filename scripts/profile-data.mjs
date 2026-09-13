import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sourcePath = resolve(
  process.argv[2] ?? "public/data/dummy_creators.csv",
);

const expectedHeaders = [
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
];

const integerFields = [
  "followers",
  "avg_view_count",
  "total_campaign_count",
  "total_campaign_budget_krw",
  "avg_campaign_budget_krw",
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value !== "" || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function parseInteger(value, field, rowNumber) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${rowNumber}행 ${field}: 음수가 아닌 정수가 아닙니다.`);
  }
  return Number(value);
}

function parseDecimal(value, field, rowNumber) {
  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    throw new Error(`${rowNumber}행 ${field}: 음수가 아닌 숫자가 아닙니다.`);
  }
  return Number(value);
}

function segmentOf(followers) {
  if (followers < 10_000) return "nano";
  if (followers < 100_000) return "micro";
  return "macro";
}

function countBy(values) {
  return Object.fromEntries(
    [...new Set(values)]
      .sort((left, right) => left.localeCompare(right, "ko"))
      .map((value) => [value, values.filter((candidate) => candidate === value).length]),
  );
}

function describe(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];

  return {
    min: sorted[0],
    median,
    max: sorted.at(-1),
  };
}

const csv = readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, "");
const [headers, ...rawRows] = parseCsv(csv);

if (headers.join("\u0000") !== expectedHeaders.join("\u0000")) {
  throw new Error(`CSV 헤더가 예상 스키마와 다릅니다: ${headers.join(", ")}`);
}

const creators = rawRows.map((values, rowIndex) => {
  const rowNumber = rowIndex + 2;
  if (values.length !== expectedHeaders.length) {
    throw new Error(`${rowNumber}행: 열이 ${values.length}개입니다.`);
  }

  const raw = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  const parsedIntegers = Object.fromEntries(
    integerFields.map((field) => [field, parseInteger(raw[field], field, rowNumber)]),
  );
  const engagementRate = parseDecimal(raw.engagement_rate, "engagement_rate", rowNumber);
  const advertiserRating =
    raw.advertiser_rating === ""
      ? null
      : parseDecimal(raw.advertiser_rating, "advertiser_rating", rowNumber);

  if (!raw.creator_id || !raw.creator_name || !raw.category || !raw.platform) {
    throw new Error(`${rowNumber}행: 필수 텍스트 값이 비어 있습니다.`);
  }
  if (engagementRate > 100) {
    throw new Error(`${rowNumber}행: 참여율이 100%를 초과합니다.`);
  }
  if (advertiserRating !== null && (advertiserRating < 1 || advertiserRating > 5)) {
    throw new Error(`${rowNumber}행: 평점이 1~5 범위를 벗어납니다.`);
  }

  return {
    creatorId: raw.creator_id,
    creatorName: raw.creator_name,
    category: raw.category,
    platform: raw.platform,
    ...parsedIntegers,
    engagementRate,
    advertiserRating,
    segment: segmentOf(parsedIntegers.followers),
  };
});

const duplicateIds = creators
  .map((creator) => creator.creatorId)
  .filter((id, index, values) => values.indexOf(id) !== index);
const duplicateNames = creators
  .map((creator) => creator.creatorName)
  .filter((name, index, values) => values.indexOf(name) !== index);
const noHistory = creators.filter((creator) => creator.total_campaign_count === 0);
const invalidNoHistory = noHistory.filter(
  (creator) =>
    creator.advertiserRating !== null ||
    creator.total_campaign_budget_krw !== 0 ||
    creator.avg_campaign_budget_krw !== 0,
);

const report = {
  source: sourcePath,
  rows: creators.length,
  columns: headers.length,
  categories: countBy(creators.map((creator) => creator.category)),
  platforms: countBy(creators.map((creator) => creator.platform)),
  segments: countBy(creators.map((creator) => creator.segment)),
  missingAdvertiserRatings: creators.filter(
    (creator) => creator.advertiserRating === null,
  ).length,
  zeroHistoryCreators: noHistory.length,
  duplicateIds: [...new Set(duplicateIds)],
  duplicateNames: [...new Set(duplicateNames)],
  invalidNoHistoryRows: invalidNoHistory.map((creator) => creator.creatorId),
  ranges: {
    followers: describe(creators.map((creator) => creator.followers)),
    averageViews: describe(creators.map((creator) => creator.avg_view_count)),
    engagementRate: describe(creators.map((creator) => creator.engagementRate)),
    campaignCount: describe(creators.map((creator) => creator.total_campaign_count)),
    averageCampaignBudget: describe(
      creators.map((creator) => creator.avg_campaign_budget_krw),
    ),
    knownAdvertiserRating: describe(
      creators
        .map((creator) => creator.advertiserRating)
        .filter((rating) => rating !== null),
    ),
  },
};

console.log(JSON.stringify(report, null, 2));
