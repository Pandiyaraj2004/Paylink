import { useMutation } from '@tanstack/react-query';
import { createDispute, type CreateDisputePayload } from '@/api/disputes';

/** POST /api/disputes (master-doc.md Section 15.4) — the Support page's "Contact PayLink Support" form. */
export function useCreateDispute() {
  return useMutation({
    mutationFn: (payload: CreateDisputePayload) => createDispute(payload),
  });
}
