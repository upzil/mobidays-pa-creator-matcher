import type {
  BrowseSortMode,
  Creator,
  FollowerSegment,
  RecommendationResult,
  RecommendationSection,
  SortMode,
} from "../domain/types";
import { CreatorDirectory } from "./CreatorDirectory";
import { CreatorCard } from "./CreatorCard";

const currencyFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

const segmentLabels: Record<FollowerSegment, string> = {
  nano: "나노",
  micro: "마이크로",
  macro: "매크로",
};

const sortOptions: Array<{ value: SortMode; label: string }> = [
  { value: "recommended", label: "추천순" },
  { value: "engagement", label: "참여율순" },
  { value: "views", label: "평균 조회수순" },
  { value: "rating", label: "광고주 평점순" },
  { value: "budget", label: "협업비 낮은 순" },
];

const sectionCopy: Record<RecommendationSection["tier"], { title: string; description: string }> = {
  exact: {
    title: "조건에 맞는 추천",
    description: "카테고리와 규모가 일치하고, 과거 평균 협업비가 예산 안에 있는 후보예요.",
  },
  exploration: {
    title: "함께 살펴볼 탐색 후보",
    description: "카테고리와 규모는 맞지만 협업 이력이 없어 비용과 만족도 확인이 필요해요.",
  },
  "budget-relaxed": {
    title: "예산을 조금 넓힌 대안",
    description: "정확한 후보가 없어, 입력 예산보다 최대 20% 높은 같은 카테고리·규모 후보를 찾았어요.",
  },
  "segment-relaxed": {
    title: "규모를 넓힌 대안",
    description: "예산 안에서 찾기 위해 카테고리는 유지하고 인접한 팔로워 규모까지 살펴봤어요.",
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

  return (
    <div className="results-content">
      <div className="applied-summary">
        <div>
          <p className="eyebrow">APPLIED CONDITIONS</p>
          <h2>{itemCount > 0 ? `${itemCount}명의 후보를 찾았어요` : "조건에 맞는 후보가 없어요"}</h2>
        </div>
        <dl>
          <div><dt>예산</dt><dd>{currencyFormatter.format(result.appliedQuery.budgetKrw)}</dd></div>
          <div><dt>카테고리</dt><dd>{result.appliedQuery.categories.join(", ")}</dd></div>
          <div><dt>규모</dt><dd>{segmentLabels[result.appliedQuery.segment]}</dd></div>
        </dl>
        <button type="button" className="text-button" onClick={onFocusBudget}>조건 수정</button>
      </div>

      {excludedRows > 0 && (
        <p className="data-warning" role="status">
          유효하지 않은 데이터 {excludedRows}건을 제외하고 계산했어요.
        </p>
      )}

      {itemCount > 0 ? (
        <>
          <div className="results-toolbar">
            <p>점수는 같은 팔로워 규모 안에서 성과를 비교한 값이에요.</p>
            <label htmlFor="sort-results">
              <span>결과 정렬</span>
              <select
                id="sort-results"
                value={sortMode}
                onChange={(event) => onSortChange(event.target.value as SortMode)}
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          {sections.map((section) => {
            const sectionId = `${section.tier}-${section.segment ?? "all"}`;
            return (
            <section className="result-section" key={sectionId} aria-labelledby={`section-${sectionId}`}>
              <header className="section-heading">
                <div>
                  <p className="eyebrow">{section.tier.replace("-", " ").toUpperCase()}</p>
                  <h3 id={`section-${sectionId}`}>{sectionCopy[section.tier].title}{section.segment ? ` · ${segmentLabels[section.segment]}` : ""}</h3>
                </div>
                <span>{section.items.length}명</span>
              </header>
              <p className="section-description">{sectionCopy[section.tier].description}</p>
              <div className="creator-grid">
                {section.items.map((item, index) => (
                  <CreatorCard item={item} rank={index + 1} key={item.creator.creatorId} />
                ))}
              </div>
            </section>
          )})}
        </>
      ) : (
        <section className="empty-state" aria-labelledby="empty-title">
          <p className="eyebrow">NO AVAILABLE MATCH</p>
          <h3 id="empty-title">카테고리를 유지한 대안도 찾지 못했어요.</h3>
          <p>{result.diagnostics[0] ?? "예산을 높이거나 크리에이터 규모 또는 카테고리를 바꿔 다시 찾아보세요."}</p>
          <div className="recovery-actions" aria-label="조건 수정 바로가기">
            <button type="button" onClick={onFocusBudget}>예산 조정하기</button>
            <button type="button" onClick={onFocusSegment}>규모 바꾸기</button>
            <button type="button" onClick={onFocusCategories}>카테고리 수정하기</button>
          </div>
        </section>
      )}
    </div>
  );
}
