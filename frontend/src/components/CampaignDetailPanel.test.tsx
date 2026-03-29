/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CampaignDetailPanel } from "./CampaignDetailPanel";
import { ApiError, Campaign } from "../types/campaign";

const mockCampaign: Campaign = {
  id: "camp-1",
  title: "Test Campaign",
  description: "A test campaign description",
  creator: "GABCDEFGHIJKLMNOPQRSTUVWXYZ012345678901234567890123456789",
  assetCode: "USDC",
  targetAmount: 500,
  pledgedAmount: 400,
  deadline: Math.floor(Date.now() / 1000) + 3600,
  createdAt: Math.floor(Date.now() / 1000),
  pledges: [],
  progress: {
    status: "open",
    percentFunded: 80,
    remainingAmount: 100,
    hoursLeft: 1,
    pledgeCount: 0,
    hoursLeft: 2,
    canPledge: true,
    canClaim: false,
    canRefund: false,
  },
  metadata: {},
};

// Helper: a minimal valid ApiError object
function makeApiError(message: string): ApiError {
  return { message };
}

describe("CampaignDetailPanel", () => {
  it("shows empty state when no campaign selected", () => {
    render(
      <CampaignDetailPanel
        campaign={null}
        appConfig={mockConfig}
        connectedWallet={null}
        onConnectWallet={async () => {}}
        onPledge={async () => {}}
        onClaim={async () => {}}
        onRefund={async () => {}}
      />,
    );

    expect(screen.getByText(/Pick a campaign/i)).toBeInTheDocument();
  });

  it("renders campaign details when campaign is selected", () => {
    render(
      <CampaignDetailPanel
        campaign={mockCampaign}
        appConfig={mockConfig}
        connectedWallet={null}
        onConnectWallet={async () => {}}
        onPledge={async () => {}}
        onClaim={async () => {}}
        onRefund={async () => {}}
      />,
    );
    expect(screen.getByText("Test Campaign")).toBeInTheDocument();
    expect(screen.getByText("USDC")).toBeInTheDocument();
  });

  it("shows error message when actionError is passed", () => {
    render(
      <CampaignDetailPanel
        campaign={mockCampaign}
        actionError={makeApiError("Pledge failed")}
        onPledge={async () => {}}
        onClaim={async () => {}}
        onRefund={async () => {}}
      />,
    );
    expect(screen.getByText("Pledge failed")).toBeInTheDocument();
  });

  it("shows success message when actionMessage is passed", () => {
    render(
      <CampaignDetailPanel
        campaign={mockCampaign}
        appConfig={mockConfig}
        connectedWallet={null}
        onConnectWallet={onConnectWallet}
        onPledge={async () => {}}
        onClaim={async () => {}}
        onRefund={async () => {}}
      />,
    );
    expect(screen.getByText("Pledge successful")).toBeInTheDocument();
  });

  it("calls onPledge when form is submitted", async () => {
    const user = userEvent.setup();
    const onPledge = vi.fn().mockResolvedValue(undefined);

    render(
      <CampaignDetailPanel
        campaign={mockCampaign}
        appConfig={mockConfig}
        connectedWallet={`G${"B".repeat(55)}`}
        onConnectWallet={async () => {}}
        onPledge={onPledge}
        onClaim={async () => {}}
        onRefund={async () => {}}
      />,
    );

    await user.type(
      screen.getByPlaceholderText(/G\.\.\. contributor public key/i),
      "GTEST123",
    );
    await user.click(screen.getByText("Add pledge"));
    expect(onPledge).toHaveBeenCalled();
  });

  it("shows error message when pledge fails", async () => {
    const user = userEvent.setup();
    const onPledge = vi.fn().mockResolvedValue(undefined);

  it("shows an action error when provided", () => {
    render(
      <CampaignDetailPanel
        campaign={mockCampaign}
        actionError={makeApiError("Pledge failed")}
        onPledge={onPledge}
        onClaim={async () => {}}
        onRefund={async () => {}}
      />,
    );

    await user.type(
      screen.getByPlaceholderText(/G\.\.\. contributor public key/i),
      "GTEST123",
    );
    await user.click(screen.getByText("Add pledge"));
    expect(screen.getByText("Pledge failed")).toBeInTheDocument();
  });
});
