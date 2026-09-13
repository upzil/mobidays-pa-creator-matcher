import type { FormEvent, RefObject } from "react";
import {
  CATEGORIES,
  type CampaignGoal,
  type Category,
  type FollowerSegment,
} from "../domain/types";
import { CAMPAIGN_GOALS, CAMPAIGN_GOAL_PROFILES } from "../recommendation/goals";

export interface CampaignDraft {
  budgetManwon: string;
  categories: Category[];
  segment: FollowerSegment | "";
  goal: CampaignGoal;
  desiredCreatorCount: string;
}

export interface FormErrors {
  budget?: string;
  desiredCreatorCount?: string;
}

interface CampaignFormProps {
  draft: CampaignDraft;
  errors: FormErrors;
  isDirty: boolean;
  disabled: boolean;
  budgetRef: RefObject<HTMLInputElement | null>;
  desiredCreatorCountRef: RefObject<HTMLInputElement | null>;
  categoryRef: RefObject<HTMLElement | null>;
  segmentRef: RefObject<HTMLSelectElement | null>;
  goalRef: RefObject<HTMLSelectElement | null>;
  onBudgetChange: (value: string) => void;
  onDesiredCreatorCountChange: (value: string) => void;
  onCategoryChange: (category: Category, checked: boolean) => void;
  onSegmentChange: (segment: FollowerSegment | "") => void;
  onGoalChange: (goal: CampaignGoal) => void;
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

const formatBudget = (value: string, desiredCreatorCount: string) => {
  if (value === "") return "비우면 예산 제한 없이 추천해요.";
  if (!/^\d+$/.test(value) || Number(value) <= 0) return "금액을 확인해 주세요.";
  const count = Number(desiredCreatorCount);
  const totalManwon = new Intl.NumberFormat("ko-KR").format(Number(value));
  if (!Number.isSafeInteger(count) || count < 1) return `총 ${totalManwon}만원`;
  const perCreatorManwon = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(
    Number(value) / count,
  );
  return `총 ${totalManwon}만원 · 1인당 약 ${perCreatorManwon}만원 기준`;
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
  segmentRef,
  goalRef,
  onBudgetChange,
  onDesiredCreatorCountChange,
  onCategoryChange,
  onSegmentChange,
  onGoalChange,
  onSubmit,
}: CampaignFormProps) {
  return (
    <form className="campaign-form" noValidate onSubmit={onSubmit}>
      <div className="form-heading">
        <p className="eyebrow">CAMPAIGN BRIEF</p>
        <h2>추천 조건</h2>
        <p>모든 필터는 선택 사항이에요. 비워두면 전체를 대상으로 추천합니다.</p>
      </div>

      <div className="compact-filter-grid">
        <div className="field-group field-span-full">
          <label htmlFor="goal">캠페인 목적</label>
          <select
            ref={goalRef}
            id="goal"
            name="goal"
            disabled={disabled}
            value={draft.goal}
            onChange={(event) => onGoalChange(event.target.value as CampaignGoal)}
          >
            {CAMPAIGN_GOALS.map((goal) => (
              <option key={goal} value={goal}>{CAMPAIGN_GOAL_PROFILES[goal].label}</option>
            ))}
          </select>
          <p className="field-help">{CAMPAIGN_GOAL_PROFILES[draft.goal].description}</p>
        </div>

        <div className="field-group">
          <label htmlFor="desired-creator-count">추천 인원</label>
          <div className="unit-input-wrap">
            <input
              ref={desiredCreatorCountRef}
              id="desired-creator-count"
              name="desiredCreatorCount"
              type="number"
              inputMode="numeric"
              min="1"
              max="20"
              step="1"
              disabled={disabled}
              value={draft.desiredCreatorCount}
              aria-invalid={Boolean(errors.desiredCreatorCount)}
              aria-describedby={`count-help${errors.desiredCreatorCount ? " count-error" : ""}`}
              onChange={(event) => onDesiredCreatorCountChange(event.target.value)}
            />
            <span aria-hidden="true">명</span>
          </div>
          <p id="count-help" className="field-help">기본 5명 · 최대 20명</p>
          {errors.desiredCreatorCount && (
            <p id="count-error" className="field-error">{errors.desiredCreatorCount}</p>
          )}
        </div>

        <div className="field-group">
          <label htmlFor="budget">총 예산 <span className="optional-label" aria-hidden="true">선택</span></label>
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
              aria-invalid={Boolean(errors.budget)}
              aria-describedby={`budget-help${errors.budget ? " budget-error" : ""}`}
              onChange={(event) => onBudgetChange(event.target.value.replace(/[^0-9]/g, ""))}
              placeholder="제한 없음"
            />
            <span aria-hidden="true">만원</span>
          </div>
          <p id="budget-help" className="field-help">
            {formatBudget(draft.budgetManwon, draft.desiredCreatorCount)}
          </p>
          {errors.budget && <p id="budget-error" className="field-error">{errors.budget}</p>}
        </div>

        <div className="field-group">
          <label htmlFor="segment">크리에이터 규모 <span className="optional-label" aria-hidden="true">선택</span></label>
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
          <span className="field-label">카테고리 <span className="optional-label" aria-hidden="true">선택</span></span>
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

      {isDirty && (
        <p className="draft-notice" role="status">
          조건이 변경됐어요. 추천받기 버튼을 눌러 결과를 갱신해 주세요.
        </p>
      )}

      <button className="primary-button" type="submit" disabled={disabled}>
        크리에이터 추천받기
      </button>
    </form>
  );
}
