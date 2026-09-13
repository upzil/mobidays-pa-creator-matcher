import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CampaignForm, type CampaignDraft, type FormErrors } from "./components/CampaignForm";
import { ResultsPanel } from "./components/ResultsPanel";
import { loadCreators } from "./data/creatorCsv";
import type {
  BudgetMode,
  BrowseSortMode,
  Category,
  Creator,
  FollowerSegment,
  Platform,
  RecommendationQuery,
  RecommendationResult,
  SortMode,
} from "./domain/types";
import { sortCreatorsForBrowse } from "./recommendation/browse";
import { recommendCreators, sortRecommendations } from "./recommendation/engine";
import "./styles.css";

const initialDraft: CampaignDraft = {
  budgetMode: "total",
  budgetManwon: "",
  categories: [],
  platform: "",
  segment: "",
  goalPosition: 50,
  desiredCreatorCount: "",
};

function validateDraft(draft: CampaignDraft): FormErrors {
  const errors: FormErrors = {};
  const budgetKrw = Number(draft.budgetManwon) * 10_000;
  if (
    draft.budgetManwon !== "" &&
    (!/^\d+$/.test(draft.budgetManwon) ||
      Number(draft.budgetManwon) <= 0 ||
      !Number.isSafeInteger(budgetKrw))
  ) {
    errors.budget = "1만원 이상의 예산을 입력해 주세요.";
  }
  if (
    draft.desiredCreatorCount !== "" &&
    (!/^\d+$/.test(draft.desiredCreatorCount) ||
      Number(draft.desiredCreatorCount) < 1 ||
      Number(draft.desiredCreatorCount) > 20)
  ) {
    errors.desiredCreatorCount = "추천 인원은 1명에서 20명 사이로 입력해 주세요.";
  }
  if (draft.budgetManwon === "" && draft.desiredCreatorCount === "") {
    errors.countOrBudget = "추천 인원 또는 예산 중 하나를 입력해 주세요.";
  }
  return errors;
}

function draftMatchesQuery(draft: CampaignDraft, query: RecommendationQuery | null) {
  if (!query) return false;
  const budgetKrw = draft.budgetManwon === "" ? null : Number(draft.budgetManwon) * 10_000;
  const totalBudgetKrw = draft.budgetMode === "total" ? budgetKrw : null;
  const perCreatorBudgetKrw = draft.budgetMode === "perCreator" ? budgetKrw : null;
  return (
    totalBudgetKrw === query.totalBudgetKrw &&
    perCreatorBudgetKrw === query.perCreatorBudgetKrw &&
    (draft.platform || null) === query.platform &&
    (draft.segment || null) === query.segment &&
    draft.goalPosition === query.goalPosition &&
    (draft.desiredCreatorCount === "" ? null : Number(draft.desiredCreatorCount)) === query.desiredCreatorCount &&
    draft.categories.length === query.categories.length &&
    draft.categories.every((category) => query.categories.includes(category))
  );
}

