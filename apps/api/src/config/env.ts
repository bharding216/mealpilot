import 'dotenv/config';

export const env = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  host: process.env.HOST ?? '0.0.0.0',

  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',

  openaiApiKey: process.env.OPENAI_API_KEY ?? '',

  hebSessionToken: process.env.HEB_SESSION_TOKEN ?? '',

  nodeEnv: process.env.NODE_ENV ?? 'development',
} as const;

export function validateEnv(): void {
  const required: (keyof typeof env)[] = [
    'supabaseUrl',
    'supabaseServiceRoleKey',
    'openaiApiKey',
  ];

  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    console.warn(
      `⚠️  Missing environment variables: ${missing.join(', ')}. Some features may not work.`
    );
  }
}
