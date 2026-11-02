import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { z } from "zod";

const rootEnvPath = resolve(process.cwd(), "../../.env");
config({ path: existsSync(rootEnvPath) ? rootEnvPath : resolve(process.cwd(), ".env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().default("deepseek-flash"),
  TMDB_API_READ_ACCESS_TOKEN: z.string().optional(),
  MEDIA_PUBLIC_DNS: z.string().optional(),
  MEDIA_IMPORT_TOKEN_SECRET: z.string().min(32).optional(),
  OPEN_LIBRARY_USER_AGENT: z.string().default("PersonalWorkbench/0.1")
});

export const env = envSchema.parse(process.env);
