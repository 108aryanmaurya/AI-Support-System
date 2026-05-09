import dotenv from 'dotenv';

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

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT) || 3001,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    corsOrigins: origins,
    emailProvider,
    /** When true: simulate successful outbound email without HTTP to Resend */
    emailProviderMock,
  };
}

export const env = loadEnv();
