import type { BrowseSortMode, Creator } from "../domain/types";

function compareNullable(
  left: number | null,
  right: number | null,
  direction: "ascending" | "descending",
): number {
  if (left === null && right !== null) return 1;
  if (left !== null && right === null) return -1;
  if (left === null || right === null) return 0;
  return direction === "ascending" ? left - right : right - left;
}

export function sortCreatorsForBrowse(
  creators: readonly Creator[],
  mode: BrowseSortMode,
): Creator[] {
  return [...creators].sort((left, right) => {
    let compared = 0;

    if (mode === "followers") compared = right.followers - left.followers;
    if (mode === "views") compared = right.avgViewCount - left.avgViewCount;
    if (mode === "engagement") compared = right.engagementRate - left.engagementRate;
    if (mode === "rating") {
      compared = compareNullable(left.advertiserRating, right.advertiserRating, "descending");
    }
    if (mode === "budget") {
      compared = compareNullable(left.avgCampaignBudgetKrw, right.avgCampaignBudgetKrw, "ascending");
    }

    return compared || left.creatorId.localeCompare(right.creatorId);
  });
}
