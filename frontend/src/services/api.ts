import {
  Campaign,
  CampaignEvent,
  CreateCampaignPayload,
  CreatePledgePayload,
  OpenIssue,
} from "../types/campaign";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: {
      code: string;
      message: string;
      details?: Array<{ field: string; message: string }>;
      requestId?: string;
    };
  };

  if (!response.ok) {
    const errorMsg = body.error?.message ?? "Unexpected API error";
    const error = new Error(errorMsg);
    // Attach extra metadata if available
    if (body.error) {
      (error as any).code = body.error.code;
      (error as any).details = body.error.details;
      (error as any).requestId = body.error.requestId;
    }
    throw error;
  }
  return body;
}

export async function listCampaigns(): Promise<Campaign[]> {
  const response = await fetch(`${API_BASE}/campaigns`);
  const body = await parseResponse<{ data: Campaign[] }>(response);
  return body.data;
}

export async function getCampaign(campaignId: string): Promise<Campaign> {
  const response = await fetch(`${API_BASE}/campaigns/${campaignId}`);
  const body = await parseResponse<{ data: Campaign }>(response);
  return body.data;
}

export async function createCampaign(payload: CreateCampaignPayload): Promise<Campaign> {
  const response = await fetch(`${API_BASE}/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseResponse<{ data: Campaign }>(response);
  return body.data;
}

export async function addPledge(
  campaignId: string,
  payload: CreatePledgePayload,
): Promise<Campaign> {
  const response = await fetch(`${API_BASE}/campaigns/${campaignId}/pledges`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseResponse<{ data: Campaign }>(response);
  return body.data;
}

export async function claimCampaign(campaignId: string, creator: string): Promise<Campaign> {
  const response = await fetch(`${API_BASE}/campaigns/${campaignId}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creator }),
  });
  const body = await parseResponse<{ data: Campaign }>(response);
  return body.data;
}

export async function refundCampaign(
  campaignId: string,
  contributor: string,
): Promise<Campaign> {
  const response = await fetch(`${API_BASE}/campaigns/${campaignId}/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contributor }),
  });
  const body = await parseResponse<{ data: Campaign }>(response);
  return body.data;
}

export async function getCampaignHistory(campaignId: string): Promise<CampaignEvent[]> {
  const response = await fetch(`${API_BASE}/campaigns/${campaignId}/history`);
  const body = await parseResponse<{ data: CampaignEvent[] }>(response);
  return body.data;
}

export async function listOpenIssues(): Promise<OpenIssue[]> {
  const response = await fetch(`${API_BASE}/open-issues`);
  const body = await parseResponse<{ data: OpenIssue[] }>(response);
  return body.data;
}
