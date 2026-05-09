/**
 * Inbox Realtime — tuning knobs (WebSocket sync + polling fallback).
 *
 * Scaling note (future): Supabase Realtime opens one WebSocket per client; each
 * `postgres_changes` subscription adds filter load on the connection. At high scale:
 * - Prefer fewer channels per user (this inbox uses one channel per org subscription).
 * - Consider fan-out via Edge Functions / dedicated worker if you exceed plan limits.
 * - Monitor Dashboard → Reports → Realtime for connection and message rates.
 */
export const REALTIME_INBOX = {
  /** Exponential backoff base (ms); capped by maxReconnectDelayMs */
  reconnectBaseDelayMs: 1500,
  /** Cap backoff so reconnects keep trying on flaky networks */
  maxReconnectDelayMs: 30_000,
  /** Polling fallback when WS may have dropped events (30–60s range) */
  periodicSyncIntervalMs: 45_000,
  /** Jitter 0–5s on periodic sync to avoid thundering herd */
  periodicSyncJitterMs: 5000,
  /** Drift threshold: if server last_message_at is this many ms ahead of client, resync */
  conversationDriftMs: 2000,
}
