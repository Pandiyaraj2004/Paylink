import { apiClient } from './client';

/**
 * A single FAQ entry as returned by GET /api/help/articles (master-doc.md
 * Section 14.13). `category` groups related articles (e.g. "Payments &
 * Payouts", "Refunds") for the Help page's accordion — the backend owns the
 * exact set of categories, this is deliberately typed as a plain string
 * rather than a union so the frontend never needs a matching update just
 * because a new category is added server-side.
 */
export interface HelpArticle {
  id: string;
  question: string;
  answer: string;
  category: string;
}

interface ListHelpArticlesResponse {
  articles: HelpArticle[];
}

/**
 * GET /api/help/articles (master-doc.md Section 14.13) — static FAQ content
 * for the entrepreneur Help page. Authenticated entrepreneur only; the
 * public-facing customer Support page (Section 15.3) is a separate surface
 * and doesn't call this endpoint.
 */
export async function getHelpArticles(): Promise<HelpArticle[]> {
  const { data } = await apiClient.get<ListHelpArticlesResponse>('/help/articles');
  return data.articles;
}
