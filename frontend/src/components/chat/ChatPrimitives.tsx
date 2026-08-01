import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Shared chat UI primitives used by both the AI Setup Concierge
 * (master-doc.md Section 14.2/10.1) and the Dashboard's AI Earnings
 * Assistant (Section 14.3/10.2) — factored out so the two chat surfaces
 * don't diverge. Purely presentational; each caller keeps its own message
 * state and API calls.
 */

/** Glowing/pulsing AI avatar orb. Pulses faster while "thinking". */
export function AiOrb({ thinking, size = 10 }: { thinking: boolean; size?: 8 | 10 }) {
  const reduceMotion = useReducedMotion();
  const dim = size === 8 ? 'h-8 w-8' : 'h-10 w-10';
  const iconDim = size === 8 ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <div className={cn('relative shrink-0', dim)}>
      {!reduceMotion && (
        <motion.div
          className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-accent blur-md"
          animate={{
            opacity: thinking ? [0.5, 1, 0.5] : [0.3, 0.55, 0.3],
            scale: thinking ? [1, 1.25, 1] : [1, 1.08, 1],
          }}
          transition={{ duration: thinking ? 1.1 : 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <div className={cn('relative flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent', dim)}>
        <Sparkles className={cn(iconDim, 'text-white')} />
      </div>
    </div>
  );
}

/** Three-dot "typing" indicator, bounces each dot with a stagger delay. */
export function TypingIndicator() {
  const reduceMotion = useReducedMotion();
  return (
    <div className="flex items-center gap-1 self-start rounded-lg bg-bg px-3 py-2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-text-secondary"
          animate={reduceMotion ? undefined : { y: [0, -4, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

/**
 * Renders `**bold**` markdown segments as real `<strong>` text. The AI
 * providers naturally format replies with light markdown (see
 * ai.service.js's system prompts); this is a display-only concern — the
 * backend keeps returning plain text, nothing about the API/response shape
 * changes. Deliberately minimal (bold only) rather than pulling in a full
 * markdown renderer for a chat bubble.
 */
function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

/**
 * A single chat message bubble. For assistant messages, reveals the text
 * client-side over a short interval for a "streaming" feel — the backend
 * always returns the complete reply (Section 26.7 fallback behavior is
 * unaffected), this is a client-only polish effect, never partial/fabricated
 * content.
 */
export function ChatBubble({
  role,
  content,
  muted,
}: {
  role: 'user' | 'assistant';
  content: string;
  muted?: boolean;
}) {
  const isUser = role === 'user';
  const reduceMotion = useReducedMotion();
  const [revealed, setRevealed] = useState(isUser || reduceMotion ? content : '');

  useEffect(() => {
    if (isUser || reduceMotion) {
      setRevealed(content);
      return;
    }
    let i = 0;
    const full = content;
    setRevealed('');
    const interval = setInterval(() => {
      i += 3;
      setRevealed(full.slice(0, i));
      if (i >= full.length) clearInterval(interval);
    }, 12);
    return () => clearInterval(interval);
  }, [content, isUser, reduceMotion]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        'max-w-[85%] rounded-lg px-3 py-2 text-body-m',
        isUser
          ? 'self-end bg-primary text-white'
          : muted
          ? 'self-start border border-border bg-bg text-text-secondary'
          : 'self-start bg-bg text-text-primary'
      )}
    >
      {isUser ? revealed : renderInlineMarkdown(revealed)}
    </motion.div>
  );
}
