import type { RecommendedCreator } from "../domain/types";

const numberFormatter = new Intl.NumberFormat("ko-KR");
const currencyFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

const tierLabels = {
  exact: "조건 일치",
  exploration: "비용 확인 필요",
  "segment-relaxed": "규모 대안",
} as const;

interface CreatorCardProps {
  item: RecommendedCreator;
  rank: number;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function CreatorCard({ item, rank }: CreatorCardProps) {
  const { creator } = item;
  const scoreLabel = `${item.score.toFixed(1)}점`;

  return (
    <article className={`creator-card tier-${item.tier}`} aria-labelledby={`creator-${creator.creatorId}`}>
      <header className="creator-card-header">
        <div className="creator-identity">
          <span className="rank" aria-label={`목록 순서 ${rank}`}>{String(rank).padStart(2, "0")}</span>
          <div>
            <p className="creator-meta">{creator.category} · {creator.platform}</p>
            <h4 id={`creator-${creator.creatorId}`}>{creator.creatorName}</h4>
          </div>
        </div>
        <div className="score-block" aria-label={`추천 점수 ${scoreLabel}`}>
          <strong>{scoreLabel}</strong>
          <span>{tierLabels[item.tier]}</span>
        </div>
      </header>

      <dl className="metric-grid">
        <Metric label="팔로워" value={`${numberFormatter.format(creator.followers)}명`} />
        <Metric label="평균 조회수" value={`${numberFormatter.format(creator.avgViewCount)}회`} />
        <Metric label="참여율" value={`${creator.engagementRate.toFixed(1)}%`} />
        <Metric label="광고주 평점" value={creator.advertiserRating === null ? "이력 없음" : `${creator.advertiserRating.toFixed(1)} / 5.0`} />
        <Metric label="진행한 캠페인" value={`${numberFormatter.format(creator.totalCampaignCount)}회`} />
        <Metric
          label="평균 협업비"
          value={creator.avgCampaignBudgetKrw === null ? "견적 확인 필요" : currencyFormatter.format(creator.avgCampaignBudgetKrw)}
        />
      </dl>

      <div className="reason-block">
        <h5>추천 근거</h5>
        <ul>
          {item.reasons.slice(0, 3).map((reason) => (
            <li key={reason.code}>{reason.message}</li>
          ))}
        </ul>
      </div>

      {item.warnings.length > 0 && (
        <div className="warning-block" role="note">
          <strong>확인 필요</strong>
          <ul>
            {item.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}
    </article>
  );
}
