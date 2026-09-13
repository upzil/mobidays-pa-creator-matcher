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
    avgViewCount: 1_500,
    engagementRate: 7.1,
    totalCampaignCount: 0,
    totalCampaignBudgetKrw: 0,
    avgCampaignBudgetKrw: null,
    advertiserRating: null,
  },
];

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadCreators).mockResolvedValue({ creators, diagnostics: [] });
  });

  it("데이터를 불러온 뒤 초기 안내와 세 입력을 제공한다", async () => {
    render(<App />);

    expect(screen.getByRole("status")).toHaveTextContent("데이터를 확인");
    expect(await screen.findByText(/조건을 입력하면/)).toBeInTheDocument();
    expect(screen.getByLabelText("1인당 최대 예산")).toBeEnabled();
    expect(screen.getByRole("group", { name: "카테고리" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "크리에이터 규모" })).toBeInTheDocument();
  });

  it("빈 제출 시 필드 오류를 표시하고 첫 오류로 초점을 옮긴다", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/조건을 입력하면/);

    await user.click(screen.getByRole("button", { name: "크리에이터 추천받기" }));

    expect(screen.getByText(/1원 이상의/)).toBeInTheDocument();
    expect(screen.getByText(/카테고리를 하나 이상/)).toBeInTheDocument();
    expect(screen.getByText(/규모를 선택/)).toBeInTheDocument();
    expect(screen.getByLabelText("1인당 최대 예산")).toHaveFocus();
  });

  it("유효 조건으로 정확 추천과 별도 탐색 후보를 표시한다", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/조건을 입력하면/);

    await user.type(screen.getByLabelText("1인당 최대 예산"), "300000");
    await user.click(screen.getByRole("checkbox", { name: "게임" }));
    await user.click(screen.getByRole("radio", { name: /나노/ }));
    await user.click(screen.getByRole("button", { name: "크리에이터 추천받기" }));

    expect(await screen.findByText("게임채널")).toBeInTheDocument();
    expect(screen.getByText("새로운채널")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /조건에 맞는 추천/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /함께 살펴볼 탐색 후보/ })).toBeInTheDocument();
    expect(screen.getByText("견적 확인 필요")).toBeInTheDocument();

    await user.type(screen.getByLabelText("1인당 최대 예산"), "0");
    expect(screen.getByText(/조건이 변경됐어요/)).toBeInTheDocument();
    expect(screen.getByText("게임채널")).toBeInTheDocument();
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
    expect(await screen.findByText(/조건을 입력하면/)).toBeInTheDocument();
  });
});
