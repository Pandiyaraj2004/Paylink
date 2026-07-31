import { apiClient } from './client';

/**
 * POST /api/disputes request body (backend `dispute.service.js`). Not
 * broken out under master-doc.md Section 22's API docs (no dedicated
 * "Disputes" subsection there — only referenced by name in Sections 15.4
 * and 16.4), so this shape is the backend's own design: `orderId` is
 * optional (Section 15.4 doesn't mandate one), `merchantId` lets the
 * Support page attribute a complaint to its store even with no order
 * reference (see Support.tsx, which reads it off the `/pay/:slug` public
 * page it's nested under).
 */
export interface CreateDisputePayload {
  orderId?: string;
  merchantId?: string;
  name?: string;
  email?: string;
  message: string;
}

export interface CreateDisputeResponse {
  disputeId: string;
  status: string;
}

/** POST /api/disputes — Public, no auth (master-doc.md Section 15.4). */
export async function createDispute(payload: CreateDisputePayload): Promise<CreateDisputeResponse> {
  const { data } = await apiClient.post<CreateDisputeResponse>('/disputes', payload);
  return data;
}
