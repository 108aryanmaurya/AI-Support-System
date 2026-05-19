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

  const notificationResendApiKey =
    process.env.NOTIFICATION_RESEND_API_KEY?.trim() || process.env.RESEND_API_KEY?.trim() || '';
  const notificationEmailFrom = process.env.NOTIFICATION_EMAIL_FROM?.trim() || '';

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
    /** Optional Resend API key for internal emails (e.g. conversation assignment). Channel replies use integration config instead. */
    notificationResendApiKey,
    /** Verified sender for NOTIFICATION_RESEND_API_KEY (e.g. onboarding@resend.dev or your domain). */
    notificationEmailFrom,
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
