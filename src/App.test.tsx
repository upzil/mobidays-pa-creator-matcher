import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { loadCreators } from "./data/creatorCsv";
import type { Creator } from "./domain/types";

vi.mock("./data/creatorCsv", () => ({
  loadCreators: vi.fn(),
}));

const creators: Creator[] = [
  {
    creatorId: "C1",
    creatorName: "게임채널",
    category: "게임",
    platform: "유튜브",
    followers: 8_000,
    segment: "nano",
    avgViewCount: 3_000,
    engagementRate: 8.2,
    totalCampaignCount: 10,
    totalCampaignBudgetKrw: 3_000_000,
    avgCampaignBudgetKrw: 300_000,
    advertiserRating: 4.8,
  },
  {
    creatorId: "C2",
    creatorName: "새로운채널",
    category: "게임",
    platform: "인스타그램",
    followers: 7_000,
    segment: "nano",
    avgViewCount: 5_000,
    engagementRate: 9.1,
    totalCampaignCount: 0,
    totalCampaignBudgetKrw: 0,
    avgCampaignBudgetKrw: null,
    advertiserRating: null,
  },
  {
    creatorId: "C3",
    creatorName: "교육채널",
    category: "교육",
    platform: "유튜브",
    followers: 9_000,
    segment: "nano",
    avgViewCount: 1_000,
    engagementRate: 6.5,
    totalCampaignCount: 5,
    totalCampaignBudgetKrw: 1_000_000,
    avgCampaignBudgetKrw: 200_000,
    advertiserRating: 4.2,
  },
];

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadCreators).mockResolvedValue({ creators, diagnostics: [] });
  });

  it("데이터를 불러온 뒤 전체 크리에이터와 기본 정렬을 제공한다", async () => {
    render(<App />);

    expect(screen.getByRole("status")).toHaveTextContent("데이터를 확인");
    expect(await screen.findByRole("heading", { name: "전체 크리에이터 3명" })).toBeInTheDocument();
    expect(screen.getByLabelText("전체 목록 정렬")).toHaveValue("followers");
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "교육채널",
      "게임채널",
      "새로운채널",
    ]);
    expect(screen.getByLabelText("총 예산")).toBeEnabled();
    expect(screen.getByLabelText("추천 인원")).toHaveValue(5);
    expect(screen.getByLabelText("캠페인 목적")).toHaveValue("balanced");
    expect(screen.getByLabelText(/크리에이터 규모/)).toHaveValue("");
    expect(screen.getByText("전체 카테고리")).toBeInTheDocument();
  });

  it("추천 전 전체 목록을 기본 지표로 재정렬한다", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "전체 크리에이터 3명" });

    await user.selectOptions(screen.getByLabelText("전체 목록 정렬"), "views");

    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "새로운채널",
      "게임채널",
      "교육채널",
    ]);
  });

  it("선택 필터를 비워도 전체에서 기본 5명 이내를 추천한다", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "전체 크리에이터 3명" });

    await user.click(screen.getByRole("button", { name: "크리에이터 추천받기" }));

    expect(await screen.findByRole("heading", { name: "조건에 맞는 추천" })).toBeInTheDocument();
    expect(screen.getByText("게임채널")).toBeInTheDocument();
    expect(screen.getByText("새로운채널")).toBeInTheDocument();
    expect(screen.getByText("교육채널")).toBeInTheDocument();
    expect(screen.queryByText("APPLIED CONDITIONS")).not.toBeInTheDocument();
    expect(screen.queryByText(/선택해 주세요/)).not.toBeInTheDocument();
  });

  it("유효 조건으로 정확 추천과 별도 탐색 후보를 표시한다", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "전체 크리에이터 3명" });

    await user.type(screen.getByLabelText("총 예산"), "150");
    expect(screen.getByText("총 150만원 · 1인당 약 30만원 기준")).toBeInTheDocument();
    await user.click(screen.getByText("전체 카테고리"));
    await user.click(screen.getByRole("checkbox", { name: "게임" }));
    await user.selectOptions(screen.getByLabelText(/크리에이터 규모/), "nano");
    await user.click(screen.getByRole("button", { name: "크리에이터 추천받기" }));

    expect(await screen.findByText("게임채널")).toBeInTheDocument();
    expect(screen.getByText("새로운채널")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /조건에 맞는 추천/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /함께 살펴볼 탐색 후보/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "그 외 크리에이터 1명" })).toBeInTheDocument();
    expect(screen.getByText("교육채널")).toBeInTheDocument();
    expect(screen.getByText("견적 확인 필요")).toBeInTheDocument();
    expect(screen.getByText("균형 탐색")).toBeInTheDocument();
    expect(screen.getByText(/참여율 30% · 조회수 25%/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("총 예산"), "0");
    expect(screen.getByText(/조건이 변경됐어요/)).toBeInTheDocument();
    expect(screen.getByText("게임채널")).toBeInTheDocument();
  });

  it("목적을 바꿔 다시 추천하면 목적별 가중치를 적용한다", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "전체 크리에이터 3명" });

    await user.selectOptions(screen.getByLabelText("캠페인 목적"), "awareness");
    await user.type(screen.getByLabelText("총 예산"), "150");
    await user.click(screen.getByText("전체 카테고리"));
    await user.click(screen.getByRole("checkbox", { name: "게임" }));
    await user.selectOptions(screen.getByLabelText(/크리에이터 규모/), "nano");
    await user.click(screen.getByRole("button", { name: "크리에이터 추천받기" }));

    expect(await screen.findByText(/조회수 45% · 참여율 20%/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("캠페인 목적"), "conversion");
    await user.click(screen.getByRole("button", { name: "크리에이터 추천받기" }));

    expect(await screen.findByText(/평점 30% · 참여율 25%/)).toBeInTheDocument();
    expect(screen.getByText(/직접 전환 데이터가 없어/)).toBeInTheDocument();
  });

  it("추천 인원으로 노출 후보 수를 제한한다", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "전체 크리에이터 3명" });

    await user.clear(screen.getByLabelText("추천 인원"));
    await user.type(screen.getByLabelText("추천 인원"), "1");
    await user.click(screen.getByRole("button", { name: "크리에이터 추천받기" }));

    expect(await screen.findByRole("heading", { name: "조건에 맞는 추천" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "그 외 크리에이터 2명" })).toBeInTheDocument();
  });

  it("추천 인원이 허용 범위를 벗어나면 안내하고 입력으로 초점을 옮긴다", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "전체 크리에이터 3명" });

    const countInput = screen.getByLabelText("추천 인원");
    await user.clear(countInput);
    await user.type(countInput, "0");
    await user.click(screen.getByRole("button", { name: "크리에이터 추천받기" }));

    expect(screen.getByText("추천 인원은 1명에서 20명 사이로 입력해 주세요.")).toBeInTheDocument();
    expect(countInput).toHaveFocus();
    expect(screen.queryByRole("heading", { name: /명의 후보를 찾았어요/ })).not.toBeInTheDocument();
  });

  it("CSV 로드 오류에서 다시 불러올 수 있다", async () => {
    vi.mocked(loadCreators)
      .mockRejectedValueOnce(new Error("네트워크 오류"))
      .mockResolvedValueOnce({ creators, diagnostics: [] });
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText("추천 데이터를 불러오지 못했어요.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 불러오기" }));

    await waitFor(() => expect(loadCreators).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("heading", { name: "전체 크리에이터 3명" })).toBeInTheDocument();
  });
});
