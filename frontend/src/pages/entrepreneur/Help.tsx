import { useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronDown, HelpCircle, Mail, Search, SearchX } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Skeleton } from '@/components/Skeleton';
import { useHelpArticles } from '@/hooks/useHelp';

// Falls back to a sane default so the Contact Support button never ends up
// with an empty/broken mailto: href in a dev environment where
// VITE_SUPPORT_EMAIL hasn't been set (frontend/.env.example).
const SUPPORT_EMAIL = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) || 'support@paylink.app';

/**
 * Help page (master-doc.md Section 14.13) — self-serve support for the
 * entrepreneur: a searchable FAQ accordion plus a "Contact Support" way out
 * for whatever the FAQ doesn't cover. Deliberately static/read-only per
 * Section 14.13's own Validation & Business Logic line — there's no form to
 * submit here, no ticket to create, just content and a mailto: escape hatch.
 * This is NOT the same page as Section 15.3's public-facing customer Support
 * page — that's a separate, unauthenticated surface for the entrepreneur's
 * own customers, not for the entrepreneur themselves.
 */
export default function Help() {
  const reduceMotion = useReducedMotion();
  const { data: articles, isLoading, isError, refetch } = useHelpArticles();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredArticles = useMemo(() => {
    const all = articles ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return all;
    return all.filter(
      (article) =>
        article.question.toLowerCase().includes(query) ||
        article.answer.toLowerCase().includes(query) ||
        article.category.toLowerCase().includes(query)
    );
  }, [articles, search]);

  const toggleExpanded = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (isLoading) {
    return (
      <AppShell>
        <h1 className="font-display text-h1 font-semibold text-text-primary">Help</h1>
        <p className="mt-1 text-body-m text-text-secondary">
          Answers to common questions, plus how to reach us for anything else.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell>
        <h1 className="font-display text-h1 font-semibold text-text-primary">Help</h1>
        <Card className="mt-6 flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-body-m text-text-secondary">Could not load help articles right now.</p>
          <Button variant="ghost" onClick={() => refetch()}>
            Try again
          </Button>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="font-display text-h1 font-semibold text-text-primary">Help</h1>
      <p className="mt-1 text-body-m text-text-secondary">
        Answers to common questions, plus how to reach us for anything else.
      </p>

      <div className="relative mt-6 max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search FAQs — e.g. refunds, payouts, store link…"
          className="pl-9"
          aria-label="Search help articles"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.2 }}
        className="mt-6"
      >
        {(articles ?? []).length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <HelpCircle className="h-7 w-7 text-primary" />
            </div>
            <p className="text-body-l font-medium text-text-primary">No help articles available right now.</p>
          </Card>
        ) : filteredArticles.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <SearchX className="h-7 w-7 text-primary" />
            </div>
            <p className="text-body-l font-medium text-text-primary">No articles match "{search}"</p>
            <p className="text-body-m text-text-secondary">
              Try a different search term, or contact support below.
            </p>
            <Button variant="ghost" onClick={() => setSearch('')}>
              Clear search
            </Button>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredArticles.map((article, i) => {
              const isOpen = expandedId === article.id;
              return (
                <motion.div
                  key={article.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: reduceMotion ? 0 : Math.min(i, 10) * 0.02 }}
                >
                  <Card className="p-0">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(article.id)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                    >
                      <div className="min-w-0">
                        <span className="mb-1 inline-block rounded-full bg-bg px-2 py-0.5 text-caption text-text-secondary">
                          {article.category}
                        </span>
                        <p className="text-body-m font-medium text-text-primary">{article.question}</p>
                      </div>
                      <ChevronDown
                        className={
                          isOpen
                            ? 'h-4 w-4 shrink-0 rotate-180 text-text-secondary transition-transform duration-200'
                            : 'h-4 w-4 shrink-0 text-text-secondary transition-transform duration-200'
                        }
                        aria-hidden
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeInOut' }}
                          className="overflow-hidden"
                        >
                          <p className="px-5 pb-4 text-body-m text-text-secondary">{article.answer}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      <Card className="mt-6 flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-body-l font-medium text-text-primary">Still need a hand?</p>
        <p className="max-w-md text-body-m text-text-secondary">
          If none of the above covers it, reach out and a real person will get back to you.
        </p>
        <a href={`mailto:${SUPPORT_EMAIL}`}>
          <Button variant="secondary">
            <Mail className="h-4 w-4" aria-hidden /> Contact Support
          </Button>
        </a>
      </Card>
    </AppShell>
  );
}