function App() {
  const [draft, setDraft] = useState<CampaignDraft>(initialDraft);
  const [errors, setErrors] = useState<FormErrors>({});
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [excludedRows, setExcludedRows] = useState(0);
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [browseSortMode, setBrowseSortMode] = useState<BrowseSortMode>("followers");
  const [sortMode, setSortMode] = useState<SortMode>("recommended");
  const [announcement, setAnnouncement] = useState("크리에이터 데이터를 불러오는 중입니다.");
  const [reloadToken, setReloadToken] = useState(0);
  const budgetRef = useRef<HTMLInputElement>(null);
  const desiredCreatorCountRef = useRef<HTMLInputElement>(null);
  const goalRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLElement>(null);
  const platformRef = useRef<HTMLSelectElement>(null);
  const segmentRef = useRef<HTMLSelectElement>(null);
  const resultsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    loadCreators(controller.signal)
      .then(({ creators: loadedCreators, diagnostics }) => {
        setCreators(loadedCreators);
        setExcludedRows(diagnostics.length);
        setLoadState("ready");
        setAnnouncement(
          diagnostics.length > 0
            ? `${loadedCreators.length}명의 데이터를 불러왔고, ${diagnostics.length}개 행은 제외했습니다.`
            : `${loadedCreators.length}명의 크리에이터 데이터를 불러왔습니다.`,
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadState("error");
        setLoadError(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
        setAnnouncement("크리에이터 데이터를 불러오지 못했습니다.");
      });

    return () => controller.abort();
  }, [reloadToken]);

  const sortedSections = useMemo(() => {
    if (!result) return [];
    return result.sections.map((section) => ({
      ...section,
      items: sortRecommendations(section.items, sortMode),
    }));
  }, [result, sortMode]);

  const sortedCreators = useMemo(
    () => sortCreatorsForBrowse(creators, browseSortMode),
    [creators, browseSortMode],
  );

  const isDirty = result !== null && !draftMatchesQuery(draft, result.appliedQuery);

  const clearError = (field: keyof FormErrors) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      if (nextErrors.desiredCreatorCount || nextErrors.countOrBudget) desiredCreatorCountRef.current?.focus();
      else if (nextErrors.budget) budgetRef.current?.focus();
      setAnnouncement("입력한 조건을 확인해 주세요.");
      return;
    }

    if (loadState !== "ready") return;

    const query: RecommendationQuery = {
      totalBudgetKrw:
        draft.budgetMode === "total" && draft.budgetManwon !== ""
          ? Number(draft.budgetManwon) * 10_000
          : null,
      perCreatorBudgetKrw:
        draft.budgetMode === "perCreator" && draft.budgetManwon !== ""
          ? Number(draft.budgetManwon) * 10_000
          : null,
      categories: draft.categories,
      platform: draft.platform || null,
      segment: draft.segment || null,
      goalPosition: draft.goalPosition,
      desiredCreatorCount: draft.desiredCreatorCount === "" ? null : Number(draft.desiredCreatorCount),
    };
    const nextResult = recommendCreators(creators, query);
    setResult(nextResult);
    setSortMode("recommended");
    const count = nextResult.sections.reduce((sum, section) => sum + section.items.length, 0);
    setAnnouncement(
      count > 0
        ? `${count}명의 추천 결과를 불러왔습니다.`
        : "추천 후보가 없습니다. 조건 수정 방법을 확인해 주세요.",
    );
    window.requestAnimationFrame(() => resultsRef.current?.focus());
  };

  const handleSortChange = (mode: SortMode) => {
    setSortMode(mode);
    const label = {
      recommended: "추천순",
      engagement: "참여율순",
      views: "평균 조회수순",
      rating: "광고주 평점순",
      budget: "협업비 낮은 순",
    }[mode];
    setAnnouncement(`${label}으로 결과를 정렬했습니다.`);
  };

  const handleBrowseSortChange = (mode: BrowseSortMode) => {
    setBrowseSortMode(mode);
    const label = {
      followers: "팔로워 많은 순",
      views: "평균 조회수 많은 순",
      engagement: "참여율 높은 순",
      rating: "광고주 평점 높은 순",
      budget: "협업비 낮은 순",
    }[mode];
    setAnnouncement(`${label}으로 전체 크리에이터를 정렬했습니다.`);
  };

  const handleReload = () => {
    setLoadState("loading");
    setLoadError("");
    setExcludedRows(0);
    setAnnouncement("크리에이터 데이터를 다시 불러오는 중입니다.");
    setReloadToken((value) => value + 1);
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#main" aria-label="Creator Match 본문으로 이동">CM</a>
        <div>
          <h1>캠페인에 맞는 크리에이터 찾기</h1>
          <p>예산과 성과를 함께 보는 데이터 기반 추천</p>
        </div>
        <span>크리에이터 200명 · 카테고리 10개</span>
      </header>

      <main id="main" className="workspace">
        <aside className="condition-panel" aria-label="추천 조건 입력">
          <CampaignForm
            draft={draft}
            errors={errors}
            isDirty={isDirty}
            disabled={loadState !== "ready"}
            budgetRef={budgetRef}
            desiredCreatorCountRef={desiredCreatorCountRef}
            goalRef={goalRef}
            categoryRef={categoryRef}
            platformRef={platformRef}
            segmentRef={segmentRef}
            onBudgetChange={(budgetManwon) => {
              setDraft((current) => ({ ...current, budgetManwon }));
              clearError("budget");
              clearError("countOrBudget");
            }}
            onBudgetModeChange={(budgetMode: BudgetMode) => {
              setDraft((current) => ({
                ...current,
                budgetMode,
                budgetManwon: current.budgetMode === budgetMode ? current.budgetManwon : "",
              }));
              clearError("budget");
              clearError("countOrBudget");
            }}
            onDesiredCreatorCountChange={(desiredCreatorCount) => {
              setDraft((current) => ({ ...current, desiredCreatorCount }));
              clearError("desiredCreatorCount");
              clearError("countOrBudget");
            }}
            onGoalChange={(goalPosition) => {
              setDraft((current) => ({ ...current, goalPosition }));
            }}
            onCategoryChange={(category: Category, checked) => {
              setDraft((current) => ({
                ...current,
                categories: checked
                  ? [...current.categories, category]
                  : current.categories.filter((item) => item !== category),
              }));
            }}
            onPlatformChange={(platform: Platform | "") => {
              setDraft((current) => ({ ...current, platform }));
            }}
            onSegmentChange={(segment: FollowerSegment | "") => {
              setDraft((current) => ({ ...current, segment }));
            }}
            onSubmit={handleSubmit}
          />
        </aside>

        <section className="results-panel" aria-label="추천 결과" tabIndex={-1} ref={resultsRef}>
          {loadState === "loading" && (
            <div className="loading-state" role="status">
              <span className="loading-mark" aria-hidden="true" />
              <h2>크리에이터 데이터를 확인하고 있어요.</h2>
              <p>잠시만 기다려 주세요.</p>
            </div>
          )}

          {loadState === "error" && (
            <div className="data-error" role="alert">
              <h2>추천 데이터를 불러오지 못했어요.</h2>
              <p>{loadError}</p>
              <button type="button" onClick={handleReload}>다시 불러오기</button>
            </div>
          )}

          {loadState === "ready" && (
            <ResultsPanel
              creators={sortedCreators}
              result={result}
              sections={sortedSections}
              excludedRows={excludedRows}
              browseSortMode={browseSortMode}
              sortMode={sortMode}
              onBrowseSortChange={handleBrowseSortChange}
              onSortChange={handleSortChange}
              onFocusBudget={() => budgetRef.current?.focus()}
              onFocusCategories={() => categoryRef.current?.focus()}
              onFocusPlatform={() => platformRef.current?.focus()}
              onFocusSegment={() => segmentRef.current?.focus()}
            />
          )}
        </section>
      </main>

      <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
    </div>
  );
}

export default App;
