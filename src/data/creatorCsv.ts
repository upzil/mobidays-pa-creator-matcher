import Papa from "papaparse";

import {
  CATEGORIES,
  PLATFORMS,
  type Category,
  type Creator,
  type ParseDiagnostic,
  type ParsedCreators,
  type Platform,
  type RawCreatorRow,
} from "../domain/types";
import { getFollowerSegment } from "../recommendation/engine";

const REQUIRED_HEADERS = [
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
] as const satisfies readonly (keyof RawCreatorRow)[];

const CATEGORY_SET = new Set<string>(CATEGORIES);
const PLATFORM_SET = new Set<string>(PLATFORMS);

function fatal(message: string): never {
  throw new Error(`크리에이터 CSV를 사용할 수 없습니다: ${message}`);
}

function parseSafeInteger(
  value: string,
  field: keyof RawCreatorRow,
  minimum: number,
): number {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${field} 값이 정수가 아닙니다.`);
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${field} 값이 허용 범위를 벗어났습니다.`);
  }
  return parsed;
}

function parseFiniteNumber(
  value: string,
  field: keyof RawCreatorRow,
  minimum: number,
  maximum: number,
): number {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new Error(`${field} 값이 비어 있습니다.`);
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${field} 값이 허용 범위를 벗어났습니다.`);
  }
  return parsed;
}

function requireText(value: string, field: keyof RawCreatorRow): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} 값이 비어 있습니다.`);
  }
  return trimmed;
}

function parseRow(raw: RawCreatorRow): Creator {
  const creatorId = requireText(raw.creator_id, "creator_id");
  const creatorName = requireText(raw.creator_name, "creator_name");
  const categoryText = requireText(raw.category, "category");
  const platformText = requireText(raw.platform, "platform");

  if (!CATEGORY_SET.has(categoryText)) {
    throw new Error(`category 값 '${categoryText}'은 지원하지 않습니다.`);
  }
  if (!PLATFORM_SET.has(platformText)) {
    throw new Error(`platform 값 '${platformText}'은 지원하지 않습니다.`);
  }

  const followers = parseSafeInteger(raw.followers, "followers", 1);
  const avgViewCount = parseSafeInteger(raw.avg_view_count, "avg_view_count", 0);
  const engagementRate = parseFiniteNumber(
    raw.engagement_rate,
    "engagement_rate",
    0,
    100,
  );
  const totalCampaignCount = parseSafeInteger(
    raw.total_campaign_count,
    "total_campaign_count",
    0,
  );
  const totalCampaignBudgetKrw = parseSafeInteger(
    raw.total_campaign_budget_krw,
    "total_campaign_budget_krw",
    0,
  );
  const rawAverageBudget = parseSafeInteger(
    raw.avg_campaign_budget_krw,
    "avg_campaign_budget_krw",
    0,
  );
  const ratingText = raw.advertiser_rating.trim();

  let avgCampaignBudgetKrw: number | null;
  let advertiserRating: number | null;

  if (totalCampaignCount === 0) {
    if (totalCampaignBudgetKrw !== 0 || rawAverageBudget !== 0 || ratingText !== "") {
      throw new Error(
        "캠페인 이력 0건은 총예산·평균예산 0원 및 평점 공란이어야 합니다.",
      );
    }
    avgCampaignBudgetKrw = null;
    advertiserRating = null;
  } else {
    if (totalCampaignBudgetKrw <= 0 || rawAverageBudget <= 0 || ratingText === "") {
      throw new Error(
        "캠페인 이력이 있으면 총예산·평균예산·광고주 평점이 모두 있어야 합니다.",
      );
    }
    avgCampaignBudgetKrw = rawAverageBudget;
    advertiserRating = parseFiniteNumber(
      ratingText,
      "advertiser_rating",
      1,
      5,
    );
  }

  return {
    creatorId,
    creatorName,
    category: categoryText as Category,
    platform: platformText as Platform,
    followers,
    segment: getFollowerSegment(followers),
    avgViewCount,
    engagementRate,
    totalCampaignCount,
    totalCampaignBudgetKrw,
    avgCampaignBudgetKrw,
    advertiserRating,
  };
}

export function parseCreatorsCsv(csvText: string): ParsedCreators {
  const normalizedText = csvText.startsWith("\uFEFF") ? csvText.slice(1) : csvText;
  const parsed = Papa.parse<string[]>(normalizedText, {
    skipEmptyLines: "greedy",
  });

  if (parsed.data.length === 0) {
    return fatal("헤더가 없습니다.");
  }

  const headers = parsed.data[0].map((header) => header.trim());
  const duplicateHeaders = headers.filter(
    (header, index) => headers.indexOf(header) !== index,
  );
  if (duplicateHeaders.length > 0) {
    return fatal(`중복 헤더가 있습니다: ${[...new Set(duplicateHeaders)].join(", ")}`);
  }

  const missingHeaders = REQUIRED_HEADERS.filter(
    (header) => !headers.includes(header),
  );
  if (missingHeaders.length > 0) {
    return fatal(`필수 헤더가 없습니다: ${missingHeaders.join(", ")}`);
  }

  const indexes = Object.fromEntries(
    REQUIRED_HEADERS.map((header) => [header, headers.indexOf(header)]),
  ) as Record<keyof RawCreatorRow, number>;
  const parseErrorRows = new Map<number, string[]>();

  for (const error of parsed.errors) {
    const dataRowIndex = (error.row ?? 0) - 1;
    const messages = parseErrorRows.get(dataRowIndex) ?? [];
    messages.push(error.message);
    parseErrorRows.set(dataRowIndex, messages);
  }

  if (parseErrorRows.has(-1)) {
    return fatal(`헤더를 해석할 수 없습니다: ${parseErrorRows.get(-1)?.join("; ")}`);
  }

  const creators: Creator[] = [];
  const diagnostics: ParseDiagnostic[] = [];
  const seenCreatorIds = new Set<string>();

  parsed.data.slice(1).forEach((columns, dataRowIndex) => {
    const rowNumber = dataRowIndex + 2;
    const syntaxErrors = parseErrorRows.get(dataRowIndex);
    if (syntaxErrors) {
      diagnostics.push({
        row: rowNumber,
        code: "csv-syntax",
        message: syntaxErrors.join("; "),
      });
      return;
    }

    const raw = Object.fromEntries(
      REQUIRED_HEADERS.map((header) => [header, columns[indexes[header]] ?? ""]),
    ) as unknown as RawCreatorRow;

    try {
      const creator = parseRow(raw);
      if (seenCreatorIds.has(creator.creatorId)) {
        diagnostics.push({
          row: rowNumber,
          code: "duplicate-creator-id",
          message: `creator_id '${creator.creatorId}'의 최초 행만 유지했습니다.`,
        });
        return;
      }
      seenCreatorIds.add(creator.creatorId);
      creators.push(creator);
    } catch (error) {
      diagnostics.push({
        row: rowNumber,
        code: "invalid-row",
        message: error instanceof Error ? error.message : "행을 해석할 수 없습니다.",
      });
    }
  });

  if (creators.length === 0) {
    return fatal("유효한 데이터 행이 없습니다.");
  }

  return { creators, diagnostics };
}

export async function loadCreators(signal?: AbortSignal): Promise<ParsedCreators> {
  const response = await fetch("/data/dummy_creators.csv", { signal });
  if (!response.ok) {
    throw new Error(
      `크리에이터 데이터를 불러오지 못했습니다. (HTTP ${response.status})`,
    );
  }
  return parseCreatorsCsv(await response.text());
}
