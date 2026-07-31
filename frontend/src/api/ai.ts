import { apiClient } from './client';

export interface AiConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface DraftCatalogItem {
  name: string;
  price: number;
  currency: string;
  isCustomAllowed: boolean;
}

export interface SetupConciergeResponse {
  reply: string;
  draftCatalog: DraftCatalogItem[];
  clarifyingQuestion: string | null;
}

/**
 * POST /api/ai/setup-concierge (master-doc.md Section 22.8). Throws on
 * network/HTTP error — callers are responsible for treating a 503
 * `AI_UNAVAILABLE` response as the graceful manual-entry fallback path
 * (Section 14.2 States).
 */
export async function setupConcierge(
  message: string,
  conversationHistory?: AiConversationMessage[]
): Promise<SetupConciergeResponse> {
  const { data } = await apiClient.post<SetupConciergeResponse>('/ai/setup-concierge', {
    message,
    conversationHistory,
  });
  return data;
}

export interface EarningsAssistantResponse {
  /** Always populated — even when `available` is false, this is the specific graceful message to show (never a generic fallback the backend didn't actually send). */
  answer: string;
  available: boolean;
}

/** POST /api/ai/earnings-assistant (Section 22.8). */
export async function askEarningsAssistant(question: string): Promise<EarningsAssistantResponse> {
  const { data } = await apiClient.post<EarningsAssistantResponse>('/ai/earnings-assistant', { question });
  return data;
}
