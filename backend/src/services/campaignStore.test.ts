import fs from "fs";
import path from "path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const TEST_DB_PATH = path.join(
  "/tmp",
  `stellar-goal-vault-campaign-store-${process.pid}.db`,
);

process.env.DB_PATH = TEST_DB_PATH;
process.env.CONTRACT_ID = "";

type CampaignStoreModule = typeof import("./campaignStore");
type DbModule = typeof import("./db");
type EventHistoryModule = typeof import("./eventHistory");

let createCampaign: CampaignStoreModule["createCampaign"];
let calculateProgress: CampaignStoreModule["calculateProgress"];
let initCampaignStore: CampaignStoreModule["initCampaignStore"];
let listCampaigns: CampaignStoreModule["listCampaigns"];
let reconcileOnChainPledge: CampaignStoreModule["reconcileOnChainPledge"];
let getCampaign: CampaignStoreModule["getCampaign"];
let getPledges: CampaignStoreModule["getPledges"];
let getDb: DbModule["getDb"];
let getCampaignHistory: EventHistoryModule["getCampaignHistory"];

const CREATOR = `G${"A".repeat(55)}`;
const CONTRIBUTOR = `G${"B".repeat(55)}`;
const TX_HASH = "a".repeat(64);

beforeAll(async () => {
  fs.rmSync(TEST_DB_PATH, { force: true });

  ({
    createCampaign,
    calculateProgress,
    initCampaignStore,
    listCampaigns,
    reconcileOnChainPledge,
    getCampaign,
    getPledges,
  } = await import("./campaignStore"));
  ({ getDb } = await import("./db"));
  ({ getCampaignHistory } = await import("./eventHistory"));
  initCampaignStore();
});

beforeEach(() => {
  const db = getDb();
  db.prepare(`DELETE FROM campaign_events`).run();
  db.prepare(`DELETE FROM pledges`).run();
  db.prepare(`DELETE FROM campaigns`).run();
});

