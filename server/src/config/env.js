import dotenv from 'dotenv';
import { resolveLlmConfig } from '../services/ai/llm.config.js';

dotenv.config();

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

function loadEnv() {
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. Copy server/.env.example to server/.env and fill in values.`,
    );
  }

  const origins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
    : ['http://localhost:5173'];

  const mockRaw = process.env.EMAIL_PROVIDER_MOCK?.trim().toLowerCase();
  let emailProvider = (process.env.EMAIL_PROVIDER || 'resend').trim().toLowerCase();
  let emailProviderMock =
    mockRaw === 'true' || mockRaw === '1' || mockRaw === 'yes';

  if (emailProvider === 'mock') {
    emailProviderMock = true;
    emailProvider = 'mock';
  }

  const publicAppUrl = (process.env.PUBLIC_APP_URL || origins[0] || 'http://localhost:5173').replace(
    /\/$/,
    '',
  );

  const resendApiKey = process.env.RESEND_API_KEY?.trim() || '';
  const notificationResendApiKey =
    process.env.NOTIFICATION_RESEND_API_KEY?.trim() || resendApiKey || '';
  const notificationEmailFrom = process.env.NOTIFICATION_EMAIL_FROM?.trim() || '';
  const resendWebhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim() || '';
  const secretsEncryptionKey = process.env.SECRETS_ENCRYPTION_KEY?.trim() || '';
  const resendInboundDomain = process.env.RESEND_INBOUND_DOMAIN?.trim().toLowerCase() || '';
  const resendInboundAddress = process.env.RESEND_INBOUND_ADDRESS?.trim().toLowerCase() || '';

  const llmMaxPromptChars = Number(process.env.LLM_MAX_PROMPT_CHARS) || 32_000;

  const llm = resolveLlmConfig();

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT) || 3001,
    automationCronSecret: process.env.AUTOMATION_CRON_SECRET?.trim() || '',
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    corsOrigins: origins,
    /** Browser URL used in invite emails / mock logs (e.g. `${publicAppUrl}/invite?token=…`). */
    publicAppUrl,
    emailProvider,
    /** When true: simulate successful outbound email without HTTP to Resend */
    emailProviderMock,
    /** Platform Resend API key (domain onboarding, inbound body fetch fallback). */
    resendApiKey,
    /** Optional Resend API key for internal emails (e.g. conversation assignment). Channel replies use integration config instead. */
    notificationResendApiKey,
    /** Verified sender for NOTIFICATION_RESEND_API_KEY (e.g. onboarding@resend.dev or your domain). */
    notificationEmailFrom,
    /** Svix signing secret for POST /api/webhooks/resend (whsec_… from Resend dashboard). */
    resendWebhookSecret,
    /** Optional 32+ char secret to encrypt per-org API keys at rest (AES-256-GCM). */
    secretsEncryptionKey,
    resendInboundDomain,
    resendInboundAddress,
    /** Resolved LLM provider config (see LLM_PROVIDER in .env.example). */
    llm,
    /** @deprecated Use env.llm.apiKey */
    llmApiKey: llm.apiKey,
    /** @deprecated Use env.llm.model */
    llmModel: llm.model,
    /** @deprecated Use env.llm.baseUrl */
    llmBaseUrl: llm.baseUrl,
    /** @deprecated Use env.llm.timeoutMs */
    llmTimeoutMs: llm.timeoutMs,
    /** @deprecated Use env.llm.maxOutputTokens */
    llmMaxOutputTokens: llm.maxOutputTokens,
    llmMaxPromptChars:
      Number.isFinite(llmMaxPromptChars) && llmMaxPromptChars > 0
        ? Math.min(llmMaxPromptChars, 200_000)
        : 32_000,
  };
}

export const env = loadEnv();
