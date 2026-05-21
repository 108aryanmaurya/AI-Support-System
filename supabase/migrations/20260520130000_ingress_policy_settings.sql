-- Phase 4 Sprint 3: ingress policy in organizations.settings.ingress (JSONB).
-- See shared/src/ingressPolicy.js and server/src/services/ingress/ingressPolicy.service.js
--
-- Spam suspected conversations: metadata.ingress.spam_suspected = true (visible in Spam inbox filter).
-- Messages store metadata.content_hash for duplicate detection within duplicate_window_minutes.

comment on column public.organizations.settings is
  'Org JSON: ai, automation, workflow, ingress (spam/duplicate policy), etc.';
