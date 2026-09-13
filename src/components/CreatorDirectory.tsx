import type { BrowseSortMode, Creator, FollowerSegment } from "../domain/types";

const numberFormatter = new Intl.NumberFormat("ko-KR");
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

const browseSortOptions: Array<{ value: BrowseSortMode; label: string }> = [
  { value: "followers", label: "팔로워 많은 순" },
  { value: "views", label: "평균 조회수 많은 순" },
  { value: "engagement", label: "참여율 높은 순" },
  { value: "rating", label: "광고주 평점 높은 순" },
  { value: "budget", label: "협업비 낮은 순" },
];

interface CreatorDirectoryProps {
  creators: Creator[];
  excludedRows: number;
  sortMode: BrowseSortMode;
  onSortChange: (mode: BrowseSortMode) => void;
}

function displayBudget(creator: Creator) {
  return creator.avgCampaignBudgetKrw === null
    ? "견적 확인 필요"
    : currencyFormatter.format(creator.avgCampaignBudgetKrw);
}

export function CreatorDirectory({
  creators,
  excludedRows,
  sortMode,
  onSortChange,
}: CreatorDirectoryProps) {
  return (
    <div className="directory-content">
      <header className="directory-heading">
        <div>
          <p className="eyebrow">ALL CREATORS</p>
          <h2>전체 크리에이터 {creators.length}명</h2>
          <p>추천 조건을 입력하기 전에도 주요 지표를 비교할 수 있어요.</p>
        </div>
        <label htmlFor="sort-directory">
          <span>전체 목록 정렬</span>
          <select
            id="sort-directory"
            value={sortMode}
            onChange={(event) => onSortChange(event.target.value as BrowseSortMode)}
          >
            {browseSortOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </header>

      {excludedRows > 0 && (
        <p className="data-warning" role="status">
          유효하지 않은 데이터 {excludedRows}건을 제외한 목록이에요.
        </p>
      )}

      <div className="directory-columns" aria-hidden="true">
        <span>크리에이터</span>
        <span>팔로워</span>
        <span>평균 조회수</span>
        <span>참여율</span>
        <span>평점</span>
        <span>평균 협업비</span>
      </div>
      <ol className="directory-list">
        {creators.map((creator, index) => (
          <li key={creator.creatorId}>
            <article aria-labelledby={`directory-${creator.creatorId}`}>
              <div className="directory-identity">
                <span className="directory-rank" aria-label={`목록 순서 ${index + 1}`}>
                  {String(index + 1).padStart(3, "0")}
                </span>
                <div>
                  <h3 id={`directory-${creator.creatorId}`}>{creator.creatorName}</h3>
                  <p>{creator.category} · {creator.platform} · {segmentLabels[creator.segment]}</p>
                </div>
              </div>
              <dl className="directory-metrics">
                <div><dt>팔로워</dt><dd>{numberFormatter.format(creator.followers)}명</dd></div>
                <div><dt>평균 조회수</dt><dd>{numberFormatter.format(creator.avgViewCount)}회</dd></div>
                <div><dt>참여율</dt><dd>{creator.engagementRate.toFixed(1)}%</dd></div>
                <div><dt>광고주 평점</dt><dd>{creator.advertiserRating === null ? "이력 없음" : `${creator.advertiserRating.toFixed(1)} / 5.0`}</dd></div>
                <div><dt>평균 협업비</dt><dd>{displayBudget(creator)}</dd></div>
              </dl>
            </article>
          </li>
        ))}
      </ol>
    </div>
  );
}
