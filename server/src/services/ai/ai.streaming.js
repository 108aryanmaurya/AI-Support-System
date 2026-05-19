/** Reserved for Phase 3+ SSE suggest-reply. See docs/ai-features/ai-streaming.md */
export function isAiStreamingEnabled() {
  const v = String(process.env.AI_STREAMING_ENABLED ?? '').trim().toLowerCase();
  return v === 'true' || v === '1';
}
