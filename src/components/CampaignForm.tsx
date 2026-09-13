import type { FormEvent, RefObject } from "react";
import {
  CATEGORIES,
  type CampaignGoal,
  type Category,
  type FollowerSegment,
} from "../domain/types";
import { CAMPAIGN_GOALS, CAMPAIGN_GOAL_PROFILES } from "../recommendation/goals";

export interface CampaignDraft {
  budget: string;
  categories: Category[];
  segment: FollowerSegment | "";
  goal: CampaignGoal | "";
}

export interface FormErrors {
  budget?: string;
  categories?: string;
  segment?: string;
  goal?: string;
}

interface CampaignFormProps {
  draft: CampaignDraft;
  errors: FormErrors;
  isDirty: boolean;
  disabled: boolean;
  budgetRef: RefObject<HTMLInputElement | null>;
  categoryRef: RefObject<HTMLInputElement | null>;
  segmentRef: RefObject<HTMLInputElement | null>;
  goalRef: RefObject<HTMLInputElement | null>;
  onBudgetChange: (value: string) => void;
  onCategoryChange: (category: Category, checked: boolean) => void;
  onSegmentChange: (segment: FollowerSegment) => void;
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

const formatBudget = (value: string) => {
  if (!/^\d+$/.test(value) || Number(value) <= 0) return "금액을 입력해 주세요";
  return `${new Intl.NumberFormat("ko-KR").format(Number(value))}원`;
};

export function CampaignForm({
  draft,
  errors,
  isDirty,
  disabled,
  budgetRef,
  categoryRef,
  segmentRef,
  goalRef,
  onBudgetChange,
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
        <p>한 명과 협업할 때의 기준으로 입력해 주세요.</p>
      </div>

      <fieldset className="field-group" aria-describedby={errors.goal ? "goal-error" : "goal-help"}>
        <legend>캠페인 목적</legend>
        <p id="goal-help" className="field-help">목적에 따라 추천 점수의 지표별 비중이 달라져요.</p>
        <div className="goal-list">
          {CAMPAIGN_GOALS.map((goal, index) => {
            const profile = CAMPAIGN_GOAL_PROFILES[goal];
            return (
              <label className="goal-control" key={goal}>
                <input
                  ref={index === 0 ? goalRef : undefined}
                  type="radio"
                  name="goal"
                  value={goal}
                  disabled={disabled}
                  checked={draft.goal === goal}
                  aria-invalid={Boolean(errors.goal)}
                  onChange={() => onGoalChange(goal)}
                />
                <span className="goal-copy">
                  <strong>{profile.label}</strong>
                  <small>{profile.description}</small>
                </span>
              </label>
            );
          })}
        </div>
        {errors.goal && <p id="goal-error" className="field-error">{errors.goal}</p>}
      </fieldset>

      <div className="field-group">
        <label htmlFor="budget">1인당 최대 예산</label>
        <div className="budget-input-wrap">
          <input
            ref={budgetRef}
            id="budget"
            name="budget"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            disabled={disabled}
            value={draft.budget}
            aria-invalid={Boolean(errors.budget)}
            aria-describedby={`budget-help${errors.budget ? " budget-error" : ""}`}
            onChange={(event) => onBudgetChange(event.target.value.replace(/[^0-9]/g, ""))}
            placeholder="예: 1500000"
          />
          <span aria-hidden="true">원</span>
        </div>
        <p id="budget-help" className="field-help">{formatBudget(draft.budget)}</p>
        {errors.budget && <p id="budget-error" className="field-error">{errors.budget}</p>}
      </div>

      <fieldset className="field-group" aria-describedby={errors.categories ? "category-error" : undefined}>
        <legend>카테고리</legend>
        <p className="field-help">여러 개를 고르면 하나라도 일치하는 후보를 찾아요.</p>
        <div className="choice-grid category-grid">
          {CATEGORIES.map((category, index) => (
            <label className="choice-control" key={category}>
              <input
                ref={index === 0 ? categoryRef : undefined}
                type="checkbox"
                name="category"
                value={category}
                disabled={disabled}
                checked={draft.categories.includes(category)}
                aria-invalid={Boolean(errors.categories)}
                onChange={(event) => onCategoryChange(category, event.target.checked)}
              />
              <span>{category}</span>
            </label>
          ))}
        </div>
        {errors.categories && <p id="category-error" className="field-error">{errors.categories}</p>}
      </fieldset>

      <fieldset className="field-group" aria-describedby={errors.segment ? "segment-error" : "segment-help"}>
        <legend>크리에이터 규모</legend>
        <p id="segment-help" className="field-help">팔로워 수를 기준으로 구분해요.</p>
        <div className="segment-list">
          {segmentOptions.map((option, index) => (
            <label className="segment-control" key={option.value}>
              <input
                ref={index === 0 ? segmentRef : undefined}
                type="radio"
                name="segment"
                value={option.value}
                disabled={disabled}
                checked={draft.segment === option.value}
                aria-invalid={Boolean(errors.segment)}
                onChange={() => onSegmentChange(option.value)}
              />
              <span className="segment-copy">
                <strong>{option.label}</strong>
                <small>{option.range}</small>
              </span>
            </label>
          ))}
        </div>
        {errors.segment && <p id="segment-error" className="field-error">{errors.segment}</p>}
      </fieldset>

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