describe("campaign store search", () => {
  it("returns all campaigns when no search query is provided", () => {
    const result = listCampaigns();
    expect(Array.isArray(result.campaigns)).toBe(true);
  });

  it("returns empty array when search query matches nothing", () => {
    const result = listCampaigns({ searchQuery: "nonexistent-campaign-xyz-123" });
    expect(result.campaigns).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it("handles empty search query gracefully", () => {
    const allCampaigns = listCampaigns();
    const emptySearchCampaigns = listCampaigns({ searchQuery: "" });
    expect(emptySearchCampaigns.campaigns.length).toBe(allCampaigns.campaigns.length);
  });

  it("handles whitespace-only search query gracefully", () => {
    const allCampaigns = listCampaigns();
    const whitespaceSearchCampaigns = listCampaigns({ searchQuery: "   " });
    expect(whitespaceSearchCampaigns.campaigns.length).toBe(allCampaigns.campaigns.length);
  });

  it("searches campaigns by title, creator, and id case-insensitively", () => {
    const futureDeadline = Math.floor(Date.now() / 1000) + 86400;
    const campaign = createCampaign({
      creator: CREATOR,
      title: "Build a Rocket Ship",
      description: "We need funding to build an amazing rocket ship for space exploration.",
      assetCode: "USDC",
      targetAmount: 10000,
      deadline: futureDeadline,
    });

    expect(listCampaigns({ searchQuery: "rocket" }).campaigns[0].id).toBe(campaign.id);
    expect(
      listCampaigns({ searchQuery: "gaaa" }).campaigns.some((row) => row.id === campaign.id),
    ).toBe(true);
    expect(listCampaigns({ searchQuery: campaign.id }).campaigns[0].id).toBe(campaign.id);
  });
});

describe("on-chain pledge reconciliation", () => {
  it("records a reconciled pledge with transaction metadata", () => {
    const futureDeadline = Math.floor(Date.now() / 1000) + 86400;
    const campaign = createCampaign({
      creator: CREATOR,
      title: "Real Soroban campaign",
      description: "A campaign used to verify Freighter-signed pledge reconciliation.",
      assetCode: "USDC",
      targetAmount: 250,
      deadline: futureDeadline,
    });

    const updatedCampaign = reconcileOnChainPledge(campaign.id, {
      contributor: CONTRIBUTOR,
      amount: 25.5,
      transactionHash: TX_HASH,
      confirmedAt: futureDeadline - 300,
    });

    expect(updatedCampaign.pledgedAmount).toBe(25.5);
    expect(getCampaign(campaign.id)?.pledgedAmount).toBe(25.5);

    const pledges = getPledges(campaign.id);
    expect(pledges).toHaveLength(1);
    expect(pledges[0].transactionHash).toBe(TX_HASH);

    const history = getCampaignHistory(campaign.id);
    const pledgeEvent = history.find((event) => event.eventType === "pledged");
    expect(pledgeEvent?.blockchainMetadata?.txHash).toBe(TX_HASH);
    expect(pledgeEvent?.blockchainMetadata?.source).toBe("soroban");
    expect(pledgeEvent?.metadata?.onChain).toBe(true);
  });

  it("treats duplicate transaction hashes as idempotent", () => {
    const futureDeadline = Math.floor(Date.now() / 1000) + 86400;
    const campaign = createCampaign({
      creator: CREATOR,
      title: "Idempotent campaign",
      description: "A campaign used to verify duplicate transaction hashes are ignored.",
      assetCode: "USDC",
      targetAmount: 250,
      deadline: futureDeadline,
    });

    reconcileOnChainPledge(campaign.id, {
      contributor: CONTRIBUTOR,
      amount: 10,
      transactionHash: TX_HASH,
      confirmedAt: futureDeadline - 120,
    });

    const secondResult = reconcileOnChainPledge(campaign.id, {
      contributor: CONTRIBUTOR,
      amount: 10,
      transactionHash: TX_HASH,
      confirmedAt: futureDeadline - 100,
    });

    expect(secondResult.pledgedAmount).toBe(10);
    expect(getPledges(campaign.id)).toHaveLength(1);
    expect(
      getCampaignHistory(campaign.id).filter((event) => event.eventType === "pledged"),
    ).toHaveLength(1);
  });
});

const DEADLINE = 1_000_000;
const T = 100;

/**
 * Create a USDC campaign with the given `target`, then set numeric fields so
 * `calculateProgress` can be called with a controlled `at` and matching DB `pledgeCount`.
 */
function putCampaign(
  c: { pledgedAmount: number; deadline: number; targetAmount: number; claimedAt: number | null },
) {
  const base = createCampaign({
    creator: CREATOR,
    title: "Progress campaign",
    description: "Unit test for calculateProgress.",
    assetCode: "USDC",
    targetAmount: c.targetAmount,
    deadline: c.deadline,
  });
  getDb()
    .prepare(
      `UPDATE campaigns SET pledged_amount = ?, deadline = ?, claimed_at = ? WHERE id = ?`,
    )
    .run(c.pledgedAmount, c.deadline, c.claimedAt, base.id);
  return getCampaign(base.id)!;
}

describe("calculateProgress", () => {
  it("open, underfunded, before deadline: canPledge only", () => {
    const campaign = putCampaign({
      targetAmount: T,
      pledgedAmount: 40,
      deadline: DEADLINE,
      claimedAt: null,
    });
    const p = calculateProgress(campaign, DEADLINE - 3600);
    expect(p.status).toBe("open");
    expect(p.canPledge).toBe(true);
    expect(p.canClaim).toBe(false);
    expect(p.canRefund).toBe(false);
  });

  it("open: 1s before exact deadline, still not reached", () => {
    const campaign = putCampaign({
      targetAmount: T,
      pledgedAmount: 50,
      deadline: DEADLINE,
      claimedAt: null,
    });
    const p = calculateProgress(campaign, DEADLINE - 1);
    expect(p.status).toBe("open");
    expect(p.canPledge).toBe(true);
    expect(p.canClaim).toBe(false);
    expect(p.canRefund).toBe(false);
  });

  it("failed: at exact deadline, underfunded — canRefund only", () => {
    const campaign = putCampaign({
      targetAmount: T,
      pledgedAmount: 50,
      deadline: DEADLINE,
      claimedAt: null,
    });
    const p = calculateProgress(campaign, DEADLINE);
    expect(p.status).toBe("failed");
    expect(p.canPledge).toBe(false);
    expect(p.canClaim).toBe(false);
    expect(p.canRefund).toBe(true);
  });

  it("failed: after deadline, underfunded", () => {
    const campaign = putCampaign({
      targetAmount: T,
      pledgedAmount: 0,
      deadline: DEADLINE,
      claimedAt: null,
    });
    const p = calculateProgress(campaign, DEADLINE + 10);
    expect(p.status).toBe("failed");
    expect(p.canPledge).toBe(false);
    expect(p.canClaim).toBe(false);
    expect(p.canRefund).toBe(true);
  });

  it("funded: pledged equals target before deadline — status funded, canPledge, not claim or refund", () => {
    const campaign = putCampaign({
      targetAmount: T,
      pledgedAmount: T,
      deadline: DEADLINE,
      claimedAt: null,
    });
    const p = calculateProgress(campaign, DEADLINE - 100);
    expect(p.status).toBe("funded");
    expect(p.canPledge).toBe(true);
    expect(p.canClaim).toBe(false);
    expect(p.canRefund).toBe(false);
  });

  it("funded: exact target at exact deadline — canClaim, not pledge or refund", () => {
    const campaign = putCampaign({
      targetAmount: T,
      pledgedAmount: T,
      deadline: DEADLINE,
      claimedAt: null,
    });
    const p = calculateProgress(campaign, DEADLINE);
    expect(p.status).toBe("funded");
    expect(p.canPledge).toBe(false);
    expect(p.canClaim).toBe(true);
    expect(p.canRefund).toBe(false);
  });

  it("funded: over target after deadline, unclaimed — canClaim", () => {
    const campaign = putCampaign({
      targetAmount: T,
      pledgedAmount: 150,
      deadline: DEADLINE,
      claimedAt: null,
    });
    const p = calculateProgress(campaign, DEADLINE + 1);
    expect(p.status).toBe("funded");
    expect(p.canPledge).toBe(false);
    expect(p.canClaim).toBe(true);
    expect(p.canRefund).toBe(false);
  });

  it("claimed: all actions false regardless of time and funds", () => {
    const claimedAt = DEADLINE - 5000;
    const campaign = putCampaign({
      targetAmount: T,
      pledgedAmount: T,
      deadline: DEADLINE,
      claimedAt,
    });
    const p = calculateProgress(campaign, DEADLINE);
    expect(p.status).toBe("claimed");
    expect(p.canPledge).toBe(false);
    expect(p.canClaim).toBe(false);
    expect(p.canRefund).toBe(false);
  });

  it("claimed: still claimed when underfunded (edge: bad data)", () => {
    const campaign = putCampaign({
      targetAmount: T,
      pledgedAmount: 20,
      deadline: DEADLINE,
      claimedAt: DEADLINE - 1,
    });
    const p = calculateProgress(campaign, DEADLINE + 100);
    expect(p.status).toBe("claimed");
    expect(p.canPledge).toBe(false);
    expect(p.canClaim).toBe(false);
    expect(p.canRefund).toBe(false);
  });

  it("at exact deadline, one below target: failed, not claim", () => {
    const campaign = putCampaign({
      targetAmount: T,
      pledgedAmount: 99.99,
      deadline: DEADLINE,
      claimedAt: null,
    });
    const p = calculateProgress(campaign, DEADLINE);
    expect(p.status).toBe("failed");
    expect(p.canRefund).toBe(true);
    expect(p.canClaim).toBe(false);
  });

  it("exposes percentFunded, remainingAmount, and hoursLeft for open", () => {
    const campaign = putCampaign({
      targetAmount: T,
      pledgedAmount: 25,
      deadline: DEADLINE,
      claimedAt: null,
    });
    const p = calculateProgress(campaign, DEADLINE - 7200);
    expect(p.percentFunded).toBe(25);
    expect(p.remainingAmount).toBe(75);
    expect(p.hoursLeft).toBe(2);
  });

  it("pledgeCount includes active pledges, excludes refunded", () => {
    const campaign = putCampaign({
      targetAmount: T,
      pledgedAmount: 0,
      deadline: DEADLINE,
      claimedAt: null,
    });
    const db = getDb();
    const t = 10;
    db.prepare(
      `INSERT INTO pledges (campaign_id, contributor, amount, created_at, refunded_at, transaction_hash)
       VALUES (?, ?, ?, ?, NULL, NULL)`,
    ).run(campaign.id, CONTRIBUTOR, 1, t);
    db.prepare(
      `INSERT INTO pledges (campaign_id, contributor, amount, created_at, refunded_at, transaction_hash)
       VALUES (?, ?, ?, ?, ?, NULL)`,
    ).run(campaign.id, CONTRIBUTOR, 1, t + 1, t);
    const c = getCampaign(campaign.id)!;
    const p = calculateProgress(c, DEADLINE - 1);
    expect(p.pledgeCount).toBe(1);
  });
});

