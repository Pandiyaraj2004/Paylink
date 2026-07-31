import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getOrderReceipt,
  submitRating,
  listMerchantOrders,
  fulfilOrder,
  type OrderReceiptResponse,
  type SubmitRatingPayload,
  type ListMerchantOrdersParams,
  type ListMerchantOrdersResponse,
} from '@/api/orders';
import { createRefund, type CreateRefundPayload } from '@/api/payments';
import { useAuth } from '@/hooks/useAuth';

/**
 * Fetches `GET /api/orders/:id/receipt` (master-doc.md Section 15.3, 22.7)
 * for the Receipt page. `retry: false` — an invalid/unguessable orderId
 * (404 ORDER_NOT_FOUND) should surface the failure state promptly rather
 * than silently retrying a request that can never succeed.
 *
 * The real Surfboard flow is asynchronous (Section 23): the customer can
 * land here before the webhook that actually settles `order.status` has
 * arrived, so this polls every 2s while the order is still `pending` and
 * stops as soon as it reaches a terminal status (`paid`/`failed`/
 * `cancelled`/`refunded`/`partially_refunded`).
 */
export function useOrderReceipt(orderId: string | undefined) {
  return useQuery<OrderReceiptResponse>({
    queryKey: ['order-receipt', orderId],
    queryFn: () => getOrderReceipt(orderId as string),
    enabled: !!orderId,
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      return !data || data.status === 'pending' ? 1000 : false;
    },
  });
}

/** POST /api/orders/:id/rating (master-doc.md Section 15.3) — one rating per order. */
export function useSubmitRating(orderId: string | undefined) {
  return useMutation({
    mutationFn: (payload: SubmitRatingPayload) => submitRating(orderId as string, payload),
  });
}

/**
 * GET /api/merchants/:id/orders (master-doc.md Section 22.4/14.4) — backs
 * the Orders/Transactions/Refunds tabs (Section 14.4), which all share this
 * one query rather than three separate endpoints. Short `staleTime` since a
 * merchant expects a just-created refund/fulfilment to show up promptly.
 */
export function useMerchantOrders(params: ListMerchantOrdersParams = {}) {
  const { merchantId } = useAuth();
  return useQuery<ListMerchantOrdersResponse>({
    queryKey: ['merchant-orders', merchantId, params],
    queryFn: () => listMerchantOrders(merchantId as string, params),
    enabled: !!merchantId,
    staleTime: 10_000,
  });
}

/** POST /api/payments/:id/refund (master-doc.md Section 22.6) — invalidates the shared orders list on success. */
export function useCreateRefund() {
  const queryClient = useQueryClient();
  const { merchantId } = useAuth();
  return useMutation({
    mutationFn: ({ orderId, payload }: { orderId: string; payload: CreateRefundPayload }) =>
      createRefund(orderId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['merchant-orders', merchantId] }),
  });
}

/** PATCH /api/orders/:id/fulfil (master-doc.md Section 22.4). */
export function useFulfilOrder() {
  const queryClient = useQueryClient();
  const { merchantId } = useAuth();
  return useMutation({
    mutationFn: (orderId: string) => fulfilOrder(orderId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['merchant-orders', merchantId] }),
  });
}
