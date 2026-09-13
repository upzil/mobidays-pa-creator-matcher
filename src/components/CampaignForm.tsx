import type { FormEvent, RefObject } from "react";
import {
  CATEGORIES,
  PLATFORMS,
  type Category,
  type FollowerSegment,
  type Platform,
} from "../domain/types";
import { getCampaignGoalProfile } from "../recommendation/goals";

export interface CampaignDraft {
  budgetManwon: string;
  categories: Category[];
  platform: Platform | "";
  segment: FollowerSegment | "";
  goalPosition: number;
  desiredCreatorCount: string;
}

export interface FormErrors {
  budget?: string;
  desiredCreatorCount?: string;
  countOrBudget?: string;
}

interface CampaignFormProps {
  draft: CampaignDraft;
  errors: FormErrors;
  isDirty: boolean;
  disabled: boolean;
  budgetRef: RefObject<HTMLInputElement | null>;
  desiredCreatorCountRef: RefObject<HTMLInputElement | null>;
  categoryRef: RefObject<HTMLElement | null>;
  platformRef: RefObject<HTMLSelectElement | null>;
  segmentRef: RefObject<HTMLSelectElement | null>;
  goalRef: RefObject<HTMLInputElement | null>;
  onBudgetChange: (value: string) => void;
  onDesiredCreatorCountChange: (value: string) => void;
  onCategoryChange: (category: Category, checked: boolean) => void;
  onPlatformChange: (platform: Platform | "") => void;
  onSegmentChange: (segment: FollowerSegment | "") => void;
  onGoalChange: (goalPosition: number) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const segmentOptions: Array<{
  value: FollowerSegment;
  label: string;
  range: string;
}> = [
  { value: "nano", label: "나노", range: "1만 명 미만" },
  { value: "micro", label: "마이크로", range: "1만–9만 9,999명" },
  { value: "macro", label: "매크로", range: "10만 명 이상" },
];

const formatBudget = (value: string) => {
  if (value === "") return "비우려면 추천 인원을 입력해 주세요.";
  if (!/^\d+$/.test(value) || Number(value) <= 0) return "금액을 확인해 주세요.";
  const totalManwon = new Intl.NumberFormat("ko-KR").format(Number(value));
  return `총 ${totalManwon}만원 안에서 가장 적합한 조합을 찾아요.`;
};

function categorySummary(categories: readonly Category[]): string {
  if (categories.length === 0) return "전체 카테고리";
  if (categories.length <= 2) return categories.join(", ");
  return `${categories[0]} 외 ${categories.length - 1}개`;
}

export function CampaignForm({
  draft,
  errors,
  isDirty,
  disabled,
  budgetRef,
  desiredCreatorCountRef,
  categoryRef,
  platformRef,
  segmentRef,
  goalRef,
  onBudgetChange,
  onDesiredCreatorCountChange,
  onCategoryChange,
  onPlatformChange,
  onSegmentChange,
  onGoalChange,
  onSubmit,
}: CampaignFormProps) {
  const goalProfile = getCampaignGoalProfile(draft.goalPosition);
  const countHasError = Boolean(errors.desiredCreatorCount || errors.countOrBudget);
  const budgetHasError = Boolean(errors.budget || errors.countOrBudget);

  return (
    <form className="campaign-form" noValidate onSubmit={onSubmit}>
      <div className="form-heading">
        <h2>추천 조건</h2>
        <p>추천 인원 또는 총예산 중 하나를 입력하고, 나머지 조건은 필요할 때만 좁혀보세요.</p>
      </div>

      <div className="compact-filter-grid">
        <div className="field-group">
          <label htmlFor="goal">캠페인 목적</label>
          <div className="goal-slider-control">
            <div className="goal-slider-value">
              <strong>{goalProfile.label}</strong>
              <output htmlFor="goal">조절값 {draft.goalPosition}</output>
            </div>
            <input
              ref={goalRef}
              id="goal"
              name="goalPosition"
              type="range"
              min="0"
              max="100"
              step="5"
              disabled={disabled}
              value={draft.goalPosition}
              aria-label="캠페인 목적"
              aria-valuetext={`${goalProfile.label}. ${goalProfile.weightSummary}`}
              onChange={(event) => onGoalChange(Number(event.target.value))}
            />
            <div className="goal-slider-scale" aria-hidden="true">
              <span>노출</span>
              <span>균형</span>
              <span>참여</span>
            </div>
          </div>
          <p className="field-help">{goalProfile.description}</p>
          <p className="goal-slider-weights">{goalProfile.weightSummary}</p>
        </div>

        <div className="required-filter-row">
          <div className="field-group">
            <label htmlFor="desired-creator-count">추천 인원</label>
            <div className="unit-input-wrap">
              <input
                ref={desiredCreatorCountRef}
                id="desired-creator-count"
                name="desiredCreatorCount"
                aria-label="추천 인원"
                type="number"
                inputMode="numeric"
                min="1"
                max="20"
                step="1"
                disabled={disabled}
                value={draft.desiredCreatorCount}
                aria-invalid={countHasError}
                aria-describedby={`count-help${errors.desiredCreatorCount ? " count-error" : ""}${errors.countOrBudget ? " count-budget-error" : ""}`}
                onChange={(event) => onDesiredCreatorCountChange(event.target.value)}
                placeholder="제한 없음"
              />
              <span aria-hidden="true">명</span>
            </div>
            <p id="count-help" className="field-help">최대 20명</p>
            {errors.desiredCreatorCount && (
              <p id="count-error" className="field-error">{errors.desiredCreatorCount}</p>
            )}
          </div>

          <div className="field-group">
            <label htmlFor="budget">총 예산</label>
            <div className="unit-input-wrap">
              <input
                ref={budgetRef}
                id="budget"
                name="budgetManwon"
                aria-label="총 예산"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                disabled={disabled}
                value={draft.budgetManwon}
                aria-invalid={budgetHasError}
                aria-describedby={`budget-help${errors.budget ? " budget-error" : ""}${errors.countOrBudget ? " count-budget-error" : ""}`}
                onChange={(event) => onBudgetChange(event.target.value.replace(/[^0-9]/g, ""))}
                placeholder="제한 없음"
              />
              <span aria-hidden="true">만원</span>
            </div>
            <p id="budget-help" className="field-help">
              {formatBudget(draft.budgetManwon)}
            </p>
            {errors.budget && <p id="budget-error" className="field-error">{errors.budget}</p>}
          </div>
          {errors.countOrBudget && (
            <p id="count-budget-error" className="field-error required-pair-error">{errors.countOrBudget}</p>
          )}
        </div>

        <div className="field-group">
          <label htmlFor="platform">플랫폼</label>
          <select
            ref={platformRef}
            id="platform"
            name="platform"
            aria-label="플랫폼"
            disabled={disabled}
            value={draft.platform}
            onChange={(event) => onPlatformChange(event.target.value as Platform | "")}
          >
            <option value="">전체 플랫폼</option>
            {PLATFORMS.map((platform) => (
              <option key={platform} value={platform}>{platform}</option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label htmlFor="segment">크리에이터 규모</label>
          <select
            ref={segmentRef}
            id="segment"
            name="segment"
            aria-label="크리에이터 규모"
            disabled={disabled}
            value={draft.segment}
            onChange={(event) => onSegmentChange(event.target.value as FollowerSegment | "")}
          >
            <option value="">전체 규모</option>
            {segmentOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} · {option.range}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <span className="field-label">카테고리</span>
          <details className="category-select">
            <summary ref={categoryRef}>{categorySummary(draft.categories)}</summary>
            <fieldset aria-label="카테고리">
              <legend className="sr-only">카테고리</legend>
              {CATEGORIES.map((category) => (
                <label key={category}>
                  <input
                    type="checkbox"
                    name="category"
                    value={category}
                    disabled={disabled}
                    checked={draft.categories.includes(category)}
                    onChange={(event) => onCategoryChange(category, event.target.checked)}
                  />
                  <span>{category}</span>
                </label>
              ))}
            </fieldset>
          </details>
        </div>
      </div>

      <div className="form-footer">
        {isDirty && (
          <p className="draft-notice" role="status">
            조건이 변경됐어요. 추천받기 버튼을 눌러 결과를 갱신해 주세요.
          </p>
        )}

        <button className="primary-button" type="submit" disabled={disabled}>
          크리에이터 추천받기
        </button>
      </div>
    </form>
  );
}
