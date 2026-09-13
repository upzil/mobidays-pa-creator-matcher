import type {
  BrowseSortMode,
  Creator,
  RecommendationResult,
  RecommendationSection,
  SortMode,
} from "../domain/types";
import { CreatorDirectory } from "./CreatorDirectory";
import { CreatorCard } from "./CreatorCard";

const sortOptions: Array<{ value: SortMode; label: string }> = [
  { value: "recommended", label: "추천순" },
  { value: "engagement", label: "참여율순" },
  { value: "views", label: "평균 조회수순" },
  { value: "rating", label: "광고주 평점순" },
  { value: "budget", label: "협업비 낮은 순" },
];

const currencyFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

const sectionCopy: Record<RecommendationSection["tier"], { title: string; description: string }> = {
  exact: {
    title: "조건에 맞는 추천",
    description: "선택한 필터와 캠페인 목적을 기준으로 우선순위를 계산했어요.",
  },
  exploration: {
    title: "함께 살펴볼 탐색 후보",
    description: "카테고리와 규모는 맞지만 협업 이력이 없어 비용과 만족도 확인이 필요해요.",
  },
  "segment-relaxed": {
    title: "규모를 넓힌 대안",
    description: "예산 조건과 카테고리는 유지하고 인접한 팔로워 규모까지 살펴봤어요.",
  },
};

interface ResultsPanelProps {
  creators: Creator[];
  result: RecommendationResult | null;
  sections: RecommendationSection[];
  excludedRows: number;
  browseSortMode: BrowseSortMode;
  sortMode: SortMode;
  onBrowseSortChange: (mode: BrowseSortMode) => void;
  onSortChange: (mode: SortMode) => void;
  onFocusBudget: () => void;
  onFocusCategories: () => void;
  onFocusPlatform: () => void;
  onFocusSegment: () => void;
}

export function ResultsPanel({
  creators,
  result,
  sections,
  excludedRows,
  browseSortMode,
  sortMode,
  onBrowseSortChange,
  onSortChange,
  onFocusBudget,
  onFocusCategories,
  onFocusPlatform,
  onFocusSegment,
}: ResultsPanelProps) {
  if (!result) {
    return (
      <CreatorDirectory
        creators={creators}
        excludedRows={excludedRows}
        sortMode={browseSortMode}
        onSortChange={onBrowseSortChange}
      />
    );
  }

  const itemCount = sections.reduce((count, section) => count + section.items.length, 0);
  const recommendedIds = new Set(
    sections.flatMap((section) => section.items.map((item) => item.creator.creatorId)),
  );
  const remainingCreators = creators.filter(
    (creator) => !recommendedIds.has(creator.creatorId),
  );
  const selectedItems = sections.flatMap((section) => section.items);
  const selectedCosts = selectedItems.map((item) => item.creator.avgCampaignBudgetKrw);
  const knownSelectedCosts = selectedCosts.filter((cost): cost is number => cost !== null);
  const hasOnlyKnownCosts = knownSelectedCosts.length === selectedCosts.length;
  const usedBudgetKrw = hasOnlyKnownCosts
    ? knownSelectedCosts.reduce((sum, cost) => sum + cost, 0)
    : null;
  const budgetStatus = (() => {
    if (result.appliedQuery.totalBudgetKrw !== null && usedBudgetKrw !== null) {
      return {
        primaryLabel: "예상 집행액",
        primaryValue: currencyFormatter.format(usedBudgetKrw),
        secondaryLabel: "잔여 예산",
        secondaryValue: currencyFormatter.format(
          Math.max(0, result.appliedQuery.totalBudgetKrw - usedBudgetKrw),
        ),
      };
    }
    if (result.appliedQuery.perCreatorBudgetKrw !== null && hasOnlyKnownCosts) {
      return {
        primaryLabel: "1인당 예산 상한",
        primaryValue: currencyFormatter.format(result.appliedQuery.perCreatorBudgetKrw),
        secondaryLabel: "후보 중 최고 예상 협업비",
        secondaryValue: currencyFormatter.format(Math.max(...knownSelectedCosts)),
      };
    }
    return null;
  })();

  return (
    <div className="results-content">
      {excludedRows > 0 && (
        <p className="data-warning" role="status">
          유효하지 않은 데이터 {excludedRows}건을 제외하고 계산했어요.
        </p>
      )}

      {itemCount > 0 ? (
        <>
          {sections.map((section, sectionIndex) => {
            const sectionId = `${section.tier}-${section.segment ?? "all"}`;
            return (
            <section className="result-section" key={sectionId} aria-labelledby={`section-${sectionId}`}>
              <header className="section-heading">
                <div>
                  <h3 id={`section-${sectionId}`}>{sectionCopy[section.tier].title}</h3>
                </div>
                <div className="section-heading-actions">
                  <span>{section.items.length}명</span>
                  {sectionIndex === 0 && (
                    <label htmlFor="sort-results">
                      <span className="sr-only">결과 정렬</span>
                      <select
                        id="sort-results"
                        aria-label="결과 정렬"
                        value={sortMode}
                        onChange={(event) => onSortChange(event.target.value as SortMode)}
                      >
                        {sortOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </header>
              <p className="section-description">{sectionCopy[section.tier].description}</p>
              {sectionIndex === 0 && budgetStatus && (
                <dl className="budget-status" aria-label="예산 계획 현황">
                  <div>
                    <dt>{budgetStatus.primaryLabel}</dt>
                    <dd>{budgetStatus.primaryValue}</dd>
                  </div>
                  <div>
                    <dt>{budgetStatus.secondaryLabel}</dt>
                    <dd>{budgetStatus.secondaryValue}</dd>
                  </div>
                </dl>
              )}
              <div className="creator-grid">
                {section.items.map((item, index) => (
                  <CreatorCard item={item} rank={index + 1} key={item.creator.creatorId} />
                ))}
              </div>
            </section>
          )})}

          {remainingCreators.length > 0 && (
            <CreatorDirectory
              creators={remainingCreators}
              excludedRows={0}
              sortMode={browseSortMode}
              onSortChange={onBrowseSortChange}
              heading="그 외 크리에이터"
              description="추천 후보를 상단에 배치했어요. 나머지 전체 목록도 기본 지표로 계속 비교할 수 있어요."
            />
          )}
        </>
      ) : (
        <>
          <section className="empty-state" aria-labelledby="empty-title">
            <h3 id="empty-title">조건에 맞는 추천 후보를 찾지 못했어요.</h3>
            <p>{result.diagnostics[0] ?? "예산을 높이거나 크리에이터 규모 또는 카테고리를 바꿔 다시 찾아보세요."}</p>
            <div className="recovery-actions" aria-label="조건 수정 바로가기">
              <button type="button" onClick={onFocusBudget}>예산 조정하기</button>
              <button type="button" onClick={onFocusSegment}>규모 바꾸기</button>
              <button type="button" onClick={onFocusPlatform}>플랫폼 바꾸기</button>
              <button type="button" onClick={onFocusCategories}>카테고리 수정하기</button>
            </div>
          </section>
          <CreatorDirectory
            creators={creators}
            excludedRows={0}
            sortMode={browseSortMode}
            onSortChange={onBrowseSortChange}
            heading="전체 크리에이터"
            description="조건에 맞는 추천 후보는 없지만 전체 목록은 계속 탐색할 수 있어요."
          />
        </>
      )}
    </div>
  );
}
